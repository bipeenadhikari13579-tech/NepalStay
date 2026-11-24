import { useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { api } from '../../lib/api.js'

const EMPTY = {
  title: '',
  tagline: '',
  description: '',
  location: '',
  region: '',
  address: '',
  stayType: '',
  hostName: '',
  pricePerNightNPR: '',
  pricePerNightUSD: '',
  maxGuests: 2,
  bedrooms: 1,
  beds: 1,
  bathrooms: 1,
  images: '',
  amenities: '',
  houseRules: '',
  arrivalGuide: '',
  checkInTime: '',
  wifiName: '',
  wifiPassword: '',
  doorCode: '',
  directions: '',
  featured: false,
  status: 'draft',
}

const STATUS_HELP = {
  draft: 'Not visible to travelers.',
  pending: 'Waiting in the verification queue.',
  published: 'Live and bookable.',
  snoozed: 'Hidden temporarily; can be turned back on any time.',
}

const toForm = (l) => ({
  ...EMPTY,
  ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, l[k] ?? EMPTY[k]])),
  hostName: l.host?.name ?? '',
  images: (l.images ?? []).join('\n'),
  amenities: (l.amenities ?? []).join('\n'),
  houseRules: (l.houseRules ?? []).join('\n'),
  checkInTime: l.checkIn?.time ?? '',
  wifiName: l.checkIn?.wifiName ?? '',
  wifiPassword: l.checkIn?.wifiPassword ?? '',
  doorCode: l.checkIn?.doorCode ?? '',
  directions: l.checkIn?.directions ?? '',
})

const isUrl = (s) => /^https?:\/\/\S+$/i.test(s)

function Field({ label, error, hint, children, wide }) {
  return (
    <label className={`adm-field ${wide ? 'adm-field--wide' : ''} ${error ? 'has-error' : ''}`}>
      <span>{label}</span>
      {children}
      {hint && !error && <small>{hint}</small>}
      {error && <small className="adm-field__error">{error}</small>}
    </label>
  )
}

