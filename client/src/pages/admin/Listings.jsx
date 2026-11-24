import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { Plus, Search, Star } from 'lucide-react'
import { api } from '../../lib/api.js'
import { ago, npr } from '../../lib/format.js'

const TABS = [
  { id: '', label: 'All' },
  { id: 'published', label: 'Published' },
  { id: 'pending', label: 'Pending review' },
  { id: 'draft', label: 'Draft' },
  { id: 'snoozed', label: 'Snoozed' },
]

// The one-click status changes offered for a listing in each state.
// Hosts cannot publish: they submit for review and an admin approves.
const MOVES = {
  admin: {
    draft: [{ to: 'published', label: 'Publish', primary: true }],
    pending: [
      { to: 'published', label: 'Approve', primary: true },
      { to: 'draft', label: 'Send back' },
    ],
    published: [{ to: 'snoozed', label: 'Snooze' }],
    snoozed: [{ to: 'published', label: 'Unsnooze', primary: true }],
  },
  host: {
    draft: [{ to: 'pending', label: 'Submit for review', primary: true }],
    pending: [{ to: 'draft', label: 'Withdraw' }],
    published: [{ to: 'snoozed', label: 'Snooze' }],
    snoozed: [{ to: 'published', label: 'Unsnooze', primary: true }],
  },
}

/**
 * Listing management for the admin console (scope "admin") and the Host Desk (scope "host").
 * With `queue`, shows only listings awaiting review.
 */
export default function Listings({ queue = false, scope = 'admin' }) {
  const isHostDesk = scope === 'host'
  const { refreshSummary } = useOutletContext()
  const [params, setParams] = useSearchParams()
  const status = queue ? 'pending' : (params.get('status') ?? '')
  const q = params.get('q') ?? ''
  const [draftQ, setDraftQ] = useState(q)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  useEffect(() => setDraftQ(q), [q])

  const load = useCallback(() => {
    const query = new URLSearchParams()
    if (status) query.set('status', status)
    if (q) query.set('q', q)
    api(`/${scope}/listings?${query}`)
      .then((d) => {
        setData(d)
        setError('')
      })
      .catch((err) => setError(err.message))
  }, [scope, status, q])
  useEffect(load, [load])

  function setParam(key, value) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  async function move(id, to) {
    setBusyId(id)
    try {
      await api(`/${scope}/listings/${id}`, { method: 'PATCH', body: { status: to } })
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
      <header className="adm-page__head">
        <div>
          <h1>{queue ? 'Verification Queue' : isHostDesk ? 'My Listings' : 'Listings'}</h1>
          <p>
            {queue
              ? 'Homestays submitted for review. Approve to make them live, or send them back as drafts.'
              : isHostDesk
                ? 'Add and edit your homestays. A new listing goes live after Nepal Stay reviews it.'
                : 'Create, edit, publish or snooze homestay listings.'}
          </p>
        </div>
        {!queue && (
          <Link to={`/${scope}/listings/new`} className="adm-btn adm-btn--primary">
            <Plus size={16} /> New listing
          </Link>
        )}
      </header>

      <section className="adm-card">
        <div className="adm-toolbar">
          {!queue && (
            <div className="adm-tabs" role="tablist" aria-label="Filter by status">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={status === t.id}
                  className={status === t.id ? 'is-active' : ''}
                  onClick={() => setParam('status', t.id)}
                >
                  {t.label} <b>{t.id ? (counts[t.id] ?? 0) : total}</b>
                </button>
              ))}
            </div>
          )}
          <form
            className="adm-search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault()
              setParam('q', draftQ.trim())
            }}
          >
            <Search size={15} />
            <input
              type="search"
              placeholder="Search title, town, host…"
              aria-label="Search listings"
              value={draftQ}
              onChange={(e) => {
                setDraftQ(e.target.value)
                if (!e.target.value) setParam('q', '')
              }}
            />
          </form>
        </div>

        {error && <p className="adm-error">{error}</p>}
        {!data && !error && <p className="adm-empty">Loading listings…</p>}
        {data?.listings.length === 0 && (
          <p className="adm-empty">
            {q
              ? `No listings match "${q}".`
              : queue
                ? 'No homestays are waiting for review.'
                : isHostDesk && !status
                  ? 'You have no listings yet. Click "New listing" to add your first homestay.'
                  : 'No listings here yet.'}
          </p>
        )}

        <ul className="adm-rows">
          {data?.listings.map((l) => (
            <li key={l._id}>
              {l.images?.[0] ? <img src={l.images[0]} alt="" loading="lazy" /> : <span className="adm-thumb" />}
              <div className="adm-rows__main">
                <strong>
                  {l.title}
                  {l.featured && <Star size={13} className="t-orange" fill="currentColor" aria-label="Featured" />}
                </strong>
                <small>
                  {[l.location, l.region, l.stayType].filter(Boolean).join(' · ')}
                </small>
                <small>
                  Host: {l.host?.name || 'not set'} · up to {l.maxGuests} guests · updated {ago(l.updatedAt)}
                </small>
              </div>
              <div className="adm-rows__price">
                <strong>{npr(l.pricePerNightNPR)}</strong>
                <small>per night</small>
              </div>
              <span className={`adm-status adm-status--${l.status}`}>
                {isHostDesk && l.status === 'pending' ? 'in review' : l.status}
              </span>
              <div className="adm-rows__actions">
                {MOVES[scope][l.status]?.map((m) => (
                  <button
                    key={m.to}
                    type="button"
                    className={`adm-btn adm-btn--sm ${m.primary ? 'adm-btn--primary' : 'adm-btn--blue'}`}
                    disabled={busyId === l._id}
                    onClick={() => move(l._id, m.to)}
                  >
                    {m.label}
                  </button>
                ))}
                <Link to={`/${scope}/listings/${l._id}`} className="adm-btn adm-btn--sm adm-btn--blue">
                  {queue ? 'Inspect' : 'Edit'}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
