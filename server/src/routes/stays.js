// Traveler-facing API: browse published stays, request a booking, manage trips, saved stays.
import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import Listing from '../models/Listing.js'
import Booking from '../models/Booking.js'
import User from '../models/User.js'
import { escapeRegex } from '../lib/listings.js'
import { availabilityProblem, isDate, publicDiscounts, quote, rulesOf } from '../lib/pricing.js'

const router = Router()
router.use(requireAuth)

const LIVE = { status: 'published' }
const CARD_FIELDS =
  'title tagline location region address stayType images pricePerNightNPR pricePerNightUSD rating reviewsCount maxGuests bedrooms featured superhost verifiedHeritage amenities host.name ownerId'
const NPR_PER_USD = 135 // used only when a listing has no USD price of its own
const MAX_NIGHTS = 30
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const todayInNepal = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kathmandu' })
const usdPrice = (l) => l.pricePerNightUSD || Math.round(l.pricePerNightNPR / NPR_PER_USD)
const nightsBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000)

/** Owner ids (of the given listings) whose host account passed KYC. */
async function verifiedOwners(listings) {
  const ids = [...new Set(listings.map((l) => l.ownerId).filter(Boolean))]
  if (!ids.length) return new Set()
  const users = await User.find({ _id: { $in: ids }, kycStatus: 'approved' }).select('_id')
  return new Set(users.map((u) => u._id.toString()))
}

const toCard = (l, verified = new Set()) => ({
  id: l._id,
  title: l.title,
  tagline: l.tagline,
  location: l.location,
  region: l.region,
  address: l.address,
  stayType: l.stayType,
  image: l.images?.[0] ?? null,
  priceNPR: l.pricePerNightNPR,
  priceUSD: usdPrice(l),
  rating: l.rating ?? null,
  reviewsCount: l.reviewsCount ?? 0,
  maxGuests: l.maxGuests,
  bedrooms: l.bedrooms,
  featured: !!l.featured,
  superhost: !!l.superhost,
  highlight: l.amenities?.[0] ?? null,
  hostName: l.host?.name ?? null,
  hostVerified: verified.has(l.ownerId),
})

/**
 * Checks requested dates and guest count against a listing.
 * Returns { errors } or { nights }. `ignoreBookingId` skips the booking being changed.
 */
async function checkStayRequest(listing, { checkIn, checkOut, guests }, ignoreBookingId) {
  const errors = {}
  const validDate = (d) => typeof d === 'string' && DATE_RE.test(d) && !Number.isNaN(Date.parse(d))

  if (!validDate(checkIn)) errors.checkIn = 'Choose a check-in date.'
  else if (checkIn < todayInNepal()) errors.checkIn = 'Check-in cannot be in the past.'
  if (!validDate(checkOut)) errors.checkOut = 'Choose a check-out date.'
  else if (!errors.checkIn && checkOut <= checkIn) errors.checkOut = 'Check-out must be after check-in.'
  else if (!errors.checkIn && nightsBetween(checkIn, checkOut) > MAX_NIGHTS)
    errors.checkOut = `Stays can be at most ${MAX_NIGHTS} nights.`
  if (!Number.isInteger(guests) || guests < 1) errors.guests = 'Choose the number of guests.'
  else if (guests > listing.maxGuests)
    errors.guests = `This stay sleeps at most ${listing.maxGuests} ${listing.maxGuests === 1 ? 'guest' : 'guests'}.`
  if (Object.keys(errors).length) return { errors, status: 400, message: 'Please fix the highlighted fields.' }

  // The listing's own rules: minimum / maximum stay, advance notice, blocked dates.
  const rule = availabilityProblem(listing, checkIn, checkOut)
  if (rule) return { status: 400, message: rule.message, errors: { [rule.field]: rule.message } }

  // Dates already requested or confirmed by someone else are not available.
  const clash = await Booking.exists({
    listingId: listing._id,
    status: { $in: ['pending', 'confirmed'] },
    checkIn: { $lt: checkOut },
    checkOut: { $gt: checkIn },
    ...(ignoreBookingId ? { _id: { $ne: ignoreBookingId } } : {}),
  })
  if (clash) {
    return {
      status: 409,
      message: 'Those dates are no longer available. Please choose different dates.',
      errors: { checkIn: 'Not available for these dates.' },
    }
  }
  return { nights: nightsBetween(checkIn, checkOut), quote: quote(listing, checkIn, checkOut) }
}

