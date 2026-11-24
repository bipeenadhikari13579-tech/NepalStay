import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import Chat from '../../components/Chat.jsx'
import { useConfirm } from '../../components/ConfirmDialog.jsx'
import { api } from '../../lib/api.js'
import { day, npr } from '../../lib/format.js'
import { plural } from '../../lib/trips.js'

const MOVE = {
  confirmed: { label: 'Approve', primary: true },
  declined: { label: 'Decline', confirm: 'Decline this booking request?', yes: 'Yes, decline' },
  completed: { label: 'Mark completed' },
  cancelled: {
    label: 'Cancel reservation',
    confirm: 'Cancel this confirmed reservation? This cannot be undone.',
    yes: 'Yes, cancel it',
  },
}

/** One reservation with the guest's details, status actions and the conversation. */
export default function ReservationPage({ scope = 'host' }) {
  const { id } = useParams()
  const { refreshSummary } = useOutletContext()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [ask, confirmDialog] = useConfirm()

  const load = useCallback(() => {
    api(`/${scope}/bookings/${id}`)
      .then((d) => {
        setData(d)
        setError('')
      })
      .catch((err) => setError(err.message))
  }, [scope, id])
  useEffect(load, [load])

  async function move(to) {
    if (MOVE[to].confirm && !(await ask(MOVE[to].confirm, { confirmLabel: MOVE[to].yes }))) return
    setBusy(true)
    try {
      await api(`/${scope}/bookings/${id}`, { method: 'PATCH', body: { status: to } })
      load()
      refreshSummary()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const back = (
    <Link to={`/${scope}/reservations`} className="adm-link adm-link--inline">
      <ArrowLeft size={14} /> All reservations
    </Link>
  )

  if (error && !data) {
    return (
      <>
        {back}
        <p className="adm-error">{error}</p>
      </>
    )
  }
  if (!data) return <p className="adm-muted">Loading reservation…</p>

  const { booking: b, listing, moves } = data

  return (
    <>
      {confirmDialog}
      <header className="adm-page__head">
        <div>
          {back}
          <h1>{b.guestName || 'Guest'}</h1>
          <p>
            <span className={`adm-status adm-status--${b.status}`}>{b.status}</span> · Booking {b.bookingCode || '—'}
          </p>
        </div>
        <div className="adm-rows__actions">
          {moves.map((to) => (
            <button
              key={to}
              type="button"
              className={`adm-btn ${MOVE[to].primary ? 'adm-btn--primary' : 'adm-btn--blue'}`}
              disabled={busy}
              onClick={() => move(to)}
            >
              {MOVE[to].label}
            </button>
          ))}
        </div>
      </header>

      {error && <p className="adm-error">{error}</p>}

      <div className="adm-cols">
        <div className="adm-col">
          <section className="adm-card">
            <h2>Reservation</h2>
            <dl className="adm-dl">
              <dt>Homestay</dt>
              <dd>
                {listing?.title ?? b.listingTitle}
                <small>{listing?.address || listing?.location || b.listingLocation}</small>
              </dd>
              <dt>Dates</dt>
              <dd>
                {day(b.checkIn)} → {day(b.checkOut)}
                <small>{plural(b.totalNights, 'night')}</small>
              </dd>
              <dt>Guests</dt>
              <dd>{plural(b.guestsCount, 'guest')}</dd>
              <dt>Total</dt>
              <dd>{npr(b.totalPriceNPR)}</dd>
              <dt>Guest email</dt>
              <dd>{b.guestEmail || '—'}</dd>
              <dt>Guest's note</dt>
              <dd className="adm-dl__note">{b.specialRequests || 'None'}</dd>
            </dl>
          </section>
        </div>

        <div className="adm-col">
          <section className="adm-card">
            <h2>Messages with {b.guestName || 'the guest'}</h2>
            <Chat
              bookingId={b._id}
              otherName={b.guestName || 'the guest'}
              emptyHint="No messages yet. Send arrival details or answer the guest's questions here."
            />
          </section>
        </div>
      </div>
    </>
  )
}
