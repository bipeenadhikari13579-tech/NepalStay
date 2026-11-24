// Shared by the admin and host APIs: reading listing input and booking status rules.
import { LISTING_STATUSES } from '../models/Listing.js'

const isUrl = (s) => /^https?:\/\/\S+$/i.test(s)
const lines = (v) =>
  (Array.isArray(v) ? v : String(v ?? '').split('\n')).map((s) => String(s).trim()).filter(Boolean)
const num = (v) => (v === '' || v === null || v === undefined ? undefined : Number(v))

export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Fields shown in listing tables. */
export const LIST_FIELDS =
  'title location region stayType images host.name pricePerNightNPR status featured maxGuests updatedAt'

/** Whitelists and validates the editable listing fields. */
export function readListing(body, { partial = false } = {}) {
  const errors = {}
  const data = {}
  const has = (k) => body[k] !== undefined

  for (const k of ['title', 'tagline', 'description', 'location', 'address', 'region', 'stayType', 'arrivalGuide']) {
    if (has(k)) data[k] = String(body[k]).trim()
  }
  for (const k of ['pricePerNightNPR', 'pricePerNightUSD', 'maxGuests', 'bedrooms', 'beds', 'bathrooms']) {
    if (has(k)) {
      const n = num(body[k])
      if (n !== undefined && (!Number.isFinite(n) || n < 0)) errors[k] = 'Enter a number, 0 or more.'
      else data[k] = n
    }
  }
  for (const k of ['images', 'amenities', 'houseRules']) {
    if (has(k)) data[k] = lines(body[k]).slice(0, 40)
  }
  // Private check-in details, sent as flat fields by the listing form.
  for (const [field, path] of [
    ['checkInTime', 'checkIn.time'],
    ['wifiName', 'checkIn.wifiName'],
    ['wifiPassword', 'checkIn.wifiPassword'],
    ['doorCode', 'checkIn.doorCode'],
    ['directions', 'checkIn.directions'],
  ]) {
    if (has(field)) data[path] = String(body[field]).trim()
  }
  if (has('featured')) data.featured = Boolean(body.featured)
  if (has('hostName')) data['host.name'] = String(body.hostName).trim()
  if (has('status')) {
    if (LISTING_STATUSES.includes(body.status)) data.status = body.status
    else errors.status = 'Unknown status.'
  }

  if (!partial || has('title')) if (!data.title) errors.title = 'Enter a title.'
  if (!partial || has('location')) if (!data.location) errors.location = 'Enter a town or area.'
  if (!partial || has('pricePerNightNPR'))
    if (!(data.pricePerNightNPR > 0)) errors.pricePerNightNPR ??= 'Enter the nightly price in NPR.'
  if (has('maxGuests') && !(data.maxGuests >= 1)) errors.maxGuests ??= 'At least 1 guest.'
  if (data.images?.some((u) => !isUrl(u)))
    errors.images = 'Each photo must be a web address starting with http:// or https://.'

  return { data, errors }
}

/** A listing can only go live (or be queued for review) with at least one photo. */
export function liveProblem(listing) {
  if (!['published', 'pending'].includes(listing.status)) return null
  if (!listing.images?.length) return 'Add at least one photo before publishing.'
  return null
}

/**
 * Status changes a host may make to their own listing. Only an admin can publish a
 * listing for the first time; once approved, the host can snooze and unsnooze it.
 */
const HOST_MOVES = {
  draft: ['draft', 'pending'],
  pending: ['pending', 'draft'],
  published: ['published', 'snoozed'],
  snoozed: ['snoozed', 'published'],
}
export const hostMayMove = (from, to) => HOST_MOVES[from]?.includes(to) ?? false

/** Guest-facing detail of one reservation, for the host and admin reservation pages. */
export const BOOKING_LISTING_FIELDS = 'title location address images maxGuests pricePerNightNPR'

/** Reservation status changes allowed for whoever manages the listing. */
export const BOOKING_MOVES = {
  pending: ['confirmed', 'declined'],
  confirmed: ['cancelled', 'completed'],
}
