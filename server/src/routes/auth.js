import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import User, { CODE_MINUTES, HOST_ID_RE, RESET_FIELDS, VERIFY_FIELDS } from '../models/User.js'
import { clearAuthCookie, requireAuth, setAuthCookie } from '../middleware/auth.js'
import { mailConfigured, sendVerificationCode } from '../lib/mailer.js'
import { audit } from '../models/AuditLog.js'
import { GoogleAuthError, googleClientId, verifyGoogleToken } from '../lib/google.js'

const router = Router()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USERNAME_RE = /^[a-z0-9._-]{3,30}$/
const ROLE_LABEL = { traveler: 'Traveler', host: 'Host', admin: 'System Admin' }

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please wait a few minutes and try again.' },
})

const parseEmail = (raw) =>
  typeof raw === 'string' && EMAIL_RE.test(raw.trim()) ? raw.trim().toLowerCase() : null

/** "name@x.com" -> { email }, "NEP-HOST-1234" -> { hostId }, otherwise null. Phone numbers are not used to log in. */
function parseIdentifier(raw) {
  const email = parseEmail(raw)
  if (email) return { email }
  if (typeof raw !== 'string') return null
  const hostId = raw.trim().toUpperCase()
  return HOST_ID_RE.test(hostId) ? { hostId } : null
}

function parseUsername(raw) {
  if (typeof raw !== 'string') return null
  const username = raw.trim().toLowerCase()
  return USERNAME_RE.test(username) ? { username } : null
}

/** Generates a code and emails it. Throws MailError if the email cannot be sent. */
class MailError extends Error {}
async function issueCode(user, { to = user.email, purpose = 'signup' } = {}) {
  const code = await user.newVerifyCode()
  try {
    return await sendVerificationCode({
      purpose,
      to,
      name: user.name,
      code,
      minutes: CODE_MINUTES,
    })
  } catch (err) {
    console.error(`Could not send verification email: ${err.message}`)
    throw new MailError()
  }
}

const maskEmail = (email) => email.replace(/^(.{3})[^@]*/, '$1***')

const mailFailed = (res) =>
  res.status(502).json({
    message: 'We could not send the verification email. Please try again in a moment.',
  })

router.post('/signup', limiter, async (req, res, next) => {
  try {
    const { name, identifier, password, role = 'traveler' } = req.body ?? {}
    const errors = {}

    if (typeof name !== 'string' || !name.trim()) errors.name = 'Enter your full name.'
    // Sign-up needs an email address, because that is where the verification code goes.
    const email = parseEmail(identifier)
    if (!email) errors.identifier = 'Enter a valid email address.'
    if (typeof password !== 'string' || password.length < 8)
      errors.password = 'Use at least 8 characters.'
    else if (password.length > 72) errors.password = 'Use 72 characters or fewer.'
    // Admin accounts are created with `npm run create-admin`, never from the site.
    if (!['traveler', 'host'].includes(role))
      return res.status(403).json({ message: 'Admin accounts cannot be created here.' })
    if (Object.keys(errors).length)
      return res.status(400).json({ message: 'Please fix the highlighted fields.', errors })

    let user = await User.findOne({ email }).select(VERIFY_FIELDS)
    if (user && !user.needsVerification()) {
      return res.status(409).json({
        message: 'An account with this email already exists. Try logging in.',
        errors: { identifier: 'This email is already registered.' },
      })
    }
    // A sign-up that was never verified can simply be started again.
    user ??= new User({ email })
    user.name = name.trim()
    user.role = role
    user.emailVerified = false
    await user.setPassword(password)

    const delivery = await issueCode(user)
    res.status(201).json({ needsVerification: true, email, delivery })
  } catch (err) {
    if (err instanceof MailError) return mailFailed(res)
    if (err.code === 11000)
      return res.status(409).json({ message: 'This account already exists. Try logging in.' })
    next(err)
  }
})

router.post('/verify-email', limiter, async (req, res, next) => {
  try {
    const email = parseEmail(req.body?.email)
    const code = String(req.body?.code ?? '').trim()
    if (!email || !/^\d{6}$/.test(code))
      return res.status(400).json({ message: 'Enter the 6-digit code from your email.' })

    const user = await User.findOne({ email }).select(VERIFY_FIELDS)
    if (!user || !user.needsVerification())
      return res.status(400).json({ message: 'That code is not valid. Request a new one.' })

    const result = await user.confirmVerifyCode(code)
    if (result === 'ok') {
      setAuthCookie(res, user)
      return res.json({ user: user.toPublic() })
    }
    const message = {
      wrong: 'That code is not correct. Check the email and try again.',
      expired: 'That code has expired. Request a new one.',
      locked: 'Too many wrong attempts. Request a new code.',
    }[result]
    res.status(400).json({ message, code: result.toUpperCase() })
  } catch (err) {
    next(err)
  }
})

