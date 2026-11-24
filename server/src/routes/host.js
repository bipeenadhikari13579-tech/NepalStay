import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import Listing, { LISTING_STATUSES } from '../models/Listing.js'
import Booking from '../models/Booking.js'
import { mountListingTools } from '../lib/listingTools.js'
import { mountHostKyc } from '../lib/kyc.js'
import {
  BOOKING_LISTING_FIELDS,
  BOOKING_MOVES,
  LIST_FIELDS,
  escapeRegex,
  hostMayMove,
  liveProblem,
  readListing,
} from '../lib/listings.js'

const router = Router()

// Everything under /api/host needs a logged-in host, and only touches that host's own listings.
router.use(requireAuth, requireRole('host'))

const mine = (req) => ({ ownerId: req.user._id.toString() })
const myListingIds = async (req) => (await Listing.find(mine(req)).select('_id')).map((l) => l._id)

/** Today's date in Nepal as YYYY-MM-DD, to compare with check-in / check-out dates. */
const todayInNepal = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kathmandu' })

/* ---------- Overview ---------- */

router.get('/summary', async (req, res, next) => {
  try {
    const ids = await myListingIds(req)
    res.json({
      pendingBookings: await Booking.countDocuments({ listingId: { $in: ids }, status: 'pending' }),
      kycStatus: req.user.kycStatus ?? 'none',
    })
  } catch (err) {
    next(err)
  }
})

router.get('/overview', async (req, res, next) => {
  try {
    const listings = await Listing.find(mine(req)).sort({ updatedAt: -1 }).select(LIST_FIELDS)
    const bookings = await Booking.find({ listingId: { $in: listings.map((l) => l._id) } }).sort({
      checkIn: 1,
    })
    const today = todayInNepal()
    const earning = bookings.filter((b) => ['confirmed', 'completed'].includes(b.status))
    const countBy = (status) => listings.filter((l) => l.status === status).length

    res.json({
      stats: {
        listings: listings.length,
        live: countBy('published'),
        inReview: countBy('pending'),
        drafts: countBy('draft'),
        snoozed: countBy('snoozed'),
        bookings: bookings.length,
        earningsNPR: earning.reduce((sum, b) => sum + (b.totalPriceNPR ?? 0), 0),
        nights: earning.reduce((sum, b) => sum + (b.totalNights ?? 0), 0),
      },
      today: {
        date: today,
        // Confirmed guests arriving, leaving, or in the middle of a stay today.
        checkIns: bookings.filter((b) => b.status === 'confirmed' && b.checkIn === today),
        checkOuts: bookings.filter((b) => b.status === 'confirmed' && b.checkOut === today),
        staying: bookings.filter((b) => b.status === 'confirmed' && b.checkIn < today && b.checkOut > today),
      },
      requests: bookings.filter((b) => b.status === 'pending'),
      upcoming: bookings.filter((b) => b.status === 'confirmed' && b.checkOut >= today).slice(0, 6),
      listings: listings.slice(0, 5),
    })
  } catch (err) {
    next(err)
  }
})

/* ---------- Listings ---------- */

