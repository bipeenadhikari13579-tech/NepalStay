// Calendar and pricing endpoints, shared by the admin console and the Host Desk.
// `findListing(req)` returns the listing the caller is allowed to manage, or null.
import Booking from '../models/Booking.js'
import { MAX_NIGHTS, addDays, availabilityProblem, isDate, nightPrice, quote, rulesOf, todayInNepal } from './pricing.js'

const MAX_RANGES = 60

const wholeNumber = (v, { min = 0, max = Infinity } = {}) => {
  const n = Number(v)
  return Number.isInteger(n) && n >= min && n <= max ? n : null
}

/** Validates a list of { from, to, ... } date ranges. Returns { ranges } or { error }. */
function readRanges(raw, readExtra) {
  if (!Array.isArray(raw)) return { ranges: [] }
  if (raw.length > MAX_RANGES) return { error: `At most ${MAX_RANGES} date ranges are allowed.` }
  const ranges = []
  for (const r of raw) {
    if (!isDate(r?.from) || !isDate(r?.to)) return { error: 'Each date range needs a valid start and end date.' }
    if (r.to < r.from) return { error: 'A date range cannot end before it starts.' }
    const extra = readExtra(r)
    if (extra.error) return extra
    ranges.push({ from: r.from, to: r.to, ...extra.fields })
  }
  ranges.sort((a, b) => a.from.localeCompare(b.from))
  return { ranges }
}

