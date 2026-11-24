import { randomBytes } from 'node:crypto'
import mongoose from 'mongoose'

export const LISTING_STATUSES = ['draft', 'pending', 'published', 'snoozed']

const listingSchema = new mongoose.Schema(
  {
    // Existing listings use readable string ids such as "ns-stay-001".
    _id: { type: String, default: () => `ns-stay-${randomBytes(4).toString('hex')}` },
    // The host account that owns the listing. Listings from the first version have none.
    ownerId: { type: String, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    tagline: { type: String, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 5000 },
    location: { type: String, required: true, trim: true, maxlength: 80 },
    address: { type: String, trim: true, maxlength: 200 },
    region: { type: String, trim: true, maxlength: 80 },
    coordinates: { lat: Number, lng: Number },
    stayType: { type: String, trim: true, maxlength: 60 },
    pricePerNightNPR: { type: Number, required: true, min: 0 },
    pricePerNightUSD: { type: Number, min: 0 },
    rating: Number,
    reviewsCount: Number,
    images: [String],
    featured: { type: Boolean, default: false },
    superhost: Boolean,
    verifiedHeritage: Boolean,
    maxGuests: { type: Number, default: 2, min: 1 },
    bedrooms: { type: Number, default: 1, min: 0 },
    beds: { type: Number, default: 1, min: 0 },
    bathrooms: { type: Number, default: 1, min: 0 },
    amenities: [String],
    host: {
      name: String,
      avatar: String,
      bio: String,
      joinedYear: Number,
      isSuperhost: Boolean,
      languages: [String],
    },
    houseRules: [String],
    arrivalGuide: { type: String, trim: true, maxlength: 3000 },
    // Private check-in details. Shown to a guest only once their booking is confirmed.
    checkIn: {
      time: { type: String, trim: true, maxlength: 60 },
      wifiName: { type: String, trim: true, maxlength: 80 },
      wifiPassword: { type: String, trim: true, maxlength: 80 },
      doorCode: { type: String, trim: true, maxlength: 80 },
      directions: { type: String, trim: true, maxlength: 2000 },
    },
    // Calendar rules. Blocked ranges include both their first and last day (YYYY-MM-DD).
    availability: {
      minNights: { type: Number, min: 1 },
      maxNights: { type: Number, min: 1 },
      advanceNoticeDays: { type: Number, min: 0 },
      blocked: [{ _id: false, from: String, to: String, note: String }],
    },
    // Pricing on top of pricePerNightNPR. Percentages are whole numbers (10 = 10%).
    pricing: {
      weekendNPR: Number, // Friday and Saturday nights
      weeklyDiscountPct: Number, // stays of 7+ nights
      monthlyDiscountPct: Number, // stays of 28+ nights
      earlyBirdPct: Number,
      earlyBirdDays: Number, // booked at least this many days before check-in
      custom: [{ _id: false, from: String, to: String, priceNPR: Number, label: String }],
    },
    reviews: [mongoose.Schema.Types.Mixed],
    // draft: not visible · pending: awaiting admin review · published: live · snoozed: hidden temporarily
    status: { type: String, enum: LISTING_STATUSES, default: 'draft' },
  },
  { timestamps: true },
)

export default mongoose.model('Listing', listingSchema)