router.post('/resend-code', limiter, async (req, res, next) => {
  try {
    const email = parseEmail(req.body?.email)
    if (!email) return res.status(400).json({ message: 'Enter a valid email address.' })

    const user = await User.findOne({ email }).select(VERIFY_FIELDS)
    // Same answer whether or not the account exists, so emails cannot be probed.
    if (!user || !user.needsVerification()) return res.json({ ok: true })

    const wait = user.resendWait()
    if (wait > 0)
      return res
        .status(429)
        .json({ message: `Please wait ${wait} seconds before requesting another code.`, wait })

    const delivery = await issueCode(user)
    res.json({ ok: true, delivery })
  } catch (err) {
    if (err instanceof MailError) return mailFailed(res)
    next(err)
  }
})

router.post('/login', limiter, async (req, res, next) => {
  try {
    const { identifier, password, role } = req.body ?? {}
    // System Admins log in with a username, hosts with Host ID or email, travelers with email.
    const isAdminLogin = role === 'admin'
    const contact = isAdminLogin ? parseUsername(identifier) : parseIdentifier(identifier)
    const invalid = () =>
      res.status(401).json({
        message: isAdminLogin
          ? 'Incorrect username or password.'
          : role === 'host'
            ? 'Incorrect Host ID, email or password.'
            : 'Incorrect email or password.',
      })

    if (!contact || typeof password !== 'string' || !password) return invalid()

    const user = await User.findOne(contact).select(`+passwordHash +password ${VERIFY_FIELDS}`)
    if (!user || !(await user.checkPassword(password))) return invalid()
    // A username only ever opens an admin account.
    if (isAdminLogin && user.role !== 'admin') return invalid()

    // Admins need a second step: a code sent to one fixed address (ADMIN_OTP_EMAIL).
    if (user.role === 'admin') {
      const to = process.env.ADMIN_OTP_EMAIL
      if (!to) {
        console.error('ADMIN_OTP_EMAIL is missing in .env, so admins cannot log in.')
        return res.status(500).json({ message: 'Admin verification is not configured.' })
      }
      await user.upgradeLegacy()
      // A code sent in the last minute is still valid, so it is not sent again.
      let delivery = mailConfigured ? 'email' : 'console'
      if (user.resendWait() === 0) delivery = await issueCode(user, { to, purpose: 'admin' })
      return res.json({ code: 'ADMIN_CODE_REQUIRED', sentTo: maskEmail(to), delivery })
    }

    if (user.needsVerification()) {
      // A code sent in the last minute is still valid, so it is not sent again.
      let delivery = mailConfigured ? 'email' : 'console'
      if (user.resendWait() === 0) delivery = await issueCode(user)
      return res.status(403).json({
        code: 'EMAIL_NOT_VERIFIED',
        email: user.email,
        delivery,
        message: 'Verify your email to finish signing up. We sent you a code.',
      })
    }

    if (role && role !== user.role) {
      return res.status(403).json({
        message: `This account is registered as ${ROLE_LABEL[user.role]}. Select that role to log in.`,
      })
    }

    await user.upgradeLegacy()
    // Hosts created before Host IDs existed get theirs now.
    if (user.role === 'host' && !user.hostId) await user.save()
    setAuthCookie(res, user)
    res.json({ user: user.toPublic() })
  } catch (err) {
    if (err instanceof MailError) return mailFailed(res)
    next(err)
  }
})

router.post('/admin-verify', limiter, async (req, res, next) => {
  try {
    const contact = parseUsername(req.body?.username)
    const code = String(req.body?.code ?? '').trim()
    if (!contact || !/^\d{6}$/.test(code))
      return res.status(400).json({ message: 'Enter the 6-digit code from the email.' })

    const user = await User.findOne({ ...contact, role: 'admin' }).select(VERIFY_FIELDS)
    const result = user ? await user.confirmVerifyCode(code) : 'expired'
    if (result === 'ok') {
      setAuthCookie(res, user)
      await audit(user, 'logged in', 'password + email code')
      return res.json({ user: user.toPublic() })
    }
    const message = {
      wrong: 'That code is not correct. Check the email and try again.',
      expired: 'That code has expired. Log in again to get a new one.',
      locked: 'Too many wrong attempts. Log in again to get a new code.',
    }[result]
    res.status(400).json({ message, code: result.toUpperCase() })
  } catch (err) {
    next(err)
  }
})

/* ---------- Forgot password ---------- */