export function mountListingTools(router, findListing, onChange = () => {}) {
  /** Month view: one entry per day with its status and nightly price. */
  router.get('/listings/:id/calendar', async (req, res, next) => {
    try {
      const listing = await findListing(req)
      if (!listing) return res.status(404).json({ message: 'Listing not found.' })

      const today = todayInNepal()
      const month = /^\d{4}-\d{2}$/.test(req.query.month ?? '') ? req.query.month : today.slice(0, 7)
      const first = `${month}-01`
      const [y, m] = month.split('-').map(Number)
      const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
      const afterLast = addDays(first, daysInMonth)

      const bookings = await Booking.find({
        listingId: listing._id,
        status: { $in: ['pending', 'confirmed'] },
        checkIn: { $lt: afterLast },
        checkOut: { $gt: first },
      }).select('guestName checkIn checkOut status guestsCount bookingCode')

      const blocked = listing.availability?.blocked ?? []
      const days = Array.from({ length: daysInMonth }, (_, i) => {
        const date = addDays(first, i)
        const booking = bookings.find((b) => b.checkIn <= date && b.checkOut > date)
        const block = blocked.find((b) => b.from <= date && b.to >= date)
        const price = nightPrice(listing, date)
        return {
          date,
          status: booking ? (booking.status === 'confirmed' ? 'booked' : 'requested') : block ? 'blocked' : 'free',
          guest: booking?.guestName ?? null,
          bookingId: booking?._id ?? null,
          note: block?.note ?? null,
          priceNPR: price.priceNPR,
          priceKind: price.kind,
          past: date < today,
        }
      })

      res.json({
        month,
        today,
        days,
        listing: {
          id: listing._id,
          title: listing.title,
          status: listing.status,
          pricePerNightNPR: listing.pricePerNightNPR,
          pricePerNightUSD: listing.pricePerNightUSD ?? null,
        },
        rules: rulesOf(listing),
        blocked,
        pricing: listing.pricing ?? {},
      })
    } catch (err) {
      next(err)
    }
  })

  /** Stay-length rules and blocked dates. */
  router.patch('/listings/:id/availability', async (req, res, next) => {
    try {
      const listing = await findListing(req)
      if (!listing) return res.status(404).json({ message: 'Listing not found.' })

      const body = req.body ?? {}
      const minNights = wholeNumber(body.minNights, { min: 1, max: MAX_NIGHTS })
      const maxNights = wholeNumber(body.maxNights, { min: 1, max: MAX_NIGHTS })
      const advanceNoticeDays = wholeNumber(body.advanceNoticeDays, { min: 0, max: 60 })
      const errors = {}
      if (minNights === null) errors.minNights = `Enter a whole number from 1 to ${MAX_NIGHTS}.`
      if (maxNights === null) errors.maxNights = `Enter a whole number from 1 to ${MAX_NIGHTS}.`
      else if (minNights !== null && maxNights < minNights) errors.maxNights = 'Cannot be less than the minimum stay.'
      if (advanceNoticeDays === null) errors.advanceNoticeDays = 'Enter a whole number from 0 to 60.'
      if (Object.keys(errors).length)
        return res.status(400).json({ message: 'Please fix the highlighted fields.', errors })

      const { ranges, error } = readRanges(body.blocked, (r) => ({
        fields: { note: String(r.note ?? '').trim().slice(0, 120) },
      }))
      if (error) return res.status(400).json({ message: error })

      // Dates with a guest request or confirmed booking cannot be blocked.
      for (const r of ranges) {
        const clash = await Booking.findOne({
          listingId: listing._id,
          status: { $in: ['pending', 'confirmed'] },
          checkIn: { $lte: r.to },
          checkOut: { $gt: r.from },
        }).select('guestName status')
        if (clash) {
          return res.status(409).json({
            message: `${r.from} to ${r.to} overlaps a ${clash.status === 'confirmed' ? 'confirmed booking' : 'booking request'} from ${clash.guestName || 'a guest'}. Decline or cancel it first.`,
          })
        }
      }

      listing.availability = { minNights, maxNights, advanceNoticeDays, blocked: ranges }
      await listing.save()
      await onChange(req, listing, 'updated calendar rules')
      res.json({ rules: rulesOf(listing), blocked: listing.availability.blocked })
    } catch (err) {
      next(err)
    }
  })

  /** Base rate, weekend rate, discounts and special date prices. */
  router.patch('/listings/:id/pricing', async (req, res, next) => {
    try {
      const listing = await findListing(req)
      if (!listing) return res.status(404).json({ message: 'Listing not found.' })

      const body = req.body ?? {}
      const blank = (v) => v === '' || v === null || v === undefined
      const errors = {}
      const money = (key, { required = false } = {}) => {
        if (blank(body[key])) {
          if (required) errors[key] = 'Enter a price.'
          return 0
        }
        const n = wholeNumber(body[key], { min: required ? 1 : 0, max: 10_000_000 })
        if (n === null) errors[key] = 'Enter a whole number.'
        return n ?? 0
      }
      const pct = (key) => {
        if (blank(body[key])) return 0
        const n = wholeNumber(body[key], { min: 0, max: 90 })
        if (n === null) errors[key] = 'Enter a percentage from 0 to 90.'
        return n ?? 0
      }

      const pricePerNightNPR = money('pricePerNightNPR', { required: true })
      const pricePerNightUSD = money('pricePerNightUSD')
      const weekendNPR = money('weekendNPR')
      const weeklyDiscountPct = pct('weeklyDiscountPct')
      const monthlyDiscountPct = pct('monthlyDiscountPct')
      const earlyBirdPct = pct('earlyBirdPct')
      let earlyBirdDays = 0
      if (earlyBirdPct > 0) {
        earlyBirdDays = wholeNumber(body.earlyBirdDays, { min: 1, max: 365 }) ?? 0
        if (!earlyBirdDays) errors.earlyBirdDays = 'Enter how many days ahead, from 1 to 365.'
      }
      if (Object.keys(errors).length)
        return res.status(400).json({ message: 'Please fix the highlighted fields.', errors })

      const { ranges, error } = readRanges(body.custom, (r) => {
        const priceNPR = wholeNumber(r.priceNPR, { min: 1, max: 10_000_000 })
        if (priceNPR === null) return { error: 'Each special price needs a nightly price in NPR.' }
        return { fields: { priceNPR, label: String(r.label ?? '').trim().slice(0, 60) } }
      })
      if (error) return res.status(400).json({ message: error })

      listing.pricePerNightNPR = pricePerNightNPR
      listing.pricePerNightUSD = pricePerNightUSD || undefined
      listing.pricing = { weekendNPR, weeklyDiscountPct, monthlyDiscountPct, earlyBirdPct, earlyBirdDays, custom: ranges }
      await listing.save()
      await onChange(req, listing, 'updated pricing')
      res.json({
        pricePerNightNPR: listing.pricePerNightNPR,
        pricePerNightUSD: listing.pricePerNightUSD ?? null,
        pricing: listing.pricing,
      })
    } catch (err) {
      next(err)
    }
  })

  /** What a guest would pay for given dates, with the saved settings. */
  router.get('/listings/:id/quote', async (req, res, next) => {
    try {
      const listing = await findListing(req)
      if (!listing) return res.status(404).json({ message: 'Listing not found.' })
      const { checkIn, checkOut } = req.query
      if (!isDate(checkIn) || !isDate(checkOut) || checkOut <= checkIn)
        return res.status(400).json({ message: 'Choose a check-in date and a later check-out date.' })
      if ((Date.parse(checkOut) - Date.parse(checkIn)) / 86400000 > 60)
        return res.status(400).json({ message: 'Choose a range of 60 nights or fewer.' })
      res.json({
        quote: quote(listing, checkIn, checkOut),
        problem: availabilityProblem(listing, checkIn, checkOut)?.message ?? null,
      })
    } catch (err) {
      next(err)
    }
  })
}
