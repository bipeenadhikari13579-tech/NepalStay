import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { api } from '../../lib/api.js'
import { useConfirm } from '../../components/ConfirmDialog.jsx'
import { day, number } from '../../lib/format.js'

const TABS = [
  { id: '', label: 'All' },
  { id: 'pending', label: 'Requests' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'declined', label: 'Declined' },
]

const MOVES = {
  pending: [
    { to: 'confirmed', label: 'Approve', primary: true },
    { to: 'declined', label: 'Decline', confirm: 'Decline this booking request?', yes: 'Yes, decline' },
  ],
  confirmed: [
    { to: 'completed', label: 'Mark completed' },
    { to: 'cancelled', label: 'Cancel', confirm: 'Cancel this confirmed reservation? This cannot be undone.', yes: 'Yes, cancel it' },
  ],
}

export default function Reservations({ scope = 'host' }) {
  const { refreshSummary } = useOutletContext()
  const [status, setStatus] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [ask, confirmDialog] = useConfirm()

  const load = useCallback(() => {
    api(`/${scope}/bookings${status ? `?status=${status}` : ''}`)
      .then((d) => {
        setData(d)
        setError('')
      })
      .catch((err) => setError(err.message))
  }, [scope, status])
  useEffect(load, [load])

  async function move(b, m) {
    if (m.confirm && !(await ask(m.confirm, { confirmLabel: m.yes }))) return
    setBusyId(b._id)
    try {
      await api(`/${scope}/bookings/${b._id}`, { method: 'PATCH', body: { status: m.to } })
      load()
      refreshSummary()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const counts = data?.counts ?? {}
  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  return (
    <>
      {confirmDialog}
      <header className="adm-page__head">
        <div>
          <h1>Reservations</h1>
          <p>Approve or decline booking requests, and cancel or complete confirmed stays.</p>
        </div>
      </header>

      <section className="adm-card">
        <div className="adm-toolbar">
          <div className="adm-tabs" role="tablist" aria-label="Filter by status">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={status === t.id}
                className={status === t.id ? 'is-active' : ''}
                onClick={() => setStatus(t.id)}
              >
                {t.label} <b>{t.id ? (counts[t.id] ?? 0) : total}</b>
              </button>
            ))}
          </div>
        </div>

        {error && <p className="adm-error">{error}</p>}
        {!data && !error && <p className="adm-empty">Loading reservations…</p>}
        {data?.bookings.length === 0 && <p className="adm-empty">No reservations here.</p>}

        {data?.bookings.length > 0 && (
          <div className="adm-tablewrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Guest</th>
                  <th>Property</th>
                  <th>Check-in → Check-out</th>
                  <th>Total (NPR)</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.bookings.map((b) => (
                  <tr key={b._id}>
                    <td className="mono">{b.bookingCode || '—'}</td>
                    <td>
                      <strong>{b.guestName || 'Guest'}</strong>
                      <small>{b.guestEmail}</small>
                    </td>
                    <td>
                      {b.listingTitle}
                      <small>{b.listingLocation}</small>
                    </td>
                    <td>
                      {day(b.checkIn)} → {day(b.checkOut)}
                      <small>
                        {b.totalNights} {b.totalNights === 1 ? 'night' : 'nights'} · {b.guestsCount}{' '}
                        {b.guestsCount === 1 ? 'guest' : 'guests'}
                      </small>
                    </td>
                    <td className="num">{number(b.totalPriceNPR)}</td>
                    <td>
                      <span className={`adm-status adm-status--${b.status}`}>{b.status}</span>
                    </td>
                    <td>
                      <div className="adm-rows__actions">
                        <Link to={`/${scope}/reservations/${b._id}`} className="adm-btn adm-btn--sm adm-btn--blue">
                          Open
                        </Link>
                        {MOVES[b.status]?.map((m) => (
                          <button
                            key={m.to}
                            type="button"
                            className={`adm-btn adm-btn--sm ${m.primary ? 'adm-btn--primary' : 'adm-btn--blue'}`}
                            disabled={busyId === b._id}
                            onClick={() => move(b, m)}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
