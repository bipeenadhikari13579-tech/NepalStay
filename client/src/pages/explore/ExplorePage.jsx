import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useOutletContext, useSearchParams } from 'react-router-dom'
import { ArrowRight, BadgeCheck, CalendarDays, Leaf, MapPin, Search, Star, Users } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { api } from '../../lib/api.js'
import { day, npr, usd } from '../../lib/format.js'
import StayCard from './StayCard.jsx'

const TRIP_NOTE = {
  pending: 'Waiting for the host to confirm',
  confirmed: 'Confirmed by the host',
  declined: 'The host could not accept this request',
  cancelled: 'Cancelled',
  completed: 'Completed',
}

export default function ExplorePage() {
  const { user } = useAuth()
  const { currency, saved, toggleSaved } = useOutletContext()
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const q = params.get('q') ?? ''
  const type = params.get('type') ?? ''
  const guests = params.get('guests') ?? ''

  const [form, setForm] = useState({ q, guests })
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [trips, setTrips] = useState([])
  const [onlySaved, setOnlySaved] = useState(false)

  useEffect(() => setForm({ q, guests }), [q, guests])

  const load = useCallback(() => {
    const query = new URLSearchParams()
    if (q) query.set('q', q)
    if (type) query.set('type', type)
    if (guests) query.set('guests', guests)
    api(`/stays?${query}`)
      .then((d) => {
        setData(d)
        setError('')
      })
      .catch((err) => setError(err.message))
  }, [q, type, guests])
  useEffect(load, [load])

  useEffect(() => {
    api('/me/trips')
      .then((d) => setTrips(d.trips))
      .catch(() => {})
  }, [])

  // Jump to a section when the top-bar links are used (/explore#destinations).
  useEffect(() => {
    if (!location.hash || !data) return
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [location.hash, data])

  function update(next) {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v)
      else p.delete(k)
    }
    setParams(p, { replace: true })
  }

  function handleSearch(e) {
    e.preventDefault()
    update({ q: form.q.trim(), guests: form.guests })
    document.getElementById('stays')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const stays = (data?.stays ?? []).filter((s) => !onlySaved || saved.includes(s.id))
  const filtered = Boolean(q || type || guests || onlySaved)
  const places = data?.places.slice(0, 4) ?? []

  return (
    <main>
      {/* ---------- Hero + search ---------- */}
      <section className="ex-hero">
        <span className="ex-pill">
          <BadgeCheck size={14} /> Authentic homestays • verified warmth
        </span>
        <h1>Where Peaks Meet Warm Hospitality</h1>
        <p>
          Namaste, {user.name.split(' ')[0]}. Stay with Gurung, Sherpa and Newari hosts in handcrafted
          lodges, valley courtyards and tea houses across the Himalayas.
        </p>

        <form className="ex-search" onSubmit={handleSearch} role="search">
          <label>
            <span>Destination</span>
            <input
              type="text"
              placeholder="Pokhara, Mustang, Kathmandu…"
              value={form.q}
              onChange={(e) => setForm((f) => ({ ...f, q: e.target.value }))}
            />
          </label>
          <label>
            <span>Guests</span>
            <select value={form.guests} onChange={(e) => setForm((f) => ({ ...f, guests: e.target.value }))}>
              <option value="">Any</option>
              {[1, 2, 3, 4, 5, 6, 8].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'guest' : 'guests'}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">
            <Search size={16} /> Search
          </button>
        </form>
      </section>

      {/* ---------- Stay type chips ---------- */}
      <div className="ex-chips" role="group" aria-label="Filter by stay type">
        <button type="button" className={!type && !onlySaved ? 'is-active' : ''} onClick={() => { update({ type: '' }); setOnlySaved(false) }}>
          All stays
        </button>
        {data?.types.map((t) => (
          <button key={t} type="button" className={type === t ? 'is-active' : ''} onClick={() => update({ type: type === t ? '' : t })}>
            {t}
          </button>
        ))}
        <button type="button" className={onlySaved ? 'is-active' : ''} aria-pressed={onlySaved} onClick={() => setOnlySaved((v) => !v)}>
          ♥ Saved ({saved.length})
        </button>
      </div>

      {/* ---------- Stays ---------- */}
      <section className="ex-section" id="stays">
        <header className="ex-section__head">
          <div>
            <p className="ex-eyebrow">Curated living spaces</p>
            <h2>Handpicked Himalayan Sanctuaries</h2>
            <p>Directly supported village hosts. Every listing is reviewed by Nepal Stay before it goes live.</p>
          </div>
          {data && (
            <p className="ex-count">
              Showing {stays.length} of {data.total} verified {data.total === 1 ? 'stay' : 'stays'} • 100% host payout
            </p>
          )}
        </header>

        {error && <p className="ex-error">{error}</p>}
        {!data && !error && <p className="ex-empty">Loading stays…</p>}
        {data && stays.length === 0 && (
          <div className="ex-empty">
            <p>{onlySaved ? 'You have not saved any stays yet. Tap the heart on a stay to save it.' : 'No stays match your search.'}</p>
            {filtered && (
              <button type="button" onClick={() => { setParams({}, { replace: true }); setOnlySaved(false) }}>
                Clear filters
              </button>
            )}
          </div>
        )}

        <div className="ex-grid">
          {stays.map((s) => (
            <StayCard key={s.id} stay={s} currency={currency} saved={saved.includes(s.id)} onToggleSaved={toggleSaved} />
          ))}
        </div>
      </section>

      {/* ---------- My trips ---------- */}
      <section className="ex-section" id="trips">
        <header className="ex-section__head">
          <div>
            <p className="ex-eyebrow">Your bookings</p>
            <h2>My trips</h2>
          </div>
          <Link to="/trips" className="ex-btn">
            View all trips <ArrowRight size={15} />
          </Link>
        </header>
        {trips.length === 0 ? (
          <p className="ex-empty">You have no trips yet. Open a stay above and send a booking request.</p>
        ) : (
          <ul className="ex-trips">
            {trips.slice(0, 3).map((t) => (
              <li key={t._id}>
                {t.listingImage ? <img src={t.listingImage} alt="" loading="lazy" /> : <span className="ex-card__nophoto" />}
                <div>
                  <Link to={`/trips/${t._id}`}>
                    <strong>{t.listingTitle}</strong>
                  </Link>
                  <small>
                    <CalendarDays size={12} /> {day(t.checkIn)} → {day(t.checkOut)} · {t.totalNights}{' '}
                    {t.totalNights === 1 ? 'night' : 'nights'} · {t.guestsCount} {t.guestsCount === 1 ? 'guest' : 'guests'}
                  </small>
                  <small>
                    {TRIP_NOTE[t.status] ?? t.status} · Booking {t.bookingCode}
                  </small>
                </div>
                <div className="ex-trips__end">
                  <span className={`ex-status ex-status--${t.status}`}>{t.status}</span>
                  <strong>{currency === 'USD' ? usd(t.totalPriceUSD) : npr(t.totalPriceNPR)}</strong>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- Destinations ---------- */}
      <section className="ex-section" id="destinations">
        <header className="ex-section__head">
          <div>
            <p className="ex-eyebrow ex-eyebrow--red">Geography of wonder</p>
            <h2>Explore by Iconic Valleys &amp; Trails</h2>
            <p>From sub-tropical lake shores to the high trade routes of the Tibetan plateau.</p>
          </div>
        </header>
        <div className="ex-places">
          {places.map((p) => (
            <button
              key={p.name}
              type="button"
              className="ex-place"
              style={p.image ? { backgroundImage: `url("${p.image}")` } : undefined}
              onClick={() => {
                setOnlySaved(false)
                setParams({ q: p.name }, { replace: true })
                document.getElementById('stays')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
            >
              <span className="ex-card__chip">
                {p.stays} {p.stays === 1 ? 'stay' : 'stays'} available
              </span>
              <strong>{p.name}</strong>
              <span className="ex-place__go">
                Explore {p.name} <ArrowRight size={14} />
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* ---------- Promise ---------- */}
      <section className="ex-section">
        <div className="ex-promise">
          <div>
            <span className="ex-pill ex-pill--dark">
              <Leaf size={14} /> Direct host impact model
            </span>
            <h2>Namaste &amp; Our Himalayan Village Promise</h2>
            <p>
              Stay fees on Nepal Stay go directly to village families, and 5% of confirmed booking
              revenue is set aside for community projects: solar hot water, trail restoration and
              heritage timber repair.
            </p>
          </div>
          <div className="ex-promise__stats">
            <div>
              <strong>{data?.total ?? '—'}</strong>
              <span>
                <Users size={13} /> Family homestays live
              </span>
            </div>
            <div>
              <strong>100%</strong>
              <span>
                <Star size={13} /> Direct host payouts
              </span>
            </div>
            <div>
              <strong>{data?.places.length ?? '—'}</strong>
              <span>
                <MapPin size={13} /> Towns and valleys
              </span>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
