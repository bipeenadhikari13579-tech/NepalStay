import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  BedDouble,
  CalendarCheck,
  CircleCheck,
  Home,
  IdCard,
  Inbox,
  Plus,
  TicketCheck,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useConfirm } from '../../components/ConfirmDialog.jsx'
import { api } from '../../lib/api.js'
import { day, npr, nprCompact, number } from '../../lib/format.js'

const STEPS = [
  { title: 'Add your homestay', text: 'Title, price, photos, amenities and house rules.' },
  { title: 'Submit it for review', text: 'Nepal Stay checks every listing before it goes live.' },
  { title: 'Welcome your guests', text: 'Approve booking requests here as they arrive.' },
]

export default function HostOverview() {
  const { user } = useAuth()
  const { refreshSummary, summary } = useOutletContext()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [ask, confirmDialog] = useConfirm()

  const load = useCallback(() => {
    api('/host/overview')
      .then(setData)
      .catch((err) => setError(err.message))
  }, [])
  useEffect(load, [load])

  async function answer(b, status) {
    if (
      status === 'declined' &&
      !(await ask(`Decline ${b.guestName || 'this guest'}'s request?`, { confirmLabel: 'Yes, decline' }))
    )
      return
    setBusyId(b._id)
    try {
      await api(`/host/bookings/${b._id}`, { method: 'PATCH', body: { status } })
      load()
      refreshSummary()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  if (error && !data) return <p className="adm-error">{error}</p>
  if (!data) return <p className="adm-muted">Loading your desk…</p>

  const { stats, requests, upcoming, listings, today } = data
  const todayGroups = [
    { title: 'Arriving today', list: today.checkIns, empty: 'No check-ins today.' },
    { title: 'Leaving today', list: today.checkOuts, empty: 'No check-outs today.' },
    { title: 'Staying now', list: today.staying, empty: 'No guests in the middle of a stay.' },
  ]
  // Which getting-started step the host is on (3 = all done).
  const step = stats.listings === 0 ? 0 : stats.live + stats.snoozed === 0 ? (stats.inReview ? 2 : 1) : 3
  const firstName = user.name.split(' ')[0]

  return (
    <>
      {confirmDialog}
      <section className="adm-card adm-hero">
        <div>
          <p className="adm-hero__tags">
            <span className="adm-tag adm-tag--peach">Himalayan Host Guild Partner</span>
          </p>
          <h1>Namaste, {firstName}</h1>
          <p className="adm-hero__lede">
            {stats.listings === 0
              ? 'Welcome to your Host Desk. Add your first homestay to start welcoming travelers.'
              : requests.length > 0
                ? `You have ${requests.length} booking ${requests.length === 1 ? 'request' : 'requests'} waiting for your answer.`
                : stats.live > 0
                  ? 'Your homestays are live. New booking requests will appear here.'
                  : 'Your listing is not live yet. Submit it for review when it is ready.'}
          </p>
          <ul className="adm-chips">
            <li>
              <b>Host ID:</b> {user.hostId}
              {summary.kycStatus === 'approved' && (
                <span className="adm-verified adm-verified--sm">
                  <BadgeCheck size={12} /> Verified
                </span>
              )}
            </li>
            <li>
              <b>Payout share:</b> 100% of stay fees
            </li>
          </ul>
        </div>
        <div className="adm-hero__actions">
          <Link to="/host/listings/new" className="adm-btn adm-btn--primary">
            <Plus size={16} /> Add a listing
          </Link>
          <Link to="/host/reservations" className="adm-btn adm-btn--blue">
            <TicketCheck size={16} /> View reservations
          </Link>
        </div>
      </section>

      {error && <p className="adm-error">{error}</p>}

      {summary.kycStatus && summary.kycStatus !== 'approved' && (
        <section className={`adm-card kyc-banner is-${summary.kycStatus}`}>
          <i className="ic ic--orange">
            <IdCard size={17} />
          </i>
          <div>
            <h2>
              {summary.kycStatus === 'pending'
                ? 'Your KYC documents are being reviewed'
                : summary.kycStatus === 'rejected'
                  ? 'Your KYC verification needs another look'
                  : 'Verify your identity to get the Verified tag'}
            </h2>
            <p>
              {summary.kycStatus === 'pending'
                ? 'Nepal Stay is checking your documents. Your Host ID gets the Verified tag once they are approved.'
                : summary.kycStatus === 'rejected'
                  ? 'Your last submission was not approved. See the reason and send your documents again.'
                  : 'Upload your company registration certificate, ID document and a photo of you holding it.'}
            </p>
          </div>
          {summary.kycStatus !== 'pending' && (
            <Link to="/host/kyc" className="adm-btn adm-btn--primary">
              {summary.kycStatus === 'rejected' ? 'Fix and resend' : 'Start KYC'} <ArrowRight size={15} />
            </Link>
          )}
        </section>
      )}

      <section className="adm-stats">
        <article className="adm-card adm-stat">
          <header>
            <span>Live Listings</span>
            <i className="ic ic--red">
              <Home size={16} />
            </i>
          </header>
          <strong>{number(stats.live)}</strong>
          <footer>
            <span>{stats.inReview} in review</span>
            <span>
              {stats.drafts} draft · {stats.snoozed} snoozed
            </span>
          </footer>
        </article>
        <article className="adm-card adm-stat">
          <header>
            <span>Booking Requests</span>
            <i className="ic ic--orange">
              <Inbox size={16} />
            </i>
          </header>
          <strong>{number(requests.length)}</strong>
          <footer>
            <span>Waiting for your answer</span>
          </footer>
        </article>
        <article className="adm-card adm-stat">
          <header>
            <span>Upcoming Stays</span>
            <i className="ic ic--blue">
              <CalendarCheck size={16} />
            </i>
          </header>
          <strong>{number(upcoming.length)}</strong>
          <footer>
            <span>Confirmed guests</span>
            <span>
              {stats.bookings} {stats.bookings === 1 ? 'booking' : 'bookings'} in total
            </span>
          </footer>
        </article>
        <article className="adm-card adm-stat">
          <header>
            <span>Earnings</span>
            <i className="ic ic--green">
              <Banknote size={16} />
            </i>
          </header>
          <strong>{nprCompact(stats.earningsNPR)}</strong>
          <footer>
            <span>Confirmed stays</span>
            <span>
              {stats.nights} {stats.nights === 1 ? 'night' : 'nights'} booked
            </span>
          </footer>
        </article>
      </section>

      <section className="adm-card">
        <header className="adm-card__head">
          <i className="ic ic--blue">
            <CalendarCheck size={17} />
          </i>
          <div>
            <h2>Today · {day(today.date)}</h2>
            <p>Who is arriving, leaving and staying with you today.</p>
          </div>
          {requests.length > 0 && (
            <span className="adm-tag adm-tag--peach">
              {requests.length} {requests.length === 1 ? 'request' : 'requests'} to answer
            </span>
          )}
        </header>
        <div className="adm-today">
          {todayGroups.map((g) => (
            <div key={g.title}>
              <h3>
                {g.title} <b>{g.list.length}</b>
              </h3>
              {g.list.length === 0 ? (
                <p className="adm-muted">{g.empty}</p>
              ) : (
                <ul>
                  {g.list.map((b) => (
                    <li key={b._id}>
                      <Link to={`/host/reservations/${b._id}`}>
                        <strong>{b.guestName || 'Guest'}</strong>
                        <small>
                          {b.listingTitle} · {b.guestsCount} {b.guestsCount === 1 ? 'guest' : 'guests'}
                        </small>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      {step < 3 && (
        <section className="adm-card">
          <header className="adm-card__head">
            <div>
              <h2>Getting started</h2>
              <p>Three steps to your first guest.</p>
            </div>
          </header>
          <ol className="adm-steps">
            {STEPS.map((s, i) => (
              <li key={s.title} className={i < step ? 'is-done' : i === step ? 'is-current' : ''}>
                <i>{i < step ? <CircleCheck size={18} /> : i + 1}</i>
                <div>
                  <strong>{s.title}</strong>
                  <small>{s.text}</small>
                </div>
              </li>
            ))}
          </ol>
          {step === 0 && (
            <Link to="/host/listings/new" className="adm-btn adm-btn--primary">
              <Plus size={16} /> Add your homestay
            </Link>
          )}
          {step === 1 && (
            <Link to="/host/listings" className="adm-btn adm-btn--primary">
              Open my listings <ArrowRight size={16} />
            </Link>
          )}
          {step === 2 && (
            <p className="adm-muted">
              Your listing is with Nepal Stay for review. You will see it marked “published” here once
              it is approved.
            </p>
          )}
        </section>
      )}

      <div className="adm-cols">
        <div className="adm-col">
          <section className="adm-card">
            <header className="adm-card__head">
              <i className="ic ic--orange">
                <Inbox size={17} />
              </i>
              <div>
                <h2>Booking requests</h2>
                <p>Approve or decline. Guests are waiting for your answer.</p>
              </div>
            </header>
            {requests.length === 0 ? (
              <p className="adm-empty">No requests waiting.</p>
            ) : (
              <ul className="adm-rows">
                {requests.map((b) => (
                  <li key={b._id}>
                    <div className="adm-rows__main">
                      <strong>{b.guestName || 'Guest'}</strong>
                      <small>
                        {b.listingTitle} · {b.guestsCount} {b.guestsCount === 1 ? 'guest' : 'guests'}
                      </small>
                      <small>
                        {day(b.checkIn)} → {day(b.checkOut)} · {b.totalNights}{' '}
                        {b.totalNights === 1 ? 'night' : 'nights'}
                      </small>
                    </div>
                    <div className="adm-rows__price">
                      <strong>{npr(b.totalPriceNPR)}</strong>
                    </div>
                    <div className="adm-rows__actions">
                      <button
                        type="button"
                        className="adm-btn adm-btn--primary adm-btn--sm"
                        disabled={busyId === b._id}
                        onClick={() => answer(b, 'confirmed')}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="adm-btn adm-btn--blue adm-btn--sm"
                        disabled={busyId === b._id}
                        onClick={() => answer(b, 'declined')}
                      >
                        Decline
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="adm-card">
            <header className="adm-card__head">
              <i className="ic ic--blue">
                <BedDouble size={17} />
              </i>
              <div>
                <h2>Upcoming stays</h2>
                <p>Confirmed guests, soonest first.</p>
              </div>
              <Link to="/host/reservations" className="adm-link adm-link--inline">
                All reservations
              </Link>
            </header>
            {upcoming.length === 0 ? (
              <p className="adm-empty">No confirmed stays coming up.</p>
            ) : (
              <div className="adm-tablewrap">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>Guest</th>
                      <th>Homestay</th>
                      <th>Check-in</th>
                      <th>Nights</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcoming.map((b) => (
                      <tr key={b._id}>
                        <td>
                          <strong>{b.guestName || 'Guest'}</strong>
                          <small>
                            {b.guestsCount} {b.guestsCount === 1 ? 'guest' : 'guests'}
                          </small>
                        </td>
                        <td>{b.listingTitle}</td>
                        <td>{day(b.checkIn)}</td>
                        <td className="num">{b.totalNights}</td>
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
                <Home size={17} />
              </i>
              <div>
                <h2>My listings</h2>
              </div>
              <Link to="/host/listings" className="adm-link adm-link--inline">
                Manage
              </Link>
            </header>
            {listings.length === 0 ? (
              <p className="adm-empty">You have not added a homestay yet.</p>
            ) : (
              <ul className="adm-mini">
                {listings.map((l) => (
                  <li key={l._id}>
                    {l.images?.[0] ? <img src={l.images[0]} alt="" loading="lazy" /> : <span className="adm-thumb" />}
                    <Link to={`/host/listings/${l._id}`}>
                      <strong>{l.title}</strong>
                      <small>
                        {l.location} · {npr(l.pricePerNightNPR)}/night
                      </small>
                    </Link>
                    <span className={`adm-status adm-status--${l.status}`}>
                      {l.status === 'pending' ? 'in review' : l.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  )
}
