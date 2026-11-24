import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Compass,
  Home,
  IdCard,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
  Store,
  User,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import VerifyEmail from '../components/VerifyEmail.jsx'
import ForgotPassword from '../components/ForgotPassword.jsx'
import PasswordInput from '../components/PasswordInput.jsx'
import { api } from '../lib/api.js'
import { loadGoogle } from '../lib/google.js'
import { deskLabel, homeFor } from '../lib/roles.js'
import './auth.css'

const ROLES = [
  {
    id: 'traveler',
    name: 'Traveler',
    title: 'Traveler / User',
    icon: Compass,
    desc: 'Book restored Newari homestays, Sherpa lodges, and join authentic tea & trek workshops.',
    foot: 'Guest privileges',
    footIcon: ArrowRight,
  },
  {
    id: 'host',
    name: 'Host',
    title: 'Host',
    icon: Store,
    desc: 'Manage heritage courtyards, valley suites, calendars, and receive 100% direct payouts.',
    foot: 'Host management',
    footIcon: ArrowRight,
  },
  {
    id: 'admin',
    name: 'Admin',
    title: 'System Admin',
    icon: ShieldCheck,
    desc: 'Security portal for village audits, guide verification, and community impact governance.',
    foot: '2FA Protected',
    footIcon: Lock,
  },
]

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const HOST_ID_RE = /^NEP-HOST-\d{4,6}$/i
const USERNAME_RE = /^[a-z0-9._-]{3,30}$/i

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

