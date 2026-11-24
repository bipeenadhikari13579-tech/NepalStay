import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { BadgeCheck, Camera, CircleAlert, Clock, FileText, ShieldCheck, Upload, X } from 'lucide-react'
import KycFile from '../../components/KycFile.jsx'
import { api } from '../../lib/api.js'
import { MAX_UPLOAD_BYTES, shrinkImage } from '../../lib/shrinkImage.js'
import { day } from '../../lib/format.js'

const MAX_BYTES = 5 * 1024 * 1024
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const DOC_TYPES = [...PHOTO_TYPES, 'application/pdf']

const FILES = [
  {
    name: 'companyCert',
    label: 'Certificate of Company Registration',
    hint: 'A clear photo or PDF scan of the full certificate.',
    types: DOC_TYPES,
    required: true,
  },
  {
    name: 'idFront',
    label: 'ID document (front)',
    hint: 'The page or side with your photo, name and number.',
    types: DOC_TYPES,
    required: true,
  },
  {
    name: 'idBack',
    label: 'ID document (back)',
    hint: 'Needed for citizenship and NID cards. Not needed for a passport.',
    types: DOC_TYPES,
    required: false,
  },
  {
    name: 'selfie',
    label: 'Photo of you holding your ID',
    hint: 'Hold the ID document with both hands in front of you. Your face and the document must both be clearly visible.',
    types: PHOTO_TYPES,
    required: true,
    camera: true,
  },
]

const EMPTY = { fullName: '', dob: '', idType: '', idNumber: '' }

// The latest date of birth allowed: 18 years ago today.
const adultCutoff = () => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 18)
  return d.toISOString().slice(0, 10)
}

function FilePick({ spec, value, error, onChange }) {
  const pick = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!spec.types.includes(file.type))
      return onChange(null, spec.types.includes('application/pdf') ? 'Choose a JPG, PNG, WebP photo or a PDF.' : 'Choose a JPG, PNG or WebP photo.')
    if (file.size > MAX_BYTES) return onChange(null, 'This file is larger than 5 MB.')
    onChange({ file, url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null })
  }

  return (
    <div className={`kyc-pick ${error ? 'has-error' : ''}`}>
      <div className="kyc-pick__head">
        <strong>
          {spec.label}
          {!spec.required && <small> (optional)</small>}
        </strong>
        <small>{spec.hint}</small>
      </div>

      {value ? (
        <div className="kyc-pick__chosen">
          {value.url ? <img src={value.url} alt="" /> : <FileText size={28} />}
          <span>{value.file.name}</span>
          <button type="button" onClick={() => onChange(null)} aria-label={`Remove ${spec.label}`} title="Remove">
            <X size={16} />
          </button>
        </div>
      ) : (
        <label className="kyc-pick__drop">
          {spec.camera ? <Camera size={20} /> : <Upload size={20} />}
          <span>{spec.camera ? 'Take or choose a photo' : 'Choose a file'}</span>
          <input
            type="file"
            accept={spec.types.join(',')}
            capture={spec.camera ? 'user' : undefined}
            onChange={pick}
            hidden
          />
        </label>
      )}
      {error && <small className="adm-field__error">{error}</small>}
    </div>
  )
}