router.get('/listings', async (req, res, next) => {
  try {
    const filter = mine(req)
    if (LISTING_STATUSES.includes(req.query.status)) filter.status = req.query.status
    const q = String(req.query.q ?? '').trim()
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i')
      filter.$or = [{ title: rx }, { location: rx }, { region: rx }]
    }
    const [listings, counts] = await Promise.all([
      Listing.find(filter).sort({ updatedAt: -1, _id: 1 }).select(LIST_FIELDS),
      Listing.aggregate([{ $match: mine(req) }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    ])
    res.json({ listings, counts: Object.fromEntries(counts.map((c) => [c._id, c.n])) })
  } catch (err) {
    next(err)
  }
})

router.get('/listings/:id', async (req, res, next) => {
  try {
    const listing = await Listing.findOne({ _id: req.params.id, ...mine(req) })
    if (!listing) return res.status(404).json({ message: 'Listing not found.' })
    res.json({ listing })
  } catch (err) {
    next(err)
  }
})

/** Hosts cannot feature a listing or rename its host. */
function readHostListing(body, options) {
  const result = readListing(body, options)
  delete result.data.featured
  delete result.data['host.name']
  return result
}

router.post('/listings', async (req, res, next) => {
  try {
    const { data, errors } = readHostListing(req.body ?? {})
    if (Object.keys(errors).length)
      return res.status(400).json({ message: 'Please fix the highlighted fields.', errors })
    if (!hostMayMove('draft', data.status ?? 'draft'))
      return res.status(403).json({ message: 'New listings are reviewed by Nepal Stay before they go live.' })

    const listing = new Listing({ ...data, ...mine(req), 'host.name': req.user.name })
    const problem = liveProblem(listing)
    if (problem) return res.status(400).json({ message: problem, errors: { images: problem } })

    await listing.save()
    res.status(201).json({ listing })
  } catch (err) {
    next(err)
  }
})

router.patch('/listings/:id', async (req, res, next) => {
  try {
    const listing = await Listing.findOne({ _id: req.params.id, ...mine(req) })
    if (!listing) return res.status(404).json({ message: 'Listing not found.' })

    const { data, errors } = readHostListing(req.body ?? {}, { partial: true })
    if (Object.keys(errors).length)
      return res.status(400).json({ message: 'Please fix the highlighted fields.', errors })
    if (data.status && !hostMayMove(listing.status, data.status)) {
      return res.status(403).json({
        message:
          data.status === 'published'
            ? 'Nepal Stay has to approve this listing before it goes live.'
            : `A ${listing.status} listing cannot be changed to ${data.status}.`,
      })
    }

    listing.set(data)
    const problem = liveProblem(listing)
    if (problem) return res.status(400).json({ message: problem, errors: { images: problem } })

    await listing.save()
    res.json({ listing })
  } catch (err) {
    next(err)
  }
})

/* ---------- KYC verification ---------- */

mountHostKyc(router)

/* ---------- Calendar & pricing (own listings only) ---------- */

mountListingTools(router, (req) => Listing.findOne({ _id: req.params.id, ...mine(req) }))

/* ---------- Reservations ---------- */

router.get('/bookings', async (req, res, next) => {
  try {
    const mineOnly = { listingId: { $in: await myListingIds(req) } }
    const filter = { ...mineOnly }
    if (req.query.status) filter.status = String(req.query.status)
    const [bookings, counts] = await Promise.all([
      Booking.find(filter).sort({ checkIn: -1, createdAt: -1 }).limit(200),
      Booking.aggregate([{ $match: mineOnly }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    ])
    res.json({ bookings, counts: Object.fromEntries(counts.map((c) => [c._id, c.n])) })
  } catch (err) {
    next(err)
  }
})

router.get('/bookings/:id', async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id).catch(() => null)
    const ids = await myListingIds(req)
    if (!booking || !ids.includes(booking.listingId))
      return res.status(404).json({ message: 'Reservation not found.' })
    const listing = await Listing.findById(booking.listingId).select(BOOKING_LISTING_FIELDS)
    res.json({ booking, listing, moves: BOOKING_MOVES[booking.status] ?? [] })
  } catch (err) {
    next(err)
  }
})

router.patch('/bookings/:id', async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id).catch(() => null)
    const ids = await myListingIds(req)
    if (!booking || !ids.includes(booking.listingId))
      return res.status(404).json({ message: 'Reservation not found.' })

    const to = req.body?.status
    if (!BOOKING_MOVES[booking.status]?.includes(to))
      return res
        .status(400)
        .json({ message: `A ${booking.status} reservation cannot be changed to ${to}.` })

    booking.status = to
    await booking.save()
    res.json({ booking })
  } catch (err) {
    next(err)
  }
})

export default router
