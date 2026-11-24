import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api.js'
import { ago, day } from '../../lib/format.js'

/** Guest Messaging: every reservation conversation, most recent first. */
export default function InboxPage({ scope = 'host' }) {
  const [threads, setThreads] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/messages/threads')
      .then((d) => setThreads(d.threads))
      .catch((err) => setError(err.message))
  }, [])

  return (
    <>
      <header className="adm-page__head">
        <div>
          <h1>Guest Messaging</h1>
          <p>
            One conversation per reservation. Open one to reply, before, during or after the stay.
          </p>
        </div>
      </header>

      <section className="adm-card">
        {error && <p className="adm-error">{error}</p>}
        {!threads && !error && <p className="adm-empty">Loading conversations…</p>}
        {threads?.length === 0 && (
          <p className="adm-empty">No conversations yet. They start when a guest requests a booking.</p>
        )}
        <ul className="adm-threads">
          {threads?.map((t) => (
            <li key={t.bookingId}>
              <Link to={`/${scope}/reservations/${t.bookingId}`}>
                <span className="adm-avatar">{(t.guestName || 'G').charAt(0).toUpperCase()}</span>
                <span className="adm-threads__main">
                  <strong>
                    {t.guestName || 'Guest'}
                    {t.unread > 0 && <b className="adm-nav__badge">{t.unread}</b>}
                  </strong>
                  <small>
                    {t.listingTitle} · {day(t.checkIn)} → {day(t.checkOut)}
                  </small>
                  <span className={`adm-threads__last ${t.unread > 0 ? 'is-unread' : ''}`}>
                    {t.last ? `${t.last.side === 'host' ? 'You: ' : ''}${t.last.text}` : 'No messages yet'}
                  </span>
                </span>
                <span className="adm-threads__end">
                  <span className={`adm-status adm-status--${t.status}`}>{t.status}</span>
                  {t.last && <small>{ago(t.last.createdAt)}</small>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
