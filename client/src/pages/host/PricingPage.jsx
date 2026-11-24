import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { api } from '../../lib/api.js'
import { day, npr, usd } from '../../lib/format.js'
import { plural } from '../../lib/trips.js'
import { useListingPicker } from './ListingPicker.jsx'

const EMPTY = {
  pricePerNightNPR: '',
  pricePerNightUSD: '',
  weekendNPR: '',
  weeklyDiscountPct: '',
  monthlyDiscountPct: '',
  earlyBirdPct: '',
  earlyBirdDays: '',
}

const show = (n) => (n ? String(n) : '')

function Field({ label, hint, error, children, wide }) {
  return (
    <label className={`adm-field ${wide ? 'adm-field--wide' : ''} ${error ? 'has-error' : ''}`}>
      <span>{label}</span>
      {children}
      {hint && !error && <small>{hint}</small>}
      {error && <small className="adm-field__error">{error}</small>}
    </label>
  )
}

export default function PricingPage({ scope = 'host' }) {
  const { listingId, picker } = useListingPicker(scope)
  const [form, setForm] = useState(EMPTY)
  const [custom, setCustom] = useState([])
  const [special, setSpecial] = useState({ from: '', to: '', priceNPR: '', label: '' })
  const [loaded, setLoaded] = useState(false)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [today, setToday] = useState('')
  const [dates, setDates] = useState({ checkIn: '', checkOut: '' })
  const [preview, setPreview] = useState(null)

  const load = useCallback(() => {
    if (!listingId) return
    setLoaded(false)
    api(`/${scope}/listings/${listingId}/calendar`)
      .then((d) => {
        const p = d.pricing ?? {}
        setForm({
          pricePerNightNPR: show(d.listing.pricePerNightNPR),
          pricePerNightUSD: show(d.listing.pricePerNightUSD),
          weekendNPR: show(p.weekendNPR),
          weeklyDiscountPct: show(p.weeklyDiscountPct),
          monthlyDiscountPct: show(p.monthlyDiscountPct),
          earlyBirdPct: show(p.earlyBirdPct),
          earlyBirdDays: show(p.earlyBirdDays),
        })
        setCustom(p.custom ?? [])
        setToday(d.today)
        setLoaded(true)
        setError('')
      })
      .catch((err) => setError(err.message))
  }, [scope, listingId])
  useEffect(load, [load])

  useEffect(() => {
    setNotice('')
    setErrors({})
    setPreview(null)
    setDates({ checkIn: '', checkOut: '' })
  }, [listingId])

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setErrors((errs) => ({ ...errs, [key]: undefined }))
  }

  async function save(nextCustom = custom, okMessage = 'Pricing saved.') {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const d = await api(`/${scope}/listings/${listingId}/pricing`, {
        method: 'PATCH',
        body: { ...form, custom: nextCustom },
      })
      setCustom(d.pricing.custom ?? [])
      setNotice(okMessage)
      setErrors({})
      if (dates.checkIn && dates.checkOut) runPreview(dates)
      return true
    } catch (err) {
      setErrors(err.errors ?? {})
      setError(err.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function addSpecial(e) {
    e.preventDefault()
    if (!special.from || !special.priceNPR) return setError('Choose the first day and a nightly price for the special price.')
    const next = { ...special, to: special.to || special.from }
    if (next.to < next.from) return setError('The last day cannot be before the first day.')
    if (await save([...custom, next], 'Special price added.')) setSpecial({ from: '', to: '', priceNPR: '', label: '' })
  }

  function runPreview(d) {
    if (!d.checkIn || !d.checkOut || d.checkOut <= d.checkIn) return setPreview(null)
    api(`/${scope}/listings/${listingId}/quote?checkIn=${d.checkIn}&checkOut=${d.checkOut}`)
      .then(setPreview)
      .catch((err) => setPreview({ error: err.message }))
  }

  function setDate(key, value) {
    const next = { ...dates, [key]: value }
    setDates(next)
    runPreview(next)
  }

  const num = (key, props = {}) => (
    <input type="number" min={0} inputMode="numeric" value={form[key]} onChange={set(key)} {...props} />
  )

  return (
    <>
      <header className="adm-page__head">
        <div>
          <h1>Pricing &amp; Discounts</h1>
          <p>Set the nightly rate, weekend and special-date prices, and discounts for longer or earlier bookings.</p>
        </div>
        {listingId && (
          <Link to={`/${scope}/calendar?listing=${listingId}`} className="adm-btn adm-btn--blue">
            Calendar for this listing
          </Link>
        )}
      </header>

      {picker}
      {error && <p className="adm-error">{error}</p>}
      {notice && <p className="adm-ok">{notice}</p>}

      {listingId && loaded && (
        <div className="adm-cols">
          <div className="adm-col">
            <form
              className="adm-card"
              onSubmit={(e) => {
                e.preventDefault()
                save()
              }}
              noValidate
            >
              <h2>Nightly rates</h2>
              <div className="adm-grid adm-grid--3">
                <Field label="Base price (NPR)" error={errors.pricePerNightNPR}>
                  {num('pricePerNightNPR', { min: 1 })}
                </Field>
                <Field label="Base price (USD)" error={errors.pricePerNightUSD} hint="Optional. Sets the NPR to USD rate.">
                  {num('pricePerNightUSD')}
                </Field>
                <Field label="Weekend price (NPR)" error={errors.weekendNPR} hint="Friday and Saturday nights. Empty = same as base.">
                  {num('weekendNPR')}
                </Field>
              </div>

              <h2 className="adm-h2gap">Discounts</h2>
              <div className="adm-grid adm-grid--3">
                <Field label="Weekly discount (%)" error={errors.weeklyDiscountPct} hint="Stays of 7 nights or more.">
                  {num('weeklyDiscountPct', { max: 90 })}
                </Field>
                <Field label="Monthly discount (%)" error={errors.monthlyDiscountPct} hint="Stays of 28 nights or more.">
                  {num('monthlyDiscountPct', { max: 90 })}
                </Field>
                <span />
                <Field label="Early-bird discount (%)" error={errors.earlyBirdPct}>
                  {num('earlyBirdPct', { max: 90 })}
                </Field>
                <Field label="Booked at least (days ahead)" error={errors.earlyBirdDays} hint="For example 60.">
                  {num('earlyBirdDays', { max: 365 })}
                </Field>
              </div>
              <p className="adm-muted adm-note">
                A guest gets only one discount per stay: the largest one they qualify for.
              </p>
              <button type="submit" className="adm-btn adm-btn--primary" disabled={busy}>
                {busy ? 'Saving…' : 'Save pricing'}
              </button>
            </form>

            <section className="adm-card">
              <h2>Special date prices</h2>
              <p className="adm-muted adm-gap">
                A different nightly price for festivals, holidays or peak season. It replaces the base and weekend price on those days.
              </p>
              <form className="adm-grid" onSubmit={addSpecial}>
                <label className="adm-field">
                  <span>First day</span>
                  <input type="date" value={special.from} onChange={(e) => setSpecial({ ...special, from: e.target.value })} />
                </label>
                <label className="adm-field">
                  <span>Last day</span>
                  <input type="date" min={special.from} value={special.to} onChange={(e) => setSpecial({ ...special, to: e.target.value })} />
                </label>
                <label className="adm-field">
                  <span>Nightly price (NPR)</span>
                  <input type="number" min={1} inputMode="numeric" value={special.priceNPR} onChange={(e) => setSpecial({ ...special, priceNPR: e.target.value })} />
                </label>
                <label className="adm-field">
                  <span>Label</span>
                  <input value={special.label} maxLength={60} placeholder="Dashain, Tihar, peak season…" onChange={(e) => setSpecial({ ...special, label: e.target.value })} />
                </label>
                <button type="submit" className="adm-btn adm-btn--primary" disabled={busy}>
                  Add special price
                </button>
              </form>

              {custom.length > 0 && (
                <ul className="adm-ranges">
                  {custom.map((c, i) => (
                    <li key={`${c.from}-${c.to}-${i}`}>
                      <span>
                        <strong>
                          {day(c.from)}
                          {c.to !== c.from && ` → ${day(c.to)}`} · {npr(c.priceNPR)}
                        </strong>
                        {c.label && <small>{c.label}</small>}
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={`Remove special price from ${day(c.from)}`}
                        title="Remove"
                        onClick={() => save(custom.filter((_, j) => j !== i), 'Special price removed.')}
                      >
                        <Trash2 size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="adm-col">
            <section className="adm-card">
              <h2>Try some dates</h2>
              <p className="adm-muted adm-gap">See what a guest would pay with the saved settings.</p>
              <div className="adm-grid">
                <label className="adm-field">
                  <span>Check-in</span>
                  <input type="date" min={today} value={dates.checkIn} onChange={(e) => setDate('checkIn', e.target.value)} />
                </label>
                <label className="adm-field">
                  <span>Check-out</span>
                  <input type="date" min={dates.checkIn || today} value={dates.checkOut} onChange={(e) => setDate('checkOut', e.target.value)} />
                </label>
              </div>

              {preview?.error && <p className="adm-error adm-quote">{preview.error}</p>}
              {preview?.quote && (
                <div className="adm-quote">
                  <ul>
                    {preview.quote.nightly.map((n) => (
                      <li key={n.date}>
                        <span>
                          {day(n.date)}
                          {n.label && <small> · {n.label}</small>}
                        </span>
                        <b>{npr(n.priceNPR)}</b>
                      </li>
                    ))}
                  </ul>
                  <dl>
                    <dt>{plural(preview.quote.nights, 'night')}</dt>
                    <dd>{npr(preview.quote.subtotalNPR)}</dd>
                    {preview.quote.discountNPR > 0 && (
                      <>
                        <dt>
                          {preview.quote.discountLabel} ({preview.quote.discountPct}%)
                        </dt>
                        <dd>− {npr(preview.quote.discountNPR)}</dd>
                      </>
                    )}
                    <dt>
                      <strong>Guest pays</strong>
                    </dt>
                    <dd>
                      <strong>{npr(preview.quote.totalNPR)}</strong> <small>≈ {usd(preview.quote.totalUSD)}</small>
                    </dd>
                  </dl>
                  {preview.problem && <p className="adm-muted">These dates cannot be booked: {preview.problem}</p>}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </>
  )
}
