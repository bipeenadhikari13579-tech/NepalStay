import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import Listing, { LISTING_STATUSES } from '../models/Listing.js'
import Booking from '../models/Booking.js'
import AuditLog, { audit } from '../models/AuditLog.js'
import { mountAdminKyc } from '../lib/kyc.js'
import KycSubmission from '../models/KycSubmission.js'
import { LIST_FIELDS, escapeRegex, liveProblem, readListing } from '../lib/listings.js'

const router = Router()

// Everything under /api/admin needs a logged-in System Admin.
router.use(requireAuth, requireRole('admin'))

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const EARNING_STATUSES = ['confirmed', 'completed']


/* ---------- Overview ---------- */

router.get('/summary', async (_req, res, next) => {
  try {
    const [pendingListings, pendingKyc] = await Promise.all([
      Listing.countDocuments({ status: 'pending' }),
      KycSubmission.countDocuments({ status: 'pending' }),
    ])
    res.json({ pendingListings, pendingKyc })
  } catch (err) {
    next(err)
  }
})

router.get('/overview', async (_req, res, next) => {
  try {
    const [
      activeHomestays,
      newThisWeek,
      regions,
      pendingCount,
      queue,
      bookings,
      bookingsByStatus,
      revenue,
      recentBookings,
    ] = await Promise.all([
      Listing.countDocuments({ status: 'published' }),
      Listing.countDocuments({ createdAt: { $gte: new Date(Date.now() - WEEK_MS) } }),
      Listing.distinct('region', { status: 'published' }),
      Listing.countDocuments({ status: 'pending' }),
      Listing.find({ status: 'pending' })
        .sort({ updatedAt: 1 })
        .limit(3)
        .select('title location region stayType images host.name pricePerNightNPR'),
      Booking.countDocuments(),
      Booking.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      Booking.aggregate([
        { $match: { status: { $in: EARNING_STATUSES } } },
        { $group: { _id: null, npr: { $sum: '$totalPriceNPR' }, usd: { $sum: '$totalPriceUSD' } } },
      ]),
      Booking.find().sort({ createdAt: -1 }).limit(6),
    ])

    const count = (rows, key) => rows.find((r) => r._id === key)?.n ?? 0

    res.json({
      stats: {
        activeHomestays,
        newThisWeek,
        regions: regions.filter(Boolean).length,
        bookings,
        confirmedBookings: count(bookingsByStatus, 'confirmed') + count(bookingsByStatus, 'completed'),
        pendingBookings: count(bookingsByStatus, 'pending'),
        revenueNPR: revenue[0]?.npr ?? 0,
        revenueUSD: revenue[0]?.usd ?? 0,
      },
      pendingCount,
      queue,
      recentBookings,
    })
  } catch (err) {
    next(err)
  }
})

/* ---------- Listings ---------- */

router.get('/listings', async (req, res, next) => {
  try {
    const filter = {}
    if (LISTING_STATUSES.includes(req.query.status)) filter.status = req.query.status
    const q = String(req.query.q ?? '').trim()
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i')
      filter.$or = [{ title: rx }, { location: rx }, { region: rx }, { 'host.name': rx }, { _id: q }]
    }
    const [listings, counts] = await Promise.all([
      Listing.find(filter)
        .sort({ updatedAt: -1, _id: 1 })
        .select(LIST_FIELDS),
      Listing.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    ])
    res.json({ listings, counts: Object.fromEntries(counts.map((c) => [c._id, c.n])) })
  } catch (err) {
    next(err)
  }
})

router.get('/listings/:id', async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id)
    if (!listing) return res.status(404).json({ message: 'Listing not found.' })
    res.json({ listing })
  } catch (err) {
    next(err)
  }
})

router.patch('/listings/:id', async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id)
    if (!listing) return res.status(404).json({ message: 'Listing not found.' })

    const { data, errors } = readListing(req.body ?? {}, { partial: true })
    if (Object.keys(errors).length)
      return res.status(400).json({ message: 'Please fix the highlighted fields.', errors })

    const before = listing.status
    listing.set(data)
    const problem = liveProblem(listing)
    if (problem) return res.status(400).json({ message: problem, errors: { images: problem } })

    await listing.save()
    const onlyStatus = Object.keys(data).length === 1 && data.status
    await audit(
      req.user,
      onlyStatus ? `set listing to ${listing.status}` : 'edited listing',
      before !== listing.status && !onlyStatus
        ? `${listing.title} (${before} → ${listing.status})`
        : listing.title,
    )
    res.json({ listing })
  } catch (err) {
    next(err)
  }
})

/* ---------- Host KYC review ---------- */

mountAdminKyc(router)

/* ---------- Audit log ---------- */

router.get('/audit', async (_req, res, next) => {
  try {
    res.json({ entries: await AuditLog.find().sort({ createdAt: -1 }).limit(200) })
  } catch (err) {
    next(err)
  }
})

export default router
