import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, Clock, DoorOpen, KeyRound, Lock, MapPin, Users, Wifi } from 'lucide-react'
import Chat from '../../components/Chat.jsx'
import { useConfirm } from '../../components/ConfirmDialog.jsx'
import { api } from '../../lib/api.js'
import { day, npr, usd } from '../../lib/format.js'
import { TRIP_NOTE, plural } from '../../lib/trips.js'

export default function TripPage() {
  const { id } = useParams()
  const { currency } = useOutletContext()
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ checkIn: '', checkOut: '', guests: 1 })
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [ask, confirmDialog] = useConfirm()

  const load = useCallback(() => {
    api(`/me/trips/${id}`)
      .then((d) => {
        setData(d)
        setForm({ checkIn: d.trip.checkIn, checkOut: d.trip.checkOut, guests: d.trip.guestsCount })
      })
      .catch((err) => setLoadError(err.message))
  }, [id])
  useEffect(load, [load])

  if (loadError) {
    return (
      <main className="ex-section">
        <p className="ex-error">{loadError}</p>
        <Link to="/trips" className="ex-back">
          <ArrowLeft size={15} /> Back to my trips
        </Link>
      </main>
    )
  }
  if (!data) return <main className="ex-section"><p className="ex-empty">Loading trip…</p></main>

  const { trip, stay, checkInInfo, canChange, today } = data
  const info = checkInInfo ?? {}
  const hasInfo = Object.values(info).some(Boolean)

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setErrors({})
    setFailure('')
  }

  async function saveDates(e) {
    e.preventDefault()
    setBusy(true)
    setFailure('')
    try {
      const d = await api(`/me/trips/${id}/dates`, { method: 'POST', body: form })
      setEditing(false)
      setNotice(
        d.needsReconfirm
          ? 'Dates changed. Your host needs to confirm the new dates.'
          : 'Dates changed.',
      )
      load()
    } catch (err) {
      setErrors(err.errors ?? {})
      setFailure(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function cancelTrip() {
    const sure = await ask(
      data.trip.status === 'pending'
        ? 'Withdraw this booking request? This cannot be undone.'
        : 'Cancel this trip? This cannot be undone.',
      { confirmLabel: 'Yes, cancel it', cancelLabel: 'Keep my trip' },
    )
    if (!sure) return
    setBusy(true)
    setFailure('')
    try {
      await api(`/me/trips/${id}/cancel`, { method: 'POST' })
      setNotice('Trip cancelled.')
      setEditing(false)
      load()
    } catch (err) {
      setFailure(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="ex-section ex-trip">
      {confirmDialog}
      <Link to="/trips" className="ex-back">
        <ArrowLeft size={15} /> Back to my trips
      </Link>

      <header className="ex-stay__head">
        <div>
          <h1>{trip.listingTitle}</h1>
          <p>
            <span className={`ex-status ex-status--${trip.status}`}>{trip.status}</span>
            <span>{TRIP_NOTE[trip.status]}</span>
            <span>Booking {trip.bookingCode}</span>
          </p>
        </div>
        <Link to={`/stays/${trip.listingId}`} className="ex-btn">
          View the stay
        </Link>
      </header>

      {notice && <p className="ex-ok">{notice}</p>}
      {failure && !editing && <p className="ex-error">{failure}</p>}

      <div className="ex-stay__cols">
        <div className="ex-trip__main">
          <section className="ex-panel">
            <h2>Your stay</h2>
            <ul className="ex-kv">
              <li>
                <CalendarDays size={16} />
                <span>
                  <b>
                    {day(trip.checkIn)} → {day(trip.checkOut)}
                  </b>
                  <small>{plural(trip.totalNights, 'night')}</small>
                </span>
              </li>
              <li>
                <Users size={16} />
                <span>
                  <b>{plural(trip.guestsCount, 'guest')}</b>
                  {stay?.hostName && <small>Hosted by {stay.hostName}</small>}
                </span>
              </li>
              <li>
                <MapPin size={16} />
                <span>
                  <b>{stay?.address || trip.listingLocation}</b>
                  <small>
                    Total {currency === 'USD' ? usd(trip.totalPriceUSD) : npr(trip.totalPriceNPR)} · nothing has
                    been charged
                  </small>
                </span>
              </li>
            </ul>

            {canChange && !editing && (
              <div className="ex-trip__actions">
                <button type="button" className="ex-btn" onClick={() => { setEditing(true); setNotice('') }}>
                  Change dates
                </button>
                <button type="button" className="ex-btn ex-btn--danger" disabled={busy} onClick={cancelTrip}>
                  {trip.status === 'pending' ? 'Cancel request' : 'Cancel trip'}
                </button>
              </div>
            )}
            {!canChange && trip.status === 'confirmed' && trip.checkIn <= today && (
              <p className="ex-muted">This trip has started, so dates can no longer be changed here. Message your host.</p>
            )}

            {editing && (
              <form className="ex-trip__edit" onSubmit={saveDates} noValidate>
                <div className="ex-book__dates">
                  <label className={errors.checkIn ? 'has-error' : ''}>
                    <span>Check-in</span>
                    <input type="date" min={today} value={form.checkIn} onChange={set('checkIn')} />
                  </label>
                  <label className={errors.checkOut ? 'has-error' : ''}>
                    <span>Check-out</span>
                    <input type="date" min={form.checkIn || today} value={form.checkOut} onChange={set('checkOut')} />
                  </label>
                </div>
                <label className={errors.guests ? 'has-error' : ''}>
                  <span>Guests</span>
                  <select value={form.guests} onChange={set('guests')}>
                    {Array.from({ length: stay?.maxGuests ?? trip.guestsCount }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {plural(n, 'guest')}
                      </option>
                    ))}
                  </select>
                </label>
                {failure && <p className="ex-book__error">{Object.values(errors)[0] || failure}</p>}
                {trip.status === 'confirmed' && (
                  <p className="ex-muted">Your host will need to confirm the new dates again.</p>
                )}
                <div className="ex-trip__actions">
                  <button type="submit" className="ex-btn ex-btn--primary" disabled={busy}>
                    {busy ? 'Saving…' : 'Save new dates'}
                  </button>
                  <button type="button" className="ex-btn" onClick={() => { setEditing(false); setFailure('') }}>
                    Keep current dates
                  </button>
                </div>
              </form>
            )}
          </section>

          <section className="ex-panel">
            <h2>Check-in details</h2>
            {!checkInInfo ? (
              <p className="ex-locked">
                <Lock size={16} /> Wi-Fi, door code and arrival details appear here once your host confirms the
                booking.
              </p>
            ) : !hasInfo && !stay?.arrivalGuide ? (
              <p className="ex-muted">Your host has not added check-in details yet. Send them a message to ask.</p>
            ) : (
              <ul className="ex-kv">
                {info.time && (
                  <li>
                    <Clock size={16} />
                    <span>
                      <small>Check-in time</small>
                      <b>{info.time}</b>
                    </span>
                  </li>
                )}
                {(info.wifiName || info.wifiPassword) && (
                  <li>
                    <Wifi size={16} />
                    <span>
                      <small>Wi-Fi{info.wifiName ? `: ${info.wifiName}` : ''}</small>
                      <b className="ex-code">{info.wifiPassword || 'No password'}</b>
                    </span>
                  </li>
                )}
                {info.doorCode && (
                  <li>
                    <KeyRound size={16} />
                    <span>
                      <small>Door / lockbox code</small>
                      <b className="ex-code">{info.doorCode}</b>
                    </span>
                  </li>
                )}
                {(info.directions || stay?.arrivalGuide) && (
                  <li>
                    <DoorOpen size={16} />
                    <span>
                      <small>Getting there</small>
                      <b className="ex-prose">{info.directions || stay.arrivalGuide}</b>
                    </span>
                  </li>
                )}
              </ul>
            )}
          </section>
        </div>

        <aside className="ex-panel ex-trip__chat">
          <h2>Messages with {stay?.hostName || 'your host'}</h2>
          <Chat
            bookingId={trip._id}
            otherName={stay?.hostName || 'your host'}
            emptyHint="No messages yet. Ask your host anything about the stay."
          />
        </aside>
      </div>
    </main>
  )
}
