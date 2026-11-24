import mongoose from 'mongoose'

const BOOKING_STATUSES = ['pending', 'confirmed', 'declined', 'cancelled', 'completed']

const bookingSchema = new mongoose.Schema(
  {
    listingId: { type: String, ref: 'Listing', required: true },
    listingTitle: String,
    listingLocation: String,
    listingImage: String,
    userId: String,
    guestName: String,
    guestEmail: String,
    guestPhone: String,
    checkIn: String, // YYYY-MM-DD
    checkOut: String,
    guestsCount: Number,
    totalNights: Number,
    totalPriceNPR: Number,
    totalPriceUSD: Number,
    currencyUsed: String,
    specialRequests: String,
    status: { type: String, enum: BOOKING_STATUSES, default: 'pending' },
    bookingCode: String,
    // When each side last opened the conversation, for unread counts.
    travelerReadAt: Date,
    hostReadAt: Date,
  },
  { timestamps: true },
)

export default mongoose.model('Booking', bookingSchema)
