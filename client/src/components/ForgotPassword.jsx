import { useEffect, useState } from 'react'
import { ArrowRight, KeyRound, Lock, Mail } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import PasswordInput from './PasswordInput.jsx'

const RESEND_SECONDS = 60

/**
 * Two steps: (1) ask for the account's email or Host ID and send a code,
 * (2) enter the code and a new password. Finishing logs the person in.
 */
export default function ForgotPassword({ host = false, initialIdentifier = '', onDone, onBack }) {
  const { requestReset, resetPassword } = useAuth()
  const [step, setStep] = useState('ask') // 'ask' | 'reset'
  const [identifier, setIdentifier] = useState(initialIdentifier)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [delivery, setDelivery] = useState(null)
  const [wait, setWait] = useState(0)

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  async function sendCode(e) {
    e?.preventDefault()
    const id = identifier.trim()
    if (!id) {
      setError(host ? 'Enter your Host ID or email address.' : 'Enter your email address.')
      return
    }
    setBusy(true)
    setError('')
    setInfo('')
    try {
      const data = await requestReset(id)
      setDelivery(data.delivery)
      setWait(RESEND_SECONDS)
      if (step === 'reset') setInfo('If the account exists, a new code is on its way.')
      setCode('')
      setStep('reset')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleReset(e) {
    e.preventDefault()
    if (code.length !== 6) return setError('Enter the 6-digit code from the email.')
    if (password.length < 8) return setError('Use at least 8 characters for the new password.')
    setBusy(true)
    setError('')
    setInfo('')
    try {
      onDone(await resetPassword({ identifier: identifier.trim(), code, password }))
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const submitClass = `auth__submit ${host ? 'auth__submit--host' : ''}`

  if (step === 'ask') {
    return (
      <form className="verify" onSubmit={sendCode} noValidate>
        <span className="verify__icon">
          <KeyRound size={24} />
        </span>
        <h2>Forgot your password?</h2>
        <p className="verify__lede">
          {host
            ? 'Enter your Host ID or the email on your host account. We will email you a code to set a new password.'
            : 'Enter the email on your account. We will email you a code to set a new password.'}
        </p>

        <div className="field verify__field">
          <label htmlFor="reset-id">{host ? 'Host ID or email' : 'Email address'}</label>
          <div className={`input ${error ? 'has-error' : ''}`}>
            <Mail size={17} />
            <input
              id="reset-id"
              type="text"
              inputMode={host ? 'text' : 'email'}
              autoCapitalize="none"
              autoComplete="username"
              placeholder={host ? 'NEP-HOST-8421 or you@example.com' : 'you@example.com'}
              value={identifier}
              autoFocus
              onChange={(e) => {
                setIdentifier(e.target.value)
                setError('')
              }}
            />
          </div>
        </div>

        <button type="submit" className={submitClass} disabled={busy}>
          {busy ? 'Please wait…' : 'Email me a code'}
          {!busy && <ArrowRight size={17} />}
        </button>
        <p className="auth__notice is-error" role="status">
          {error}
        </p>
        <div className="verify__foot verify__foot--center">
          <button type="button" className="field__link" onClick={onBack}>
            Back to login
          </button>
        </div>
      </form>
    )
  }

  return (
    <form className="verify" onSubmit={handleReset} noValidate>
      <span className="verify__icon">
        <KeyRound size={24} />
      </span>
      <h2>Set a new password</h2>
      <p className="verify__lede">
        If <strong>{identifier.trim()}</strong> has a Nepal Stay account, a 6-digit code{' '}
        {delivery === 'console' ? 'was created for it' : 'was sent to its email address'}. It expires
        in 10 minutes.
      </p>

      {delivery === 'console' && (
        <p className="verify__dev">
          Email sending is not set up on this server yet, so no email was sent. The code is
          printed in the server terminal.
        </p>
      )}

      <label htmlFor="reset-code" className="verify__label">
        Code from the email
      </label>
      <input
        id="reset-code"
        className="verify__code"
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
      />

      <div className="field verify__field">
        <label htmlFor="reset-password">New password</label>
        <div className="input">
          <Lock size={17} />
          <PasswordInput
            id="reset-password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setError('')
            }}
          />
        </div>
      </div>

      <button type="submit" className={submitClass} disabled={busy}>
        {busy ? 'Please wait…' : 'Save password and log in'}
        {!busy && <ArrowRight size={17} />}
      </button>
      <p className={`auth__notice ${error ? 'is-error' : ''}`} role="status">
        {error || info}
      </p>

      <div className="verify__foot">
        <button type="button" className="field__link" onClick={() => sendCode()} disabled={wait > 0 || busy}>
          {wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
        </button>
        <button type="button" className="field__link" onClick={onBack}>
          Back to login
        </button>
      </div>
    </form>
  )
}
