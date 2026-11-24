import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { api } from '../../lib/api.js'
import { day, number } from '../../lib/format.js'
import { useListingPicker } from './ListingPicker.jsx'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const LEGEND = [
  ['free', 'Open'],
  ['booked', 'Booked'],
  ['requested', 'Requested'],
  ['blocked', 'Blocked by you'],
]

const monthLabel = (m) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

function shiftMonth(month, by) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + by, 1))
  return d.toISOString().slice(0, 7)
}

export default function CalendarPage({ scope = 'host' }) {
  const { listingId, picker } = useListingPicker(scope)
  const [month, setMonth] = useState(null)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [rules, setRules] = useState({ minNights: 1, maxNights: 30, advanceNoticeDays: 0 })
  const [ruleErrors, setRuleErrors] = useState({})
  const [blocked, setBlocked] = useState([])
  const [range, setRange] = useState({ from: '', to: '', note: '' })

  const load = useCallback(() => {
    if (!listingId) return
    api(`/${scope}/listings/${listingId}/calendar${month ? `?month=${month}` : ''}`)
      .then((d) => {
        setData(d)
        setRules(d.rules)
        setBlocked(d.blocked)
        setError('')
      })
      .catch((err) => setError(err.message))
  }, [scope, listingId, month])
  useEffect(load, [load])

  // A different listing starts with a clean form.
  useEffect(() => {
    setRange({ from: '', to: '', note: '' })
    setNotice('')
    setRuleErrors({})
  }, [listingId])

  async function save(nextBlocked, okMessage) {
    setBusy(true)
    setError('')
    setNotice('')
    setRuleErrors({})
    try {
      await api(`/${scope}/listings/${listingId}/availability`, {
        method: 'PATCH',
        body: { ...rules, blocked: nextBlocked },
      })
      setNotice(okMessage)
      load()
      return true
    } catch (err) {
      setRuleErrors(err.errors ?? {})
      setError(err.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function addBlock(e) {
    e.preventDefault()
    if (!range.from) return setError('Choose the first day to block.')
    const next = { from: range.from, to: range.to || range.from, note: range.note }
    if (next.to < next.from) return setError('The last day cannot be before the first day.')
    if (await save([...blocked, next], 'Dates blocked.')) setRange({ from: '', to: '', note: '' })
  }

  // Clicking days in the grid fills the block form: first click = start, second = end.
  function pickDay(d) {
    if (d.past || d.status === 'booked' || d.status === 'requested') return
    setRange((r) =>
      !r.from || r.to || d.date < r.from ? { ...r, from: d.date, to: '' } : { ...r, to: d.date },
    )
  }

  const inRange = (date) => range.from && date >= range.from && date <= (range.to || range.from)
  const lead = data ? new Date(`${data.days[0].date}T00:00:00Z`).getUTCDay() : 0

  return (
    <>
      <header className="adm-page__head">
        <div>
          <h1>Calendar &amp; Availability</h1>
          <p>See bookings day by day, block dates you cannot host, and set how long guests may stay.</p>
        </div>
        {listingId && (
          <Link to={`/${scope}/pricing?listing=${listingId}`} className="adm-btn adm-btn--blue">
            Pricing for this listing
          </Link>
        )}
      </header>

      {picker}
      {error && <p className="adm-error">{error}</p>}
      {notice && <p className="adm-ok">{notice}</p>}

      {listingId && data && (
        <div className="adm-cols">
          <div className="adm-col">
            <section className="adm-card">
              <header className="adm-cal__head">
                <button type="button" className="adm-btn adm-btn--blue adm-btn--sm" onClick={() => setMonth(shiftMonth(data.month, -1))} aria-label="Previous month">
                  <ChevronLeft size={16} />
                </button>
                <h2>{monthLabel(data.month)}</h2>
                <button type="button" className="adm-btn adm-btn--blue adm-btn--sm" onClick={() => setMonth(shiftMonth(data.month, 1))} aria-label="Next month">
                  <ChevronRight size={16} />
                </button>
              </header>

              <div className="adm-cal" role="grid" aria-label={monthLabel(data.month)}>
                {WEEKDAYS.map((w) => (
                  <span key={w} className="adm-cal__dow">
                    {w}
                  </span>
                ))}
                {Array.from({ length: lead }, (_, i) => (
                  <span key={`pad-${i}`} />
                ))}
                {data.days.map((d) => (
                  <button
                    key={d.date}
                    type="button"
                    className={`adm-cal__day is-${d.status} ${d.past ? 'is-past' : ''} ${d.date === data.today ? 'is-today' : ''} ${inRange(d.date) ? 'is-picked' : ''}`}
                    onClick={() => pickDay(d)}
                    title={d.guest ? `${d.status === 'booked' ? 'Booked' : 'Requested'} by ${d.guest}` : d.note || undefined}
                  >
                    <b>{Number(d.date.slice(8))}</b>
                    <small>
                      {d.status === 'free'
                        ? number(d.priceNPR)
                        : d.status === 'blocked'
                          ? 'Blocked'
                          : d.guest?.split(' ')[0] || 'Guest'}
                    </small>
                  </button>
                ))}
              </div>

              <ul className="adm-cal__legend">
                {LEGEND.map(([k, label]) => (
                  <li key={k}>
                    <i className={`is-${k}`} /> {label}
                  </li>
                ))}
                <li>Open days show the nightly price in NPR.</li>
              </ul>
            </section>
          </div>

          <div className="adm-col">
            <section className="adm-card">
              <h2>Block dates</h2>
              <p className="adm-muted adm-gap">
                Click a first and last day in the calendar, or type them here. Guests cannot book blocked days.
              </p>
              <form className="adm-grid" onSubmit={addBlock}>
                <label className="adm-field">
                  <span>First day</span>
                  <input type="date" min={data.today} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
                </label>
                <label className="adm-field">
                  <span>Last day</span>
                  <input type="date" min={range.from || data.today} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
                </label>
                <label className="adm-field adm-field--wide">
                  <span>Note (only you see this)</span>
                  <input value={range.note} maxLength={120} placeholder="Family visit, repairs…" onChange={(e) => setRange({ ...range, note: e.target.value })} />
                </label>
                <button type="submit" className="adm-btn adm-btn--primary" disabled={busy}>
                  Block these dates
                </button>
              </form>

              {blocked.length > 0 && (
                <ul className="adm-ranges">
                  {blocked.map((b, i) => (
                    <li key={`${b.from}-${b.to}-${i}`}>
                      <span>
                        <strong>
                          {day(b.from)}
                          {b.to !== b.from && ` → ${day(b.to)}`}
                        </strong>
                        {b.note && <small>{b.note}</small>}
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={`Unblock ${day(b.from)}`}
                        title="Unblock"
                        onClick={() => save(blocked.filter((_, j) => j !== i), 'Dates opened again.')}
                      >
                        <Trash2 size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="adm-card">
              <h2>Stay rules</h2>
              <form
                className="adm-grid adm-grid--3"
                onSubmit={(e) => {
                  e.preventDefault()
                  save(blocked, 'Stay rules saved.')
                }}
              >
                {[
                  ['minNights', 'Minimum nights'],
                  ['maxNights', 'Maximum nights'],
                  ['advanceNoticeDays', 'Notice (days)'],
                ].map(([key, label]) => (
                  <label key={key} className={`adm-field ${ruleErrors[key] ? 'has-error' : ''}`}>
                    <span>{label}</span>
                    <input
                      type="number"
                      min={key === 'advanceNoticeDays' ? 0 : 1}
                      inputMode="numeric"
                      value={rules[key]}
                      onChange={(e) => setRules({ ...rules, [key]: e.target.value })}
                    />
                    {ruleErrors[key] && <small className="adm-field__error">{ruleErrors[key]}</small>}
                  </label>
                ))}
                <p className="adm-muted adm-field--wide">
                  Notice is how many days before check-in a guest must book. 0 allows same-day requests.
                </p>
                <button type="submit" className="adm-btn adm-btn--primary" disabled={busy}>
                  Save stay rules
                </button>
              </form>
            </section>
          </div>
        </div>
      )}
    </>
  )
}
