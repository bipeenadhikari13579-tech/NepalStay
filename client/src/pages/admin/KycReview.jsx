import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import KycFile from '../../components/KycFile.jsx'
import { useConfirm } from '../../components/ConfirmDialog.jsx'
import { api } from '../../lib/api.js'
import { day } from '../../lib/format.js'

const FILES = [
  ['companyCert', 'Certificate of Company Registration'],
  ['idFront', 'ID document (front)'],
  ['idBack', 'ID document (back)'],
  ['selfie', 'Photo holding the ID'],
]

const CHECKS = [
  'The name on the ID matches the full name entered.',
  'The date of birth on the ID matches, and the host is 18 or older.',
  'The ID number matches and the document is not expired.',
  'The face in the photo matches the photo on the ID, and the ID is held in both hands.',
  'The company certificate is readable and in the host’s name or business.',
]

function ageFrom(dob) {
  const [y, m, d] = dob.split('-').map(Number)
  const now = new Date()
  let age = now.getFullYear() - y
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1
  return age
}

export default function KycReview() {
  const { id } = useParams()
  const { refreshSummary } = useOutletContext()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState('')
  const [busy, setBusy] = useState(false)
  const [ask, confirmDialog] = useConfirm()

  const load = useCallback(() => {
    api(`/admin/kyc/${id}`)
      .then((d) => {
        setData(d)
        setError('')
      })
      .catch((err) => setError(err.message))
  }, [id])
  useEffect(load, [load])

  async function decide(decision) {
    if (decision === 'reject' && note.trim().length < 5) {
      setNoteError('Write a reason the host will see, for example "Photo of the ID is blurry".')
      return
    }
    const sure = await ask(
      decision === 'approve'
        ? `Approve ${data.submission.fullName}? Their Host ID will show the Verified tag.`
        : `Reject ${data.submission.fullName}'s documents? They will see your reason and can send them again.`,
      { confirmLabel: decision === 'approve' ? 'Yes, approve' : 'Yes, reject', danger: decision === 'reject' },
    )
    if (!sure) return
    setBusy(true)
    setError('')
    try {
      await api(`/admin/kyc/${id}`, { method: 'PATCH', body: { decision, note } })
      load()
      refreshSummary()
    } catch (err) {
      setError(err.message)
      if (err.errors?.note) setNoteError(err.errors.note)
    } finally {
      setBusy(false)
    }
  }

  const back = (
    <Link to="/admin/kyc" className="adm-link adm-link--inline">
      <ArrowLeft size={14} /> All KYC submissions
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
  if (!data) return <p className="adm-muted">Loading…</p>

  const { submission: s, account, previousSubmissions, idTypes } = data
  const src = (f) => f?.file && `/api/admin/kyc/${id}/files/${f.file}`
  const pending = s.status === 'pending'

  return (
    <>
      {confirmDialog}
      <header className="adm-page__head">
        <div>
          {back}
          <h1>{s.fullName}</h1>
          <p>
            <span className={`adm-status adm-status--${s.status === 'approved' ? 'confirmed' : s.status === 'rejected' ? 'declined' : 'pending'}`}>
              {s.status}
            </span>{' '}
            · Submitted {day(s.createdAt.slice(0, 10))}
            {previousSubmissions > 0 && ` · ${previousSubmissions} earlier submission${previousSubmissions === 1 ? '' : 's'}`}
          </p>
        </div>
      </header>

      {error && <p className="adm-error">{error}</p>}

      <section className="adm-card">
        <h2>Documents</h2>
        <p className="adm-muted adm-gap">Click a document to open it full size.</p>
        <div className="kyc-files kyc-files--big">
          {FILES.map(([name, label]) => (
            <KycFile key={name} label={label} file={s.files?.[name]} src={src(s.files?.[name])} />
          ))}
        </div>
      </section>

      <div className="adm-cols">
        <div className="adm-col">
          <section className="adm-card">
            <h2>Details entered by the host</h2>
            <dl className="adm-dl">
              <dt>Full name</dt>
              <dd>{s.fullName}</dd>
              <dt>Date of birth</dt>
              <dd>
                {day(s.dob)} <small>(age {ageFrom(s.dob)})</small>
              </dd>
              <dt>ID document</dt>
              <dd>{idTypes[s.idType] ?? s.idType}</dd>
              <dt>ID number</dt>
              <dd className="mono">{s.idNumber}</dd>
              <dt>Account</dt>
              <dd>
                {account?.name ?? '(deleted account)'}
                {account && (
                  <small>
                    {account.hostId} · {account.email} · joined {day(String(account.joined).slice(0, 10))}
                  </small>
                )}
              </dd>
            </dl>
          </section>
        </div>

        <div className="adm-col">
          <section className="adm-card">
            <h2>{pending ? 'Decision' : 'Decision made'}</h2>
            {pending ? (
              <>
                <ul className="kyc-checks">
                  {CHECKS.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                <label className={`adm-field ${noteError ? 'has-error' : ''}`}>
                  <span>Note to the host</span>
                  <textarea
                    rows={3}
                    maxLength={500}
                    value={note}
                    placeholder="Required when rejecting: what the host needs to fix."
                    onChange={(e) => {
                      setNote(e.target.value)
                      setNoteError('')
                    }}
                  />
                  {noteError && <small className="adm-field__error">{noteError}</small>}
                </label>
                <div className="adm-rows__actions kyc-actions">
                  <button type="button" className="adm-btn adm-btn--primary" disabled={busy} onClick={() => decide('approve')}>
                    Approve and verify
                  </button>
                  <button type="button" className="adm-btn adm-btn--blue" disabled={busy} onClick={() => decide('reject')}>
                    Reject
                  </button>
                </div>
              </>
            ) : (
              <dl className="adm-dl">
                <dt>Result</dt>
                <dd>{s.status === 'approved' ? 'Approved: the host is verified' : 'Rejected'}</dd>
                <dt>By</dt>
                <dd>
                  {s.reviewedBy ?? '—'} <small>{s.reviewedAt && day(s.reviewedAt.slice(0, 10))}</small>
                </dd>
                <dt>Note</dt>
                <dd className="adm-dl__note">{s.reviewNote || 'None'}</dd>
              </dl>
            )}
          </section>
        </div>
      </div>
    </>
  )
}
