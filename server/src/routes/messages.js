// Messaging between a traveler and the host of a booking.
import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { requireAuth } from '../middleware/auth.js'
import Booking from '../models/Booking.js'
import Listing from '../models/Listing.js'
import Message from '../models/Message.js'
import { IMAGE_DIR, isImageName, readImageUpload, saveImage } from '../lib/chatImages.js'
import { sendStoredFile } from '../lib/fileStore.js'
import { typeFor } from '../lib/kycFiles.js'

const router = Router()
router.use(requireAuth)

const sendLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'You are sending messages too quickly. Please wait a moment.' },
})

/** The bookings this user may talk on, as a Mongo filter. */
async function myBookingsFilter(user) {
  if (user.role === 'traveler') return { userId: user._id.toString() }
  if (user.role === 'admin') return {}
  const ids = (await Listing.find({ ownerId: user._id.toString() }).select('_id')).map((l) => l._id)
  return { listingId: { $in: ids } }
}

const sideOf = (user) => (user.role === 'traveler' ? 'guest' : 'host')
const readField = (user) => (user.role === 'traveler' ? 'travelerReadAt' : 'hostReadAt')

async function findThread(req) {
  const filter = await myBookingsFilter(req.user)
  return Booking.findOne({ _id: req.params.bookingId, ...filter }).catch(() => null)
}

/** Every booking the user can message on, newest activity first, with unread counts. */
router.get('/threads', async (req, res, next) => {
  try {
    const bookings = await Booking.find(await myBookingsFilter(req.user))
      .sort({ updatedAt: -1 })
      .limit(100)
      .select('listingTitle guestName checkIn checkOut status bookingCode travelerReadAt hostReadAt updatedAt')
    const mySide = sideOf(req.user)
    const field = readField(req.user)

    const threads = await Promise.all(
      bookings.map(async (b) => {
        const [last, unread] = await Promise.all([
          Message.findOne({ bookingId: b._id }).sort({ createdAt: -1 }),
          Message.countDocuments({
            bookingId: b._id,
            side: { $ne: mySide },
            ...(b[field] ? { createdAt: { $gt: b[field] } } : {}),
          }),
        ])
        return {
          bookingId: b._id,
          listingTitle: b.listingTitle,
          guestName: b.guestName,
          checkIn: b.checkIn,
          checkOut: b.checkOut,
          status: b.status,
          bookingCode: b.bookingCode,
          unread,
          last: last && { text: last.text || 'Photo', side: last.side, createdAt: last.createdAt },
          activity: last?.createdAt ?? b.updatedAt,
        }
      }),
    )
    threads.sort((a, b) => new Date(b.activity) - new Date(a.activity))
    res.json({ threads, unread: threads.reduce((n, t) => n + t.unread, 0) })
  } catch (err) {
    next(err)
  }
})

router.get('/:bookingId', async (req, res, next) => {
  try {
    const booking = await findThread(req)
    if (!booking) return res.status(404).json({ message: 'Conversation not found.' })

    const messages = await Message.find({ bookingId: booking._id }).sort({ createdAt: 1 }).limit(500)
    // Opening the conversation marks it as read for this side.
    await Booking.updateOne({ _id: booking._id }, { $set: { [readField(req.user)]: new Date() } }, { timestamps: false })
    res.json({ messages, mySide: sideOf(req.user) })
  } catch (err) {
    next(err)
  }
})

/** A photo from a conversation. Only the people in that conversation can load it. */
router.get('/:bookingId/images/:file', async (req, res, next) => {
  try {
    const booking = await findThread(req)
    const { file } = req.params
    const owned =
      booking && isImageName(file) && (await Message.exists({ bookingId: booking._id, 'image.file': file }))
    if (!owned) return res.status(404).json({ message: 'Photo not found.' })

    await sendStoredFile(res, file, { type: typeFor(file), legacyDir: IMAGE_DIR, cache: 'private, max-age=86400' })
  } catch (err) {
    next(err)
  }
})

// Accepts JSON ({ text }) or a form with "text" and an optional "image" file.
router.post('/:bookingId', sendLimiter, readImageUpload, async (req, res, next) => {
  try {
    const booking = await findThread(req)
    if (!booking) return res.status(404).json({ message: 'Conversation not found.' })

    const text = String(req.body?.text ?? '').trim()
    if (!text && !req.file) return res.status(400).json({ message: 'Write a message or add a photo first.' })
    if (text.length > 2000) return res.status(400).json({ message: 'Messages can be at most 2,000 characters.' })

    let image
    if (req.file) {
      image = await saveImage(req.file.buffer)
      if (!image)
        return res.status(400).json({ message: 'Only JPG, PNG, GIF or WebP photos can be sent.' })
    }

    const message = await Message.create({
      bookingId: booking._id,
      senderId: req.user._id.toString(),
      senderName: req.user.role === 'admin' ? 'Nepal Stay' : req.user.name,
      side: sideOf(req.user),
      text,
      image,
    })
    await Booking.updateOne({ _id: booking._id }, { $set: { [readField(req.user)]: new Date() } }, { timestamps: false })
    res.status(201).json({ message })
  } catch (err) {
    next(err)
  }
})

export default router
