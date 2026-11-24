import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { ArrowRight, CalendarDays, MessageCircle } from 'lucide-react'
import { api } from '../../lib/api.js'
import { day, npr, usd } from '../../lib/format.js'
import { TRIP_NOTE, plural, tripPhase } from '../../lib/trips.js'

const TABS = [
  { id: 'upcoming', label: 'Upcoming', empty: 'No upcoming trips. Find a stay and send a booking request.' },
  { id: 'current', label: 'Staying now', empty: 'You are not on a trip right now.' },
  { id: 'past', label: 'Past', empty: 'No past trips yet.' },
  { id: 'cancelled', label: 'Cancelled', empty: 'No cancelled or declined trips.' },
]

export default function TripsPage() {
  const { currency } = useOutletContext()
  const [data, setData] = useState(null)
  const [unread, setUnread] = useState({})
  const [error, setError] = useState('')
  const [tab, setTab] = useState(null)

  useEffect(() => {
    api('/me/trips')
      .then(setData)
      .catch((err) => setError(err.message))
    api('/messages/threads')
      .then((d) => setUnread(Object.fromEntries(d.threads.map((t) => [t.bookingId, t.unread]))))
      .catch(() => {})
  }, [])

  const groups = { upcoming: [], current: [], past: [], cancelled: [] }
  for (const t of data?.trips ?? []) groups[tripPhase(t, data.today)].push(t)
  groups.upcoming.sort((a, b) => a.checkIn.localeCompare(b.checkIn))
  // Open on whichever tab matters most right now.
  const active = tab ?? (groups.current.length ? 'current' : 'upcoming')
  const trips = groups[active]

  return (
    <main className="ex-section">
      <header className="ex-section__head">
        <div>
          <p className="ex-eyebrow">Your bookings</p>
          <h1 className="ex-h1">My trips</h1>
          <p>See your stays, check-in details and messages. Change dates or cancel before a trip starts.</p>
        </div>
        <Link to="/explore" className="ex-btn">
          Find a stay <ArrowRight size={15} />
        </Link>
      </header>

      <div className="ex-tabs" role="tablist" aria-label="Trips">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            className={active === t.id ? 'is-active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label} <b>{groups[t.id].length}</b>
          </button>
        ))}
      </div>

      {error && <p className="ex-error">{error}</p>}
      {!data && !error && <p className="ex-empty">Loading your trips…</p>}
      {data && trips.length === 0 && <p className="ex-empty">{TABS.find((t) => t.id === active).empty}</p>}

      <ul className="ex-trips">
        {trips.map((t) => (
          <li key={t._id}>
            {t.listingImage ? <img src={t.listingImage} alt="" loading="lazy" /> : <span className="ex-card__nophoto" />}
            <div>
              <Link to={`/trips/${t._id}`}>
                <strong>{t.listingTitle}</strong>
              </Link>
              <small>
                <CalendarDays size={12} /> {day(t.checkIn)} → {day(t.checkOut)} · {plural(t.totalNights, 'night')} ·{' '}
                {plural(t.guestsCount, 'guest')}
              </small>
              <small>
                {TRIP_NOTE[t.status] ?? t.status} · Booking {t.bookingCode}
              </small>
            </div>
            <div className="ex-trips__end">
              <span className={`ex-status ex-status--${t.status}`}>{t.status}</span>
              <strong>{currency === 'USD' ? usd(t.totalPriceUSD) : npr(t.totalPriceNPR)}</strong>
              <Link to={`/trips/${t._id}`} className="ex-btn ex-btn--sm">
                {unread[t._id] > 0 ? (
                  <>
                    <MessageCircle size={14} /> {plural(unread[t._id], 'new message')}
                  </>
                ) : (
                  'Open trip'
                )}
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </main>
  )
}