export default function KycPage() {
  const { refreshSummary } = useOutletContext()
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [form, setForm] = useState(EMPTY)
  const [files, setFiles] = useState({})
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api('/host/kyc')
      .then((d) => {
        setData(d)
        // A rejected host starts from what they sent last time (the files must be added again).
        if (d.status === 'rejected' && d.submission) {
          const { fullName, dob, idType, idNumber } = d.submission
          setForm({ fullName, dob, idType, idNumber })
        }
      })
      .catch((err) => setLoadError(err.message))
  }, [])
  useEffect(load, [load])

  // Free photo previews when they are replaced or the page closes.
  useEffect(
    () => () => Object.values(files).forEach((f) => f?.url && URL.revokeObjectURL(f.url)),
    [files],
  )

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setErrors((errs) => ({ ...errs, [key]: undefined }))
  }

  async function submit(e) {
    e.preventDefault()
    const next = {}
    if (form.fullName.trim().length < 3) next.fullName = 'Enter your full legal name.'
    if (!form.dob) next.dob = 'Enter your date of birth.'
    else if (form.dob > adultCutoff()) next.dob = 'You must be at least 18 years old to host.'
    if (!form.idType) next.idType = 'Choose the type of ID document.'
    if (form.idNumber.trim().length < 3) next.idNumber = 'Enter the number shown on your ID document.'
    for (const spec of FILES) if (spec.required && !files[spec.name]) next[spec.name] = `Add your ${spec.label.toLowerCase()}.`
    setErrors(next)
    if (Object.keys(next).length) return setFailure('Please fix the highlighted fields.')

    setBusy(true)
    setFailure('')
    try {
      const body = new FormData()
      for (const [k, v] of Object.entries(form)) body.append(k, v.trim())
      let total = 0
      for (const [k, v] of Object.entries(files)) {
        if (!v) continue
        const file = await shrinkImage(v.file)
        total += file.size
        body.append(k, file)
      }
      if (total > MAX_UPLOAD_BYTES)
        throw new Error('Your files are too large together (the limit is 4 MB in total). Use smaller photos or a smaller PDF.')

      await api('/host/kyc', { method: 'POST', body })
      setFiles({})
      load()
      refreshSummary()
      window.scrollTo(0, 0)
    } catch (err) {
      setErrors(err.errors ?? {})
      setFailure(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (loadError) return <p className="adm-error">{loadError}</p>
  if (!data) return <p className="adm-muted">Loading…</p>

  const { status, submission: s, idTypes } = data
  const fileSrc = (f) => f?.file && `/api/host/kyc/files/${f.file}`

  const header = (
    <header className="adm-page__head">
      <div>
        <h1>KYC Verification</h1>
        <p>
          Verify your identity and business once. Nepal Stay checks your documents, and your Host ID then
          carries a Verified tag that travelers can see.
        </p>
      </div>
    </header>
  )

  if (status === 'approved' || status === 'pending') {
    const approved = status === 'approved'
    return (
      <>
        {header}
        <section className={`adm-card kyc-state ${approved ? 'is-ok' : 'is-wait'}`}>
          <span className="kyc-state__icon">{approved ? <BadgeCheck size={28} /> : <Clock size={28} />}</span>
          <div>
            <h2>{approved ? 'You are a verified host' : 'Your documents are being reviewed'}</h2>
            <p>
              {approved
                ? `Verified on ${day(s?.reviewedAt?.slice?.(0, 10))}. Your Host ID now shows the Verified tag.`
                : `Submitted on ${day(s?.createdAt?.slice?.(0, 10))}. Nepal Stay will check them and update this page. You cannot change them while they are being reviewed.`}
            </p>
          </div>
        </section>
        {s && (
          <section className="adm-card">
            <h2>What you sent</h2>
            <dl className="adm-dl adm-gap2">
              <dt>Full name</dt>
              <dd>{s.fullName}</dd>
              <dt>Date of birth</dt>
              <dd>{day(s.dob)}</dd>
              <dt>ID document</dt>
              <dd>
                {idTypes[s.idType]} · {s.idNumber}
              </dd>
            </dl>
            <div className="kyc-files">
              {FILES.map((f) => (
                <KycFile key={f.name} label={f.label} file={s.files?.[f.name]} src={fileSrc(s.files?.[f.name])} />
              ))}
            </div>
          </section>
        )}
      </>
    )
  }

  return (
    <>
      {header}

      {status === 'rejected' && (
        <section className="adm-card kyc-state is-bad">
          <span className="kyc-state__icon">
            <CircleAlert size={28} />
          </span>
          <div>
            <h2>Your last submission was not approved</h2>
            <p>
              <b>Reason:</b> {s?.reviewNote || 'No reason given.'}
            </p>
            <p>Fix the problem and send your documents again. Your details are filled in below; add the files again.</p>
          </div>
        </section>
      )}

      <form className="adm-card" onSubmit={submit} noValidate>
        <h2>Your details</h2>
        <p className="adm-muted adm-gap">Exactly as they appear on your ID document.</p>
        <div className="adm-grid">
          <label className={`adm-field adm-field--wide ${errors.fullName ? 'has-error' : ''}`}>
            <span>Full legal name</span>
            <input value={form.fullName} onChange={set('fullName')} maxLength={100} autoComplete="name" />
            {errors.fullName && <small className="adm-field__error">{errors.fullName}</small>}
          </label>
          <label className={`adm-field ${errors.dob ? 'has-error' : ''}`}>
            <span>Date of birth</span>
            <input type="date" value={form.dob} max={adultCutoff()} onChange={set('dob')} autoComplete="bday" />
            {errors.dob && <small className="adm-field__error">{errors.dob}</small>}
          </label>
          <label className={`adm-field ${errors.idType ? 'has-error' : ''}`}>
            <span>ID document type</span>
            <select value={form.idType} onChange={set('idType')}>
              <option value="">Choose…</option>
              {Object.entries(idTypes).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            {errors.idType && <small className="adm-field__error">{errors.idType}</small>}
          </label>
          <label className={`adm-field adm-field--wide ${errors.idNumber ? 'has-error' : ''}`}>
            <span>ID document number</span>
            <input value={form.idNumber} onChange={set('idNumber')} maxLength={40} autoComplete="off" />
            {errors.idNumber && <small className="adm-field__error">{errors.idNumber}</small>}
          </label>
        </div>

        <h2 className="adm-h2gap">Documents</h2>
        <div className="kyc-picks">
          {FILES.map((spec) => (
            <FilePick
              key={spec.name}
              spec={spec}
              value={files[spec.name]}
              error={errors[spec.name]}
              onChange={(value, error) => {
                setFiles((f) => ({ ...f, [spec.name]: value }))
                setErrors((errs) => ({ ...errs, [spec.name]: error }))
              }}
            />
          ))}
        </div>

        <p className="adm-muted adm-note">
          <ShieldCheck size={15} /> Only you and Nepal Stay admins can see these documents. Each file can be up to
          5 MB.
        </p>
        {failure && <p className="adm-error">{failure}</p>}
        <button type="submit" className="adm-btn adm-btn--primary" disabled={busy}>
          {busy ? 'Uploading…' : 'Submit for verification'}
        </button>
      </form>
    </>
  )
}
