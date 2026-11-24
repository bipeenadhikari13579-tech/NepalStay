// Availability rules and price calculation for a listing. Dates are 'YYYY-MM-DD' strings.

const NPR_PER_USD = 135 // used only when a listing has no USD price of its own
export const MAX_NIGHTS = 30

export const todayInNepal = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kathmandu' })

export const isDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d))

export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export const nightsBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000)

/** Friday and Saturday nights count as the weekend (Saturday is Nepal's weekly holiday). */
const isWeekendNight = (date) => [5, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay())

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/** The stay-length and notice rules of a listing, with defaults filled in. */
export function rulesOf(listing) {
  const a = listing.availability ?? {}
  return {
    minNights: Math.max(1, a.minNights ?? 1),
    maxNights: Math.min(MAX_NIGHTS, a.maxNights || MAX_NIGHTS),
    advanceNoticeDays: Math.max(0, a.advanceNoticeDays ?? 0),
  }
}

/**
 * Why the listing's own rules do not allow these dates, or null if they do.
 * Returns { field, message } so the form can highlight the right input.
 */
export function availabilityProblem(listing, checkIn, checkOut, today = todayInNepal()) {
  const { minNights, maxNights, advanceNoticeDays } = rulesOf(listing)
  const nights = nightsBetween(checkIn, checkOut)

  if (advanceNoticeDays > 0 && checkIn < addDays(today, advanceNoticeDays)) {
    return {
      field: 'checkIn',
      message: `This host needs at least ${plural(advanceNoticeDays, 'day')} notice before check-in.`,
    }
  }
  if (nights < minNights)
    return { field: 'checkOut', message: `The minimum stay here is ${plural(minNights, 'night')}.` }
  if (nights > maxNights)
    return { field: 'checkOut', message: `The maximum stay here is ${plural(maxNights, 'night')}.` }

  // A blocked range covers its first and last day; a stay occupies checkIn up to the night before checkOut.
  const blocked = (listing.availability?.blocked ?? []).some((b) => b.from < checkOut && b.to >= checkIn)
  if (blocked) return { field: 'checkIn', message: 'The host is not accepting guests on some of these dates.' }
  return null
}

/** The price of one night: a custom date price, else the weekend price, else the base price. */
export function nightPrice(listing, date) {
  const p = listing.pricing ?? {}
  const custom = (p.custom ?? []).find((c) => c.from <= date && c.to >= date)
  if (custom) return { priceNPR: custom.priceNPR, kind: 'custom', label: custom.label || 'Special price' }
  if (p.weekendNPR > 0 && isWeekendNight(date)) return { priceNPR: p.weekendNPR, kind: 'weekend', label: 'Weekend' }
  return { priceNPR: listing.pricePerNightNPR, kind: 'base', label: null }
}

/**
 * Full price for a stay. One discount applies at most: the largest of the
 * monthly, weekly and early-bird discounts that the stay qualifies for.
 */
export function quote(listing, checkIn, checkOut, today = todayInNepal()) {
  const nights = nightsBetween(checkIn, checkOut)
  const nightly = []
  for (let i = 0; i < nights; i++) {
    const date = addDays(checkIn, i)
    nightly.push({ date, ...nightPrice(listing, date) })
  }
  const subtotalNPR = nightly.reduce((sum, n) => sum + n.priceNPR, 0)

  const p = listing.pricing ?? {}
  const candidates = []
  if (p.monthlyDiscountPct > 0 && nights >= 28) candidates.push({ pct: p.monthlyDiscountPct, label: 'Monthly stay discount' })
  if (p.weeklyDiscountPct > 0 && nights >= 7) candidates.push({ pct: p.weeklyDiscountPct, label: 'Weekly stay discount' })
  if (p.earlyBirdPct > 0 && p.earlyBirdDays > 0 && checkIn >= addDays(today, p.earlyBirdDays))
    candidates.push({ pct: p.earlyBirdPct, label: 'Early-bird discount' })
  const best = candidates.sort((a, b) => b.pct - a.pct)[0] ?? null

  const discountNPR = best ? Math.round((subtotalNPR * best.pct) / 100) : 0
  const totalNPR = subtotalNPR - discountNPR
  // Convert with the listing's own NPR:USD ratio when it has a USD price.
  const rate = listing.pricePerNightUSD > 0 ? listing.pricePerNightNPR / listing.pricePerNightUSD : NPR_PER_USD

  return {
    nights,
    nightly,
    subtotalNPR,
    discountNPR,
    discountPct: best?.pct ?? 0,
    discountLabel: best?.label ?? null,
    totalNPR,
    totalUSD: Math.round(totalNPR / rate),
    averageNPR: nights ? Math.round(totalNPR / nights) : 0,
  }
}

/** The discounts a traveler can be told about. */
export function publicDiscounts(listing) {
  const p = listing.pricing ?? {}
  return {
    weeklyDiscountPct: p.weeklyDiscountPct || 0,
    monthlyDiscountPct: p.monthlyDiscountPct || 0,
    earlyBirdPct: p.earlyBirdPct || 0,
    earlyBirdDays: p.earlyBirdDays || 0,
    weekendNPR: p.weekendNPR || 0,
  }
}
