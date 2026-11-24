import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import {
  ArrowRight,
  Banknote,
  BadgeCheck,
  Clock,
  Cloud,
  CloudFog,
  CloudRain,
  CloudSnow,
  Home,
  IdCard,
  ShieldCheck,
  Sun,
  TicketCheck,
  TriangleAlert,
  Wind,
} from 'lucide-react'
import { api } from '../../lib/api.js'
import { day, nepalTime, npr, nprCompact, number, usd } from '../../lib/format.js'

const WEATHER_SPOTS = [
  { name: 'Annapurna Circuit', place: 'Thorong La Pass', lat: 28.7936, lng: 83.9383 },
  { name: 'Everest Khumbu Region', place: 'Namche Bazaar', lat: 27.8069, lng: 86.714 },
  { name: 'Langtang Valley', place: 'Kyanjin Gompa', lat: 28.2117, lng: 85.5667 },
]

function describeWeather(code, wind) {
  if (wind >= 40) return { text: `High wind warning (${Math.round(wind)} km/h)`, icon: Wind, alert: true }
  if (code === 0) return { text: 'Clear skies', icon: Sun }
  if (code <= 3) return { text: 'Partly cloudy', icon: Cloud }
  if (code <= 48) return { text: 'Fog', icon: CloudFog }
  if (code <= 67) return { text: 'Rain', icon: CloudRain }
  if (code <= 77) return { text: 'Snow', icon: CloudSnow, alert: code >= 73 }
  if (code <= 82) return { text: 'Rain showers', icon: CloudRain }
  if (code <= 86) return { text: 'Snow showers', icon: CloudSnow }
  return { text: 'Thunderstorm', icon: TriangleAlert, alert: true }
}

/** Live conditions from Open-Meteo (free, no key). */
function useWeather() {
  const [state, setState] = useState({ status: 'loading', spots: [] })
  useEffect(() => {
    const url =
      'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${WEATHER_SPOTS.map((s) => s.lat).join(',')}` +
      `&longitude=${WEATHER_SPOTS.map((s) => s.lng).join(',')}` +
      '&current=temperature_2m,weather_code,wind_speed_10m'
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        const rows = Array.isArray(data) ? data : [data]
        setState({
          status: 'ok',
          spots: WEATHER_SPOTS.map((s, i) => ({
            ...s,
            temp: Math.round(rows[i].current.temperature_2m),
            ...describeWeather(rows[i].current.weather_code, rows[i].current.wind_speed_10m),
          })),
        })
      })
      .catch(() => setState({ status: 'error', spots: [] }))
  }, [])
  return state
}

function useNepalClock() {
  const [time, setTime] = useState(nepalTime)
  useEffect(() => {
    const t = setInterval(() => setTime(nepalTime()), 20000)
    return () => clearInterval(t)
  }, [])
  return time
}