/* ---------- Browse ---------- */

router.get('/stays', async (req, res, next) => {
  try {
    const filter = { ...LIVE }
    const q = String(req.query.q ?? '').trim()
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i')
      filter.$or = [{ title: rx }, { location: rx }, { region: rx }, { address: rx }, { stayType: rx }]
    }
    if (req.query.type) filter.stayType = String(req.query.type)
    const guests = Number(req.query.guests)
    if (guests > 1) filter.maxGuests = { $gte: guests }

    const [stays, all] = await Promise.all([
      Listing.find(filter).sort({ featured: -1, rating: -1, _id: 1 }).select(CARD_FIELDS),
      Listing.find(LIVE).select('location stayType images'),
    ])

    // Facets come from every live stay, not just the current search results.
    const places = new Map()
    for (const l of all) {
      const p = places.get(l.location) ?? { name: l.location, stays: 0, image: l.images?.[0] ?? null }
      p.stays += 1
      places.set(l.location, p)
    }

    const verified = await verifiedOwners(stays)
    res.json({
      stays: stays.map((l) => toCard(l, verified)),
      total: all.length,
      types: [...new Set(all.map((l) => l.stayType).filter(Boolean))].sort(),
      places: [...places.values()].sort((a, b) => b.stays - a.stays || a.name.localeCompare(b.name)),
    })
  } catch (err) {
    next(err)
  }
})

router.get('/stays/:id', async (req, res, next) => {
  try {
    // Check-in details (Wi-Fi, door code) are private: they are only shown on a confirmed trip.
    const l = await Listing.findOne({ _id: req.params.id, ...LIVE }).select('-status -checkIn')
    if (!l) return res.status(404).json({ message: 'This stay is not available.' })
    const verified = await verifiedOwners([l])
    res.json({
      stay: {
        ...l.toObject(),
        ownerId: undefined,
        hostVerified: verified.has(l.ownerId),
        id: l._id,
        priceNPR: l.pricePerNightNPR,
        priceUSD: usdPrice(l),
        // Only the rules and discounts are public, not the host's blocked dates and notes.
        availability: undefined,
        pricing: undefined,
        rules: rulesOf(l),
        discounts: publicDiscounts(l),
      },
    })
  } catch (err) {
    next(err)
  }
})

/** Price for chosen dates, before sending a request. Also says if the dates are not allowed. */
router.get('/stays/:id/quote', async (req, res, next) => {
  try {
    const l = await Listing.findOne({ _id: req.params.id, ...LIVE })
    if (!l) return res.status(404).json({ message: 'This stay is not available.' })
    const { checkIn, checkOut } = req.query
    if (!isDate(checkIn) || !isDate(checkOut) || checkOut <= checkIn || nightsBetween(checkIn, checkOut) > 60)
      return res.status(400).json({ message: 'Choose a check-in date and a later check-out date.' })
    res.json({
      quote: quote(l, checkIn, checkOut),
      problem: availabilityProblem(l, checkIn, checkOut)?.message ?? null,
    })
  } catch (err) {
    next(err)
  }
})

/* ---------- Booking requests ---------- */

router.post('/stays/:id/book', async (req, res, next) => {
  try {
    if (req.user.role !== 'traveler')
      return res.status(403).json({ message: 'Log in with a traveler account to book a stay.' })

    const listing = await Listing.findOne({ _id: req.params.id, ...LIVE })
    if (!listing) return res.status(404).json({ message: 'This stay is not available.' })

    const { checkIn, checkOut, specialRequests = '' } = req.body ?? {}
    const guests = Number(req.body?.guests)
    const check = await checkStayRequest(listing, { checkIn, checkOut, guests })
    if (check.message) return res.status(check.status).json({ message: check.message, errors: check.errors })

    const booking = await Booking.create({
      listingId: listing._id,
      listingTitle: listing.title,
      listingLocation: listing.location,
      listingImage: listing.images?.[0] ?? '',
      userId: req.user._id.toString(),
      guestName: req.user.name,
      guestEmail: req.user.email ?? '',
      checkIn,
      checkOut,
      guestsCount: guests,
      totalNights: check.nights,
      totalPriceNPR: check.quote.totalNPR,
      totalPriceUSD: check.quote.totalUSD,
      specialRequests: String(specialRequests).trim().slice(0, 1000),
      status: 'pending',
      bookingCode: `NS-${randomBytes(4).toString('hex').slice(0, 6).toUpperCase()}`,
    })
    res.status(201).json({ booking })
  } catch (err) {
    next(err)
  }
})

