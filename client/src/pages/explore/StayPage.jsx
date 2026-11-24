import { useEffect, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { ArrowLeft, BadgeCheck, BedDouble, Check, CircleCheck, Heart, MapPin, Star, Users } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { api } from '../../lib/api.js'
import { day, npr, price, usd } from '../../lib/format.js'

const todayInNepal = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kathmandu' })
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

export default function StayPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const { currency, saved, toggleSaved } = useOutletContext()
  const [stay, setStay] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [form, setForm] = useState({ checkIn: '', checkOut: '', guests: 1, specialRequests: '' })
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  const [booking, setBooking] = useState(null)
  // Price for the chosen dates, worked out by the server: { quote, problem } or { error }.
  const [priced, setPriced] = useState(null)

  useEffect(() => {
    setStay(null)
    setBooking(null)
    api(`/stays/${id}`)
      .then((d) => setStay(d.stay))
      .catch((err) => setLoadError(err.message))
    window.scrollTo(0, 0)
  }, [id])

  useEffect(() => {
    const { checkIn, checkOut } = form
    if (!checkIn || !checkOut || checkOut <= checkIn) {
      setPriced(null)
      return
    }
    let stale = false
    api(`/stays/${id}/quote?checkIn=${checkIn}&checkOut=${checkOut}`)
      .then((d) => !stale && setPriced(d))
      .catch((err) => !stale && setPriced({ error: err.message }))
    return () => {
      stale = true
    }
  }, [id, form.checkIn, form.checkOut])

  if (loadError) {
    return (
      <main className="ex-section">
        <p className="ex-error">{loadError}</p>
        <Link to="/explore" className="ex-back">
          <ArrowLeft size={15} /> Back to all stays
        </Link>
      </main>
    )
  }
  if (!stay) return <main className="ex-section"><p className="ex-empty">Loading stay…</p></main>

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setErrors((errs) => ({ ...errs, [key]: undefined }))
    setFailure('')
  }

  const q = priced?.quote
  // Convert NPR amounts with the same rate the server used for the total.
  const money = (amountNPR) =>
    currency === 'USD' && q?.totalNPR ? usd((amountNPR * q.totalUSD) / q.totalNPR) : npr(amountNPR)
  const offers = [
    stay.discounts?.weeklyDiscountPct > 0 && `${stay.discounts.weeklyDiscountPct}% off stays of 7+ nights`,
    stay.discounts?.monthlyDiscountPct > 0 && `${stay.discounts.monthlyDiscountPct}% off stays of 28+ nights`,
    stay.discounts?.earlyBirdPct > 0 &&
      `${stay.discounts.earlyBirdPct}% off when booked ${stay.discounts.earlyBirdDays}+ days ahead`,
  ].filter(Boolean)
  const isSaved = saved.includes(stay.id)
  const canBook = user.role === 'traveler'

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setFailure('')
    try {
      const data = await api(`/stays/${stay.id}/book`, { method: 'POST', body: form })
      setBooking(data.booking)
    } catch (err) {
      setErrors(err.errors ?? {})
      setFailure(err.message)
    } finally {
      setBusy(false)
    }
  }

  const photos = stay.images?.slice(0, 3) ?? []

  return (
    <main className="ex-section ex-stay">
      <Link to="/explore" className="ex-back">
        <ArrowLeft size={15} /> Back to all stays
      </Link>

      <header className="ex-stay__head">
        <div>
          <h1>{stay.title}</h1>
          <p>
            {stay.rating != null && (
              <span className="ex-card__rating">
                <Star size={13} fill="currentColor" /> {stay.rating.toFixed(2)} <small>({plural(stay.reviewsCount ?? 0, 'review')})</small>
              </span>
            )}
            <span>
              <MapPin size={13} /> {[stay.address || stay.location, stay.region].filter(Boolean).join(', ')}
            </span>
          </p>
        </div>
        <button
          type="button"
          className={`ex-save ${isSaved ? 'is-saved' : ''}`}
          aria-pressed={isSaved}
          onClick={() => toggleSaved(stay.id)}
        >
          <Heart size={16} fill={isSaved ? 'currentColor' : 'none'} /> {isSaved ? 'Saved' : 'Save'}
        </button>
      </header>

      {photos.length > 0 && (
        <div className={`ex-gallery ex-gallery--${photos.length}`}>
          {photos.map((src, i) => (
            <img key={src + i} src={src} alt={`${stay.title} photo ${i + 1}`} />
          ))}
        </div>
      )}

      <div className="ex-stay__cols">
        <div className="ex-stay__info">
          <section>
            <h2>
              {stay.stayType || 'Homestay'} hosted by {stay.host?.name || 'a local family'}
              {stay.hostVerified && (
                <span className="ex-verified ex-verified--lg" title="Identity and business checked by Nepal Stay">
                  <BadgeCheck size={14} /> Verified host
                </span>
              )}
            </h2>
            <ul className="ex-facts">
              <li>
                <Users size={15} /> Up to {plural(stay.maxGuests, 'guest')}
              </li>
              <li>
                <BedDouble size={15} /> {plural(stay.bedrooms ?? 0, 'bedroom')} · {plural(stay.beds ?? 0, 'bed')} ·{' '}
                {plural(stay.bathrooms ?? 0, 'bathroom')}
              </li>
            </ul>
            {stay.tagline && <p className="ex-stay__tagline">{stay.tagline}</p>}
            {stay.description && <p>{stay.description}</p>}
          </section>

          {stay.amenities?.length > 0 && (
            <section>
              <h2>What this stay offers</h2>
              <ul className="ex-ticks">
                {stay.amenities.map((a) => (
                  <li key={a}>
                    <Check size={15} /> {a}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {stay.houseRules?.length > 0 && (
            <section>
              <h2>House rules</h2>
              <ul className="ex-rules">
                {stay.houseRules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </section>
          )}

          {stay.arrivalGuide && (
            <section>
              <h2>Getting there</h2>
              <p>{stay.arrivalGuide}</p>
            </section>
          )}

          {stay.host?.bio && (
            <section>
              <h2>About your host</h2>
              <p>{stay.host.bio}</p>
              {stay.host.languages?.length > 0 && <p>Speaks {stay.host.languages.join(', ')}.</p>}
            </section>
          )}
        </div>

        <aside className="ex-book">
          {booking ? (
            <div className="ex-book__done">
              <CircleCheck size={34} />
              <h2>Request sent</h2>
              <p>
                Your request for {day(booking.checkIn)} → {day(booking.checkOut)} is with the host. Nothing
                is charged yet; you will see it turn “confirmed” under My trips.
              </p>
              <p className="ex-book__code">Booking {booking.bookingCode}</p>
              <Link to="/trips" className="ex-book__submit">
                View my trips
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <p className="ex-book__price">
                <strong>{price(stay, currency)}</strong> <small>{price(stay, currency === 'NPR' ? 'USD' : 'NPR')} / night</small>
              </p>

              <div className="ex-book__dates">
                <label className={errors.checkIn ? 'has-error' : ''}>
                  <span>Check-in</span>
                  <input type="date" min={todayInNepal()} value={form.checkIn} onChange={set('checkIn')} />
                </label>
                <label className={errors.checkOut ? 'has-error' : ''}>
                  <span>Check-out</span>
                  <input type="date" min={form.checkIn || todayInNepal()} value={form.checkOut} onChange={set('checkOut')} />
                </label>
              </div>
              {(errors.checkIn || errors.checkOut) && (
                <p className="ex-book__error">{errors.checkIn || errors.checkOut}</p>
              )}

              <label className={errors.guests ? 'has-error' : ''}>
                <span>Guests</span>
                <select value={form.guests} onChange={set('guests')}>
                  {Array.from({ length: stay.maxGuests }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {plural(n, 'guest')}
                    </option>
                  ))}
                </select>
              </label>
              {errors.guests && <p className="ex-book__error">{errors.guests}</p>}

              <label>
                <span>Message to the host (optional)</span>
                <textarea
                  rows={3}
                  maxLength={1000}
                  placeholder="Arrival time, dietary needs…"
                  value={form.specialRequests}
                  onChange={set('specialRequests')}
                />
              </label>

              {stay.rules?.minNights > 1 && !q && (
                <p className="ex-book__hint">Minimum stay: {plural(stay.rules.minNights, 'night')}.</p>
              )}
              {offers.length > 0 && !q && <p className="ex-book__hint">{offers.join(' · ')}</p>}

              {priced?.error && <p className="ex-book__error">{priced.error}</p>}
              {priced?.problem && <p className="ex-book__error">{priced.problem}</p>}
              {q && (
                <dl className="ex-book__lines">
                  <dt>
                    {plural(q.nights, 'night')}
                    {q.subtotalNPR !== q.nights * stay.priceNPR && <small> (some nights have a different price)</small>}
                  </dt>
                  <dd>{money(q.subtotalNPR)}</dd>
                  {q.discountNPR > 0 && (
                    <>
                      <dt className="is-good">
                        {q.discountLabel} ({q.discountPct}%)
                      </dt>
                      <dd className="is-good">− {money(q.discountNPR)}</dd>
                    </>
                  )}
                  <dt>
                    <strong>Total</strong>
                  </dt>
                  <dd>
                    <strong>{currency === 'USD' ? usd(q.totalUSD) : npr(q.totalNPR)}</strong>
                  </dd>
                </dl>
              )}

              <button type="submit" className="ex-book__submit" disabled={busy || !canBook || Boolean(priced?.problem)}>
                {busy ? 'Sending…' : 'Request to book'}
              </button>
              <p className={`ex-book__note ${failure ? 'is-error' : ''}`} role="status">
                {failure ||
                  (canBook
                    ? 'You will not be charged. The host confirms or declines your request.'
                    : 'Log in with a traveler account to book a stay.')}
              </p>
            </form>
          )}
        </aside>
      </div>
    </main>
  )
}
