import mongoose from 'mongoose'

// One chat message on a booking. Each booking is a thread between the traveler
// and whoever manages the listing (its host, or Nepal Stay for listings without one).
const messageSchema = new mongoose.Schema(
  {
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    senderId: { type: String, required: true },
    senderName: String,
    // 'guest' = the traveler, 'host' = the host or Nepal Stay staff
    side: { type: String, enum: ['guest', 'host'], required: true },
    // A message has text, a photo, or both.
    text: { type: String, trim: true, maxlength: 2000, default: '' },
    // Photo stored in server/uploads/messages; `file` is its generated name.
    image: { file: String, type: { type: String }, size: Number },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

export default mongoose.model('Message', messageSchema)
