import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api.js'
import { ago } from '../../lib/format.js'

const TABS = [
  { id: 'pending', label: 'Waiting for review' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: '', label: 'All' },
]

const ID_LABEL = { passport: 'Passport', citizenship: 'Citizenship', nid: 'NID' }

export default function KycList() {
  const [status, setStatus] = useState('pending')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api(`/admin/kyc${status ? `?status=${status}` : ''}`)
      .then((d) => {
        setData(d)
        setError('')
      })
      .catch((err) => setError(err.message))
  }, [status])

  const counts = data?.counts ?? {}
  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  return (
    <>
      <header className="adm-page__head">
        <div>
          <h1>KYC Verification</h1>
          <p>Check each host's company certificate, ID document and photo, then approve or reject.</p>
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
        {!data && !error && <p className="adm-empty">Loading…</p>}
        {data?.submissions.length === 0 && (
          <p className="adm-empty">{status === 'pending' ? 'No hosts are waiting for review.' : 'Nothing here.'}</p>
        )}

        {data?.submissions.length > 0 && (
          <div className="adm-tablewrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Host</th>
                  <th>Name on ID</th>
                  <th>Document</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.submissions.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.accountName}</strong>
                      <small>
                        {s.hostId ?? 'no Host ID'} · {s.email}
                      </small>
                    </td>
                    <td>{s.fullName}</td>
                    <td>{ID_LABEL[s.idType] ?? s.idType}</td>
                    <td>{ago(s.createdAt)}</td>
                    <td>
                      <span className={`adm-status adm-status--${s.status === 'approved' ? 'confirmed' : s.status === 'rejected' ? 'declined' : 'pending'}`}>
                        {s.status}
                      </span>
                    </td>
                    <td>
                      <Link to={`/admin/kyc/${s.id}`} className="adm-btn adm-btn--sm adm-btn--blue">
                        {s.status === 'pending' ? 'Review' : 'Open'}
                      </Link>
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