export default function Overview() {
  const { refreshSummary } = useOutletContext()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const weather = useWeather()
  const time = useNepalClock()

  const load = useCallback(() => {
    api('/admin/overview')
      .then(setData)
      .catch((err) => setError(err.message))
  }, [])
  useEffect(load, [load])

  async function approve(id) {
    setBusyId(id)
    try {
      await api(`/admin/listings/${id}`, { method: 'PATCH', body: { status: 'published' } })
      load()
      refreshSummary()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  if (error && !data) return <p className="adm-error">{error}</p>
  if (!data) return <p className="adm-muted">Loading overview…</p>

  const { stats, queue, pendingCount, recentBookings } = data
  const alertSpot = weather.spots.find((s) => s.alert)

  return (
    <>
      <section className="adm-card adm-hero">
        <div>
          <p className="adm-hero__tags">
            <span className="adm-tag adm-tag--peach">Regional Operations Center</span>
            <span className="adm-live">
              <i /> Live
            </span>
          </p>
          <h1>Platform Operations &amp; Himalayan Network Console</h1>
          <p className="adm-hero__lede">
            Homestay verification, reservations, host earnings and alpine route safety across
            Nepal Stay.
          </p>
          <ul className="adm-chips">
            <li>
              <Clock size={14} className="t-red" /> <b>Nepal Time:</b> {time} (+05:45 NPT)
            </li>
            <li>
              <Sun size={14} /> <b>Alpine conditions:</b>{' '}
              {weather.status === 'loading'
                ? 'checking…'
                : weather.status === 'error'
                  ? 'unavailable'
                  : alertSpot
                    ? `${alertSpot.text} at ${alertSpot.place}`
                    : 'No warnings on monitored routes'}
            </li>
          </ul>
        </div>
        <div className="adm-hero__actions">
          <Link to="/admin/verification" className="adm-btn adm-btn--primary">
            <ShieldCheck size={16} /> Audit New Homestay
          </Link>
          <Link to="/admin/kyc" className="adm-btn adm-btn--blue">
            <IdCard size={16} /> Review Host KYC
          </Link>
        </div>
      </section>

      {error && <p className="adm-error">{error}</p>}

      <section className="adm-stats adm-stats--3">
        <article className="adm-card adm-stat">
          <header>
            <span>Active Homestays</span>
            <i className="ic ic--red">
              <Home size={16} />
            </i>
          </header>
          <strong>{number(stats.activeHomestays)}</strong>
          <footer>
            <span>+{stats.newThisWeek} this week</span>
            <span>
              {stats.regions} {stats.regions === 1 ? 'region' : 'regions'}
            </span>
          </footer>
        </article>
        <article className="adm-card adm-stat">
          <header>
            <span>Booking Revenue</span>
            <i className="ic ic--orange">
              <Banknote size={16} />
            </i>
          </header>
          <strong>{nprCompact(stats.revenueNPR)}</strong>
          <footer>
            <span className="t-green">Confirmed stays</span>
            <span>≈ {usd(stats.revenueUSD)} USD</span>
          </footer>
        </article>
        <article className="adm-card adm-stat">
          <header>
            <span>Traveler Bookings</span>
            <i className="ic ic--blue">
              <TicketCheck size={16} />
            </i>
          </header>
          <strong>{number(stats.bookings)}</strong>
          <footer>
            <span className="t-red">{stats.pendingBookings} awaiting reply</span>
            <span>{stats.confirmedBookings} confirmed</span>
          </footer>
        </article>
      </section>

      <div className="adm-cols">
        <div className="adm-col">
          <section className="adm-card">
            <header className="adm-card__head">
              <i className="ic ic--red">
                <BadgeCheck size={17} />
              </i>
              <div>
                <h2>Homestay Verification Queue</h2>
                <p>Listings submitted for review before they go live.</p>
              </div>
              <span className="adm-tag adm-tag--peach">{pendingCount} pending review</span>
            </header>

            {queue.length === 0 ? (
              <p className="adm-empty">No homestays are waiting for review.</p>
            ) : (
              <ul className="adm-queue">
                {queue.map((l) => (
                  <li key={l._id}>
                    {l.images?.[0] ? (
                      <img src={l.images[0]} alt="" loading="lazy" />
                    ) : (
                      <span className="adm-thumb" />
                    )}
                    <div className="adm-queue__info">
                      <strong>{l.title}</strong>
                      <span className="adm-tag">{l.location}</span>
                      <small>
                        Host: {l.host?.name || 'not set'} · {l.stayType || 'Stay'} ·{' '}
                        {npr(l.pricePerNightNPR)}/night
                      </small>
                    </div>
                    <div className="adm-queue__actions">
                      <button
                        type="button"
                        className="adm-btn adm-btn--primary adm-btn--sm"
                        disabled={busyId === l._id}
                        onClick={() => approve(l._id)}
                      >
                        {busyId === l._id ? 'Approving…' : 'Approve'}
                      </button>
                      <Link to={`/admin/listings/${l._id}`} className="adm-btn adm-btn--blue adm-btn--sm">
                        Inspect
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {pendingCount > queue.length && (
              <Link to="/admin/verification" className="adm-link">
                View all {pendingCount} <ArrowRight size={14} />
              </Link>
            )}
          </section>

          <section className="adm-card">
            <header className="adm-card__head">
              <div>
                <h2>Recent Reservations</h2>
                <p>Latest bookings across all homestays.</p>
              </div>
            </header>
            {recentBookings.length === 0 ? (
              <p className="adm-empty">No reservations yet.</p>
            ) : (
              <div className="adm-tablewrap">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>Guest / Property</th>
                      <th>Stay</th>
                      <th>Amount (NPR)</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentBookings.map((b) => (
                      <tr key={b._id}>
                        <td>
                          <strong>{b.guestName || 'Guest'}</strong>
                          <small>{b.listingTitle}</small>
                        </td>
                        <td>
                          {day(b.checkIn)}
                          <small>
                            {b.totalNights} {b.totalNights === 1 ? 'night' : 'nights'} · {b.listingLocation}
                          </small>
                        </td>
                        <td className="num">{number(b.totalPriceNPR)}</td>
                        <td>
                          <span className={`adm-status adm-status--${b.status}`}>{b.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div className="adm-col">
          <section className="adm-card">
            <header className="adm-card__head">
              <i className="ic ic--red">
                <CloudSnow size={17} />
              </i>
              <div>
                <h2>Alpine Weather &amp; Safety</h2>
              </div>
              {weather.status === 'ok' && (
                <span className="adm-live">
                  <i /> Live
                </span>
              )}
            </header>
            {weather.status === 'loading' && <p className="adm-empty">Checking conditions…</p>}
            {weather.status === 'error' && (
              <p className="adm-empty">Live weather is unavailable right now.</p>
            )}
            <ul className="adm-weather">
              {weather.spots.map(({ name, place, temp, text, icon: Icon, alert }) => (
                <li key={name} className={alert ? 'is-alert' : ''}>
                  <i>
                    <Icon size={17} />
                  </i>
                  <div>
                    <strong>{name}</strong>
                    <small>{place}</small>
                  </div>
                  <div className="adm-weather__temp">
                    <strong>
                      {temp > 0 ? '+' : ''}
                      {temp}°C
                    </strong>
                    <small>{text}</small>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  )
}
