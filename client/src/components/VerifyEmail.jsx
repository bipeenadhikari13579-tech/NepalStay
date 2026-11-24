import { useEffect, useState } from 'react'
import { ArrowRight, MailCheck, ShieldCheck } from 'lucide-react'

const RESEND_SECONDS = 60

/**
 * Code-entry step. Used after sign-up (verify the new email) and after an
 * admin's password step (second factor sent to the fixed admin address).
 *
 * verify(code) and resend() are async; resend may return { delivery }.
 */
export default function VerifyEmail({ admin = false, email, delivery, verify, resend, onVerified, onBack }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [wait, setWait] = useState(RESEND_SECONDS)
  const [via, setVia] = useState(delivery)

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  async function handleSubmit(e) {
    e.preventDefault()
    if (code.length !== 6) {
      setError('Enter the 6-digit code from the email.')
      return
    }
    setBusy(true)
    setError('')
    setInfo('')
    try {
      onVerified(await verify(code))
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  async function handleResend() {
    setError('')
    setInfo('')
    try {
      const data = await resend()
      if (data?.delivery) setVia(data.delivery)
      setCode('')
      setWait(RESEND_SECONDS)
      setInfo('A new code is on its way.')
    } catch (err) {
      if (err.data?.wait) setWait(err.data.wait)
      setError(err.message)
    }
  }

  const Icon = admin ? ShieldCheck : MailCheck
  const sent = via === 'console' ? 'A 6-digit code was created for ' : 'We sent a 6-digit code to '

  return (
    <form className="verify" onSubmit={handleSubmit} noValidate>
      <span className="verify__icon">
        <Icon size={24} />
      </span>
      <h2>{admin ? 'Admin verification' : 'Check your email'}</h2>
      <p className="verify__lede">
        {sent}
        <strong>{email}</strong>.{' '}
        {admin
          ? 'Enter it below to finish logging in. It expires in 10 minutes.'
          : 'Enter it below to finish creating your account. It expires in 10 minutes.'}
      </p>

      {via === 'console' && (
        <p className="verify__dev">
          Email sending is not set up on this server yet, so no email was sent. The code is
          printed in the server terminal.
        </p>
      )}

      <label htmlFor="code" className="verify__label">
        Verification code
      </label>
      <input
        id="code"
        className={`verify__code ${error ? 'has-error' : ''}`}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="••••••"
        value={code}
        autoFocus
        onChange={(e) => {
          setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
          setError('')
        }}
        aria-invalid={!!error}
      />

      <button type="submit" className="auth__submit" disabled={busy}>
        {busy ? 'Please wait…' : admin ? 'Verify and log in' : 'Verify email'}
        {!busy && <ArrowRight size={17} />}
      </button>

      <p className={`auth__notice ${error ? 'is-error' : ''}`} role="status">
        {error || info}
      </p>

      <div className="verify__foot">
        <button type="button" className="field__link" onClick={handleResend} disabled={wait > 0}>
          {wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
        </button>
        <button type="button" className="field__link" onClick={onBack}>
          {admin ? 'Back to login' : 'Use a different email'}
        </button>
      </div>
    </form>
  )
}