/* ---------- My trips ---------- */

const myTrip = (req) =>
  Booking.findOne({ _id: req.params.id, userId: req.user._id.toString() }).catch(() => null)

/**
 * What the traveler may still change or cancel: a request the host has not answered yet
 * (at any time), or a confirmed trip until the day it starts.
 */
const changeable = (b) => b.status === 'pending' || (b.status === 'confirmed' && b.checkIn > todayInNepal())

router.get('/me/trips', async (req, res, next) => {
  try {
    const trips = await Booking.find({ userId: req.user._id.toString() }).sort({ checkIn: -1 }).limit(100)
    res.json({ trips, today: todayInNepal() })
  } catch (err) {
    next(err)
  }
})

router.get('/me/trips/:id', async (req, res, next) => {
  try {
    const trip = await myTrip(req)
    if (!trip) return res.status(404).json({ message: 'Trip not found.' })

    const listing = await Listing.findById(trip.listingId).select(
      'title address location region arrivalGuide host.name maxGuests checkIn houseRules',
    )
    // Wi-Fi and door codes are released only once the host has confirmed the booking.
    const released = ['confirmed', 'completed'].includes(trip.status)
    res.json({
      trip,
      today: todayInNepal(),
      canChange: changeable(trip),
      stay: listing && {
        address: [listing.address || listing.location, listing.region].filter(Boolean).join(', '),
        arrivalGuide: listing.arrivalGuide ?? '',
        hostName: listing.host?.name ?? null,
        maxGuests: listing.maxGuests,
        houseRules: listing.houseRules ?? [],
      },
      checkInInfo: released && listing ? (listing.checkIn?.toObject?.() ?? listing.checkIn ?? {}) : null,
    })
  } catch (err) {
    next(err)
  }
})

router.post('/me/trips/:id/cancel', async (req, res, next) => {
  try {
    const trip = await myTrip(req)
    if (!trip) return res.status(404).json({ message: 'Trip not found.' })
    if (!changeable(trip)) {
      return res.status(400).json({
        message: trip.status === 'confirmed'
          ? 'This trip has already started, so it can no longer be cancelled here. Message your host.'
          : `A ${trip.status} trip cannot be cancelled.`,
      })
    }
    trip.status = 'cancelled'
    await trip.save()
    res.json({ trip })
  } catch (err) {
    next(err)
  }
})

router.post('/me/trips/:id/dates', async (req, res, next) => {
  try {
    const trip = await myTrip(req)
    if (!trip) return res.status(404).json({ message: 'Trip not found.' })
    if (!changeable(trip))
      return res.status(400).json({ message: 'The dates of this trip can no longer be changed.' })

    const listing = await Listing.findOne({ _id: trip.listingId, ...LIVE })
    if (!listing) return res.status(404).json({ message: 'This stay is no longer available.' })

    const { checkIn, checkOut } = req.body ?? {}
    const guests = Number(req.body?.guests ?? trip.guestsCount)
    const check = await checkStayRequest(listing, { checkIn, checkOut, guests }, trip._id)
    if (check.message) return res.status(check.status).json({ message: check.message, errors: check.errors })

    const wasConfirmed = trip.status === 'confirmed'
    Object.assign(trip, {
      checkIn,
      checkOut,
      guestsCount: guests,
      totalNights: check.nights,
      totalPriceNPR: check.quote.totalNPR,
      totalPriceUSD: check.quote.totalUSD,
      // New dates need the host's agreement again.
      status: 'pending',
    })
    await trip.save()
    res.json({ trip, needsReconfirm: wasConfirmed })
  } catch (err) {
    next(err)
  }
})

/* ---------- Saved stays ---------- */

router.get('/me/saved', (req, res) => {
  res.json({ saved: req.user.saved ?? [] })
})

router.post('/me/saved/:id', async (req, res, next) => {
  try {
    const id = req.params.id
    const saved = new Set(req.user.saved ?? [])
    if (saved.has(id)) saved.delete(id)
    else if (await Listing.exists({ _id: id, ...LIVE })) saved.add(id)
    else return res.status(404).json({ message: 'This stay is not available.' })

    req.user.saved = [...saved].slice(-200)
    await req.user.save()
    res.json({ saved: req.user.saved })
  } catch (err) {
    next(err)
  }
})

export default router
