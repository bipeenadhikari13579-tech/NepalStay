const nf = new Intl.NumberFormat('en-US')
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 })

export const npr = (n) => `NPR ${nf.format(Math.round(n ?? 0))}`
export const nprCompact = (n) => `NPR ${(n ?? 0) >= 100000 ? compact.format(n) : nf.format(Math.round(n ?? 0))}`
export const usd = (n) => `$${nf.format(Math.round(n ?? 0))}`
/** A stay's nightly price in the chosen currency. Takes { priceNPR, priceUSD }. */
export const price = (stay, currency) =>
  currency === 'USD' ? usd(stay.priceUSD) : npr(stay.priceNPR)
export const number = (n) => nf.format(n ?? 0)

/** "2026-11-12" -> "12 Nov 2026" (no timezone shifting). */
export function day(iso) {
  if (!iso) return '—'
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return String(iso)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** "14 minutes ago", "3 hours ago", "2 days ago". */
export function ago(date) {
  const s = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000)
  if (s < 60) return 'just now'
  const steps = [
    [3600, 60, 'minute'],
    [86400, 3600, 'hour'],
    [Infinity, 86400, 'day'],
  ]
  const [, size, unit] = steps.find(([limit]) => s < limit)
  const n = Math.floor(s / size)
  return `${n} ${unit}${n === 1 ? '' : 's'} ago`
}

/** Current time in Nepal, e.g. "9:30 PM". */
export const nepalTime = () =>
  new Date().toLocaleTimeString('en-US', {
    timeZone: 'Asia/Kathmandu',
    hour: 'numeric',
    minute: '2-digit',
  })