router.post('/forgot-password', limiter, async (req, res, next) => {
  try {
    const contact = parseIdentifier(req.body?.identifier)
    if (!contact)
      return res.status(400).json({ message: 'Enter the email address or Host ID on your account.' })

    const delivery = mailConfigured ? 'email' : 'console'
    const user = await User.findOne(contact).select(RESET_FIELDS)
    // Same answer whether or not the account exists, so accounts cannot be probed.
    // Admin passwords are only changed with `npm run create-admin`.
    if (!user || user.role === 'admin' || !user.email || user.resetWait() > 0)
      return res.json({ ok: true, delivery })

    const code = await user.newResetCode()
    try {
      await sendVerificationCode({
        purpose: 'reset',
        to: user.email,
        name: user.name,
        code,
        minutes: CODE_MINUTES,
      })
    } catch (err) {
      console.error(`Could not send password reset email: ${err.message}`)
      return mailFailed(res)
    }
    res.json({ ok: true, delivery })
  } catch (err) {
    next(err)
  }
})

router.post('/reset-password', limiter, async (req, res, next) => {
  try {
    const { identifier, password } = req.body ?? {}
    const code = String(req.body?.code ?? '').trim()
    const contact = parseIdentifier(identifier)
    if (!contact || !/^\d{6}$/.test(code))
      return res.status(400).json({ message: 'Enter the 6-digit code from the email.' })
    if (typeof password !== 'string' || password.length < 8)
      return res.status(400).json({ message: 'Use at least 8 characters for the new password.' })
    if (password.length > 72)
      return res.status(400).json({ message: 'Use 72 characters or fewer for the new password.' })

    const user = await User.findOne(contact).select(`+password ${RESET_FIELDS}`)
    const result = user && user.role !== 'admin' ? await user.confirmResetCode(code) : 'expired'
    if (result !== 'ok') {
      const message = {
        wrong: 'That code is not correct. Check the email and try again.',
        expired: 'That code is not valid or has expired. Request a new one.',
        locked: 'Too many wrong attempts. Request a new code.',
      }[result]
      return res.status(400).json({ message, code: result.toUpperCase() })
    }

    await user.setPassword(password)
    user.password = undefined // drop the old-format hash, if any
    if (user.phone === '') user.phone = undefined
    // The code went to their email, so the address is proven.
    user.emailVerified = true
    await user.save()

    setAuthCookie(res, user)
    res.json({ user: user.toPublic() })
  } catch (err) {
    next(err)
  }
})

/** Tells the login page which sign-in methods are set up. */
router.get('/config', (_req, res) => {
  res.json({ googleClientId })
})

router.post('/google', limiter, async (req, res, next) => {
  try {
    if (!googleClientId)
      return res.status(503).json({ message: 'Google sign-in is not set up on this server yet.' })

    const { accessToken, role = 'traveler' } = req.body ?? {}
    if (typeof accessToken !== 'string' || !accessToken)
      return res.status(400).json({ message: 'Google sign-in did not complete. Please try again.' })
    // Google sign-in is for travelers only.
    if (role !== 'traveler') {
      return res.status(403).json({
        message:
          role === 'host'
            ? 'Hosts log in with their Host ID or email and a password.'
            : 'Admins log in with a username and password.',
      })
    }

    const google = await verifyGoogleToken(accessToken)

    let user =
      (await User.findOne({ googleId: google.googleId })) ??
      (await User.findOne({ email: google.email }))

    if (user) {
      if (user.role !== 'traveler') {
        return res.status(403).json({
          message: `This account is registered as ${ROLE_LABEL[user.role]}, which cannot use Google sign-in.`,
        })
      }
      // An unfinished email sign-up belongs to whoever proves they own the address.
      const unfinished = user.needsVerification()
      if (!unfinished && role !== user.role) {
        return res.status(403).json({
          message: `This account is registered as ${ROLE_LABEL[user.role]}. Select that role to log in.`,
        })
      }
      if (unfinished) {
        user.role = role
        user.name = google.name
        user.passwordHash = undefined
      }
      user.googleId = google.googleId
      user.emailVerified = true
      await user.save()
    } else {
      // Google has already verified the email, so no code step is needed.
      user = await User.create({
        name: google.name,
        email: google.email,
        googleId: google.googleId,
        role,
        emailVerified: true,
      })
    }

    setAuthCookie(res, user)
    res.json({ user: user.toPublic() })
  } catch (err) {
    if (err instanceof GoogleAuthError) return res.status(401).json({ message: err.message })
    if (err.code === 11000)
      return res.status(409).json({ message: 'This Google account is already linked to another user.' })
    next(err)
  }
})

router.post('/logout', (_req, res) => {
  clearAuthCookie(res)
  res.json({ ok: true })
})

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user.toPublic() })
})

export default router