export default function ListingForm({ scope = 'admin' }) {
  const isHostDesk = scope === 'host'
  // Admins reach this page only from the Verification Queue.
  const listPath = isHostDesk ? '/host/listings' : '/admin/verification'
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const { refreshSummary } = useOutletContext()
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(!isNew)
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  // Status as last saved: decides which statuses a host may choose.
  const [savedStatus, setSavedStatus] = useState('draft')

  useEffect(() => {
    if (isNew) return
    api(`/${scope}/listings/${id}`)
      .then((d) => {
        setForm(toForm(d.listing))
        setSavedStatus(d.listing.status)
      })
      .catch((err) => setFailure(err.message))
      .finally(() => setLoading(false))
  }, [id, isNew, scope])

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((errs) => ({ ...errs, [key]: undefined }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setFailure('')
    try {
      await api(isNew ? `/${scope}/listings` : `/${scope}/listings/${id}`, {
        method: isNew ? 'POST' : 'PATCH',
        body: form,
      })
      refreshSummary()
      navigate(listPath)
    } catch (err) {
      setErrors(err.errors ?? {})
      setFailure(err.message)
      setBusy(false)
    }
  }

  if (loading) return <p className="adm-muted">Loading listing…</p>

  // A host can only snooze/unsnooze a listing that an admin has already approved.
  const liveBefore = ['published', 'snoozed'].includes(savedStatus)
  const photos = form.images.split('\n').map((s) => s.trim()).filter(isUrl)
  const input = (key, props = {}) => (
    <input value={form[key]} onChange={set(key)} aria-invalid={!!errors[key]} {...props} />
  )

  return (
    <form onSubmit={handleSubmit} noValidate>
      <header className="adm-page__head">
        <div>
          <Link to={listPath} className="adm-link adm-link--inline">
            <ArrowLeft size={14} /> {isHostDesk ? 'My listings' : 'Verification Queue'}
          </Link>
          <h1>{isNew ? 'New listing' : form.title || 'Edit listing'}</h1>
        </div>
        <button type="submit" className="adm-btn adm-btn--primary" disabled={busy}>
          {busy ? 'Saving…' : isNew ? 'Create listing' : 'Save changes'}
        </button>
      </header>

      {failure && <p className="adm-error">{failure}</p>}

      <section className="adm-card">
        <h2>Basics</h2>
        <div className="adm-grid">
          <Field label="Title" error={errors.title} wide>
            {input('title', { maxLength: 120, placeholder: 'Ghandruk Gurung Homestay' })}
          </Field>
          <Field label="Tagline" error={errors.tagline} wide>
            {input('tagline', { maxLength: 200, placeholder: 'One line that sells the stay' })}
          </Field>
          <Field label="Town or area" error={errors.location}>
            {input('location', { placeholder: 'Ghandruk' })}
          </Field>
          <Field label="Province / region" error={errors.region}>
            {input('region', { placeholder: 'Gandaki Province' })}
          </Field>
          <Field label="Address" error={errors.address}>
            {input('address')}
          </Field>
          <Field label="Stay type" error={errors.stayType}>
            {input('stayType', { placeholder: 'Homestay, Lodge, Heritage Villa…' })}
          </Field>
          {!isHostDesk && (
            <Field label="Host name" error={errors.hostName}>
              {input('hostName')}
            </Field>
          )}
          <Field label="Description" error={errors.description} wide>
            <textarea rows={5} value={form.description} onChange={set('description')} maxLength={5000} />
          </Field>
        </div>
      </section>

      <section className="adm-card">
        <h2>Price &amp; capacity</h2>
        <div className="adm-grid adm-grid--3">
          <Field label="Nightly price (NPR)" error={errors.pricePerNightNPR}>
            {input('pricePerNightNPR', { type: 'number', min: 0, inputMode: 'numeric' })}
          </Field>
          <Field label="Nightly price (USD)" error={errors.pricePerNightUSD} hint="Optional">
            {input('pricePerNightUSD', { type: 'number', min: 0, inputMode: 'numeric' })}
          </Field>
          <Field label="Max guests" error={errors.maxGuests}>
            {input('maxGuests', { type: 'number', min: 1, inputMode: 'numeric' })}
          </Field>
          <Field label="Bedrooms" error={errors.bedrooms}>
            {input('bedrooms', { type: 'number', min: 0, inputMode: 'numeric' })}
          </Field>
          <Field label="Beds" error={errors.beds}>
            {input('beds', { type: 'number', min: 0, inputMode: 'numeric' })}
          </Field>
          <Field label="Bathrooms" error={errors.bathrooms}>
            {input('bathrooms', { type: 'number', min: 0, inputMode: 'numeric' })}
          </Field>
        </div>
      </section>

      <section className="adm-card">
        <h2>Photos</h2>
        <Field
          label="Photo web addresses, one per line"
          error={errors.images}
          hint="The first photo is the cover. Uploading files from your computer is not available yet."
          wide
        >
          <textarea
            rows={4}
            value={form.images}
            onChange={set('images')}
            placeholder="https://…"
            spellCheck={false}
          />
        </Field>
        {photos.length > 0 && (
          <div className="adm-photos">
            {photos.map((src, i) => (
              <img key={`${src}-${i}`} src={src} alt={`Photo ${i + 1}`} loading="lazy" />
            ))}
          </div>
        )}
      </section>

      <section className="adm-card">
        <h2>Amenities, rules &amp; arrival</h2>
        <div className="adm-grid">
          <Field label="Amenities, one per line" error={errors.amenities}>
            <textarea rows={6} value={form.amenities} onChange={set('amenities')} placeholder="Solar hot water" />
          </Field>
          <Field label="House rules, one per line" error={errors.houseRules}>
            <textarea rows={6} value={form.houseRules} onChange={set('houseRules')} placeholder="Shoes off at the entrance" />
          </Field>
          <Field
            label="Arrival guide"
            error={errors.arrivalGuide}
            hint="How to get there, check-in time, who meets the guest."
            wide
          >
            <textarea rows={4} value={form.arrivalGuide} onChange={set('arrivalGuide')} maxLength={3000} />
          </Field>
        </div>
      </section>

      <section className="adm-card">
        <h2>Check-in details</h2>
        <p className="adm-muted adm-gap">
          Private. Guests see these only on their trip page, and only after their booking is confirmed.
        </p>
        <div className="adm-grid adm-grid--3">
          <Field label="Check-in time" error={errors.checkInTime}>
            {input('checkInTime', { placeholder: 'After 2:00 PM', maxLength: 60 })}
          </Field>
          <Field label="Wi-Fi name" error={errors.wifiName}>
            {input('wifiName', { maxLength: 80, autoComplete: 'off' })}
          </Field>
          <Field label="Wi-Fi password" error={errors.wifiPassword}>
            {input('wifiPassword', { maxLength: 80, autoComplete: 'off' })}
          </Field>
          <Field label="Door / lockbox code" error={errors.doorCode}>
            {input('doorCode', { maxLength: 80, autoComplete: 'off' })}
          </Field>
          <Field
            label="Directions to the door"
            error={errors.directions}
            hint="Landmarks, where to park, who to call on arrival."
            wide
          >
            <textarea rows={3} value={form.directions} onChange={set('directions')} maxLength={2000} />
          </Field>
        </div>
      </section>

      <section className="adm-card">
        <h2>Visibility</h2>
        <div className="adm-grid">
          <Field label="Status" error={errors.status} hint={STATUS_HELP[form.status]}>
            <select value={form.status} onChange={set('status')}>
              {(!isHostDesk || !liveBefore) && <option value="draft">Draft</option>}
              {(!isHostDesk || !liveBefore) && (
                <option value="pending">{isHostDesk ? 'Submit for review' : 'Pending review'}</option>
              )}
              {(!isHostDesk || liveBefore) && <option value="published">Published</option>}
              {(!isHostDesk || liveBefore) && <option value="snoozed">Snoozed</option>}
            </select>
          </Field>
          {!isHostDesk && (
            <label className="adm-check">
              <input type="checkbox" checked={form.featured} onChange={set('featured')} />
              <span>
                Featured
                <small>Highlight this stay on the home page.</small>
              </span>
            </label>
          )}
        </div>
      </section>
    </form>
  )
}