export default function AuthPage() {
  const { user, loading, login, signup, logout, verifyEmail, resendCode, adminVerify, googleLogin } =
    useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const [roleId, setRoleId] = useState('traveler')
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ name: '', identifier: '', password: '' })
  const [errors, setErrors] = useState({})
  const [notice, setNotice] = useState('')
  // Set while waiting for an emailed code: { kind: 'signup' | 'admin', email, delivery, ... }
  const [pending, setPending] = useState(null)
  // True while the forgot-password steps are shown instead of the login form.
  const [forgot, setForgot] = useState(false)

  const role = ROLES.find((r) => r.id === roleId)
  const isAdmin = roleId === 'admin'
  const isSignup = mode === 'signup'
  const isHost = roleId === 'host'
  // The host log-in form has its own wording and styling ("Host Desk").
  const hostLogin = isHost && !isSignup

  function pickRole(id) {
    setRoleId(id)
    setNotice('')
    setFailure('')
    setErrors({})
    // Admin accounts are issued, never self-registered.
    if (id === 'admin') setMode('login')
  }

  function pickMode(next) {
    setMode(next)
    setErrors({})
    setNotice('')
    setFailure('')
  }

  function update(field) {
    return (e) => {
      setForm((f) => ({ ...f, [field]: e.target.value }))
      setErrors((errs) => ({ ...errs, [field]: undefined }))
      setNotice('')
      setFailure('')
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const next = {}
    const id = form.identifier.trim()
    if (isSignup && !form.name.trim()) next.name = 'Enter your full name.'
    if (isAdmin) {
      if (!USERNAME_RE.test(id)) next.identifier = 'Enter your admin username.'
    } else if (isSignup) {
      if (!EMAIL_RE.test(id)) next.identifier = 'Enter a valid email address (name@example.com).'
    } else if (hostLogin) {
      // Hosts log in with their Host ID or email.
      if (!HOST_ID_RE.test(id) && !EMAIL_RE.test(id))
        next.identifier = id ? 'Use your Host ID (NEP-HOST-1234) or email.' : 'Enter your Host ID or email.'
    } else if (!EMAIL_RE.test(id))
      next.identifier = id ? 'Enter a valid email address (name@example.com).' : 'Enter your email address.'
    if (!form.password) next.password = 'Enter your password.'
    else if (isSignup && form.password.length < 8)
      next.password = 'Use at least 8 characters.'
    setErrors(next)
    if (Object.keys(next).length) return

    setBusy(true)
    setFailure('')
    setNotice('')
    try {
      const fields = { identifier: id, password: form.password, role: roleId }
      if (isSignup) {
        const data = await signup({ ...fields, name: form.name.trim() })
        setPending({ kind: 'signup', email: data.email, delivery: data.delivery })
        return
      }
      const data = await login(fields)
      if (data.code === 'ADMIN_CODE_REQUIRED') {
        setPending({ kind: 'admin', email: data.sentTo, delivery: data.delivery, fields })
        return
      }
      navigate(homeFor(data.user), { replace: true })
    } catch (err) {
      if (err.code === 'EMAIL_NOT_VERIFIED') {
        setPending({ kind: 'signup', email: err.data.email, delivery: err.data.delivery })
        return
      }
      if (err.errors) setErrors(err.errors)
      setFailure(err.message)
    } finally {
      setBusy(false)
    }
  }

  // Google sign-in: the client id comes from the server, and Google's script is loaded
  // up front so the popup can open directly from the button click.
  const [googleClientId, setGoogleClientId] = useState(null)
  const googleClient = useRef(null)
  const roleRef = useRef(roleId)
  roleRef.current = roleId

  useEffect(() => {
    api('/auth/config')
      .then((cfg) => setGoogleClientId(cfg.googleClientId))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!googleClientId) return
    let cancelled = false
    loadGoogle()
      .then((google) => {
        if (cancelled) return
        googleClient.current = google.accounts.oauth2.initTokenClient({
          client_id: googleClientId,
          scope: 'openid email profile',
          callback: async (response) => {
            if (!response.access_token) {
              setBusy(false)
              setFailure('Google sign-in did not complete. Please try again.')
              return
            }
            try {
              const signedIn = await googleLogin(response.access_token, roleRef.current)
              navigate(homeFor(signedIn), { replace: true })
            } catch (err) {
              setFailure(err.message)
            } finally {
              setBusy(false)
            }
          },
          // Fires when the popup is closed or blocked.
          error_callback: (err) => {
            setBusy(false)
            if (err?.type === 'popup_failed_to_open')
              setFailure('Your browser blocked the Google window. Allow pop-ups for this site and try again.')
          },
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [googleClientId, googleLogin, navigate])

  function googleSignIn() {
    setFailure('')
    setNotice('')
    if (!googleClientId) {
      setNotice('Google sign-in is not set up on this server yet. Use email for now.')
      return
    }
    if (!googleClient.current) {
      setFailure('Could not load Google sign-in. Check your internet connection and try again.')
      return
    }
    setBusy(true)
    googleClient.current.requestAccessToken()
  }

  return (
    <div className="auth">
      <div className="auth__card">
        <header className="auth__bar">
          <Link to="/" className="auth__back">
            <ArrowLeft size={15} /> Back
          </Link>
        </header>

        <div className="auth__body">
          <div className="auth__intro">
            <span className="auth__mark">
              <Home size={22} />
            </span>
            <h1>Welcome to Nepal Stay</h1>
          </div>

          {loading ? null : user ? (
            <div className="auth__form signed">
              <span className="signed__avatar">{user.name.trim().charAt(0).toUpperCase()}</span>
              <h2>You are logged in</h2>
              <p>
                Signed in as <strong>{user.name}</strong> ({user.role}).
              </p>
              <Link to={homeFor(user)} className="auth__submit">
                {user.role === 'traveler' ? 'Explore stays' : `Open the ${deskLabel(user)}`}{' '}
                <ArrowRight size={17} />
              </Link>
              <button type="button" className="signed__switch" onClick={logout}>
                Log out and use a different account
              </button>
            </div>
          ) : forgot ? (
            <div className="auth__form">
              <ForgotPassword
                host={isHost}
                initialIdentifier={form.identifier.trim()}
                onDone={(signedIn) => navigate(homeFor(signedIn), { replace: true })}
                onBack={() => setForgot(false)}
              />
            </div>
          ) : pending ? (
            <div className="auth__form">
              <VerifyEmail
                key={pending.kind + pending.email}
                admin={pending.kind === 'admin'}
                email={pending.email}
                delivery={pending.delivery}
                verify={(code) =>
                  pending.kind === 'admin'
                    ? adminVerify(pending.fields.identifier, code)
                    : verifyEmail(pending.email, code)
                }
                // For admins, "resend" repeats the password step, which issues a new code.
                resend={() =>
                  pending.kind === 'admin' ? login(pending.fields) : resendCode(pending.email)
                }
                onVerified={(signedIn) => navigate(homeFor(signedIn), { replace: true })}
                onBack={() => {
                  setPending(null)
                  setForm((f) => ({ ...f, password: '' }))
                }}
              />
            </div>
          ) : (
            <>
          <div className="auth__rolehead">
            <span id="role-label">Select account role</span>
            <span>
              Currently entering as: <strong>{isHost ? 'Homestay Host' : role.name}</strong>
            </span>
          </div>

          <div className="roles" role="radiogroup" aria-labelledby="role-label">
            {ROLES.map((r) => {
              const Icon = r.icon
              const FootIcon = r.footIcon
              const selected = r.id === roleId
              return (
                <button
                  key={r.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`role role--${r.id} ${selected ? 'is-selected' : ''}`}
                  onClick={() => pickRole(r.id)}
                >
                  <span className="role__top">
                    <span className="role__icon">
                      <Icon size={17} />
                    </span>
                    {selected && <span className="role__badge">Active</span>}
                  </span>
                  <span className="role__title">{r.title}</span>
                  <span className="role__desc">{r.desc}</span>
                  <span className="role__foot">
                    {r.foot} <FootIcon size={13} />
                  </span>
                </button>
              )
            })}
          </div>

          <div className="auth__form">
            <div className="seg" role="tablist" aria-label="Log in or sign up">
              <button
                type="button"
                role="tab"
                aria-selected={!isSignup}
                className={!isSignup ? 'is-active' : ''}
                onClick={() => pickMode('login')}
              >
                Log In
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={isSignup}
                className={isSignup ? 'is-active' : ''}
                disabled={isAdmin}
                title={isAdmin ? 'Admin accounts are issued by Nepal Stay' : undefined}
                onClick={() => pickMode('signup')}
              >
                Sign Up
              </button>
            </div>

            {/* Google sign-in is for travelers only. */}
            {!isAdmin && !isHost && (
              <>
            <div className="socials">
              <button type="button" onClick={googleSignIn} disabled={busy}>
                <GoogleIcon /> Continue with Google
              </button>
            </div>

            <div className="auth__or">
              or email
            </div>
              </>
            )}

            <form onSubmit={handleSubmit} noValidate>
              {isSignup && (
                <div className="field">
                  <label htmlFor="name">Full name</label>
                  <div className={`input ${errors.name ? 'has-error' : ''}`}>
                    <User size={17} />
                    <input
                      id="name"
                      type="text"
                      autoComplete="name"
                      placeholder="Pasang Sherpa"
                      value={form.name}
                      onChange={update('name')}
                      aria-invalid={!!errors.name}
                    />
                  </div>
                  {errors.name && <p className="field__error">{errors.name}</p>}
                </div>
              )}

              <div className="field">
                <label htmlFor="identifier">
                  {isAdmin
                    ? 'Username'
                    : isSignup
                      ? 'Email address'
                      : hostLogin
                        ? 'Host ID or Email'
                        : 'Email address'}
                </label>
                <div className={`input ${errors.identifier ? 'has-error' : ''}`}>
                  {isAdmin ? <User size={17} /> : hostLogin ? <IdCard size={17} /> : <Mail size={17} />}
                  <input
                    id="identifier"
                    type="text"
                    inputMode={isAdmin || hostLogin ? 'text' : 'email'}
                    autoCapitalize="none"
                    autoComplete={isSignup ? 'email' : 'username'}
                    placeholder={
                      isAdmin
                        ? 'admin username'
                        : isSignup
                          ? `namaste@${roleId}.com`
                          : hostLogin
                            ? 'e.g. NEP-HOST-8421 or you@example.com'
                            : `namaste@${roleId}.com`
                    }
                    value={form.identifier}
                    onChange={update('identifier')}
                    aria-invalid={!!errors.identifier}
                  />
                </div>
                {errors.identifier && <p className="field__error">{errors.identifier}</p>}
              </div>

              <div className="field">
                <div className="field__row">
                  <label htmlFor="password">
                    {hostLogin ? 'Host Security PIN / Password' : 'Password'}
                  </label>
                  {!isSignup && (
                    <button
                      type="button"
                      className={`field__link ${hostLogin ? 'field__link--host' : ''}`}
                      onClick={() => {
                        setFailure('')
                        if (isAdmin) {
                          setNotice('Admin passwords are changed on the server with the create-admin command.')
                          return
                        }
                        setNotice('')
                        setForgot(true)
                      }}
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className={`input ${errors.password ? 'has-error' : ''}`}>
                  {hostLogin ? <KeyRound size={17} /> : <Lock size={17} />}
                  <PasswordInput
                    id="password"
                    autoComplete={isSignup ? 'new-password' : 'current-password'}
                    placeholder="••••••••••••"
                    value={form.password}
                    onChange={update('password')}
                    aria-invalid={!!errors.password}
                  />
                </div>
                {errors.password && <p className="field__error">{errors.password}</p>}
              </div>

              <button
                type="submit"
                className={`auth__submit ${isHost ? 'auth__submit--host' : ''}`}
                disabled={busy}
              >
                {busy
                  ? 'Please wait…'
                  : hostLogin
                    ? 'Log In to Host Desk'
                    : `${isSignup ? 'Sign Up' : 'Log In'} as ${role.name}`}
                {!busy && (hostLogin ? <Home size={17} /> : <ArrowRight size={17} />)}
              </button>

              <p className={`auth__notice ${failure ? 'is-error' : ''}`} role="status">
                {failure || notice}
              </p>

              {hostLogin && (
                <div className="hostcta">
                  <Home size={18} />
                  <span>Want to list your home or village lodge?</span>
                  <button type="button" onClick={() => pickMode('signup')}>
                    Start Hosting Guide
                  </button>
                </div>
              )}
            </form>
          </div>
            </>
          )}

          <p className="auth__legal">
            By continuing, you agree to use Nepal Stay respectfully towards hosts, guests and the
            mountain communities you visit.
          </p>
        </div>
      </div>
    </div>
  )
}
