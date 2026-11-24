import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { api } from '../../lib/api.js'
import { ago } from '../../lib/format.js'

export default function AuditLog() {
  const [entries, setEntries] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/admin/audit')
      .then((d) => setEntries(d.entries))
      .catch((err) => setError(err.message))
  }, [])

  return (
    <>
      <header className="adm-page__head">
        <div>
          <h1>Audits &amp; 2FA</h1>
          <p>
            Every admin login and change, newest first. Admin logins always require the password
            plus an emailed code.
          </p>
        </div>
      </header>

      <section className="adm-card">
        {error && <p className="adm-error">{error}</p>}
        {!entries && !error && <p className="adm-empty">Loading…</p>}
        {entries?.length === 0 && <p className="adm-empty">No admin actions recorded yet.</p>}
        <ul className="adm-audit adm-audit--full">
          {entries?.map((a) => (
            <li key={a._id}>
              <i>
                <ShieldCheck size={14} />
              </i>
              <div>
                <p>
                  <strong>{a.actorName}</strong> {a.action}
                  {a.detail ? `: ${a.detail}` : ''}
                </p>
                <small title={new Date(a.createdAt).toLocaleString()}>{ago(a.createdAt)}</small>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
