import { createHash, randomInt, timingSafeEqual } from 'node:crypto'

export const HOST_ID_RE = /^NEP-HOST-\d{4,6}$/
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const ROLES = ['traveler', 'host', 'admin']

export const CODE_MINUTES = 10
const CODE_MAX_ATTEMPTS = 5
const RESEND_COOLDOWN_MS = 60 * 1000

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, lowercase: true, trim: true },
    // Hosts get a public ID such as NEP-HOST-8421, which they can also log in with.
    hostId: { type: String, uppercase: true },
    // Ids of stays the traveler has hearted.
    saved: { type: [String], default: undefined },
    // Set when the account is linked to a Google account.
    googleId: { type: String },
    // Admins log in with a username instead of an email.
    username: { type: String, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, select: false },
    // Accounts created by the earlier version of the app stored the bcrypt hash here.
    // It is moved to passwordHash the first time such a user logs in.
    password: { type: String, select: false },
    role: { type: String, enum: ROLES, default: 'traveler' },
    // Host identity check: none (not submitted), pending, approved (Verified tag) or rejected.
    kycStatus: { type: String, enum: ['none', 'pending', 'approved', 'rejected'] },

    // false until the emailed code is confirmed. Accounts from before
    // verification existed have no value and are treated as verified.
    emailVerified: { type: Boolean },
    verifyCodeHash: { type: String, select: false },
    verifyCodeExpires: { type: Date, select: false },
    verifyAttempts: { type: Number, select: false },
    verifyLastSent: { type: Date, select: false },

    // Password reset code, kept separate from the email-verification code above.
    resetCodeHash: { type: String, select: false },
    resetCodeExpires: { type: Date, select: false },
    resetAttempts: { type: Number, select: false },
    resetLastSent: { type: Date, select: false },
  },
  { timestamps: true },
)

// Unique only among documents that actually have the field.
userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } })
userSchema.index({ username: 1 }, { unique: true, partialFilterExpression: { username: { $type: 'string' } } })
userSchema.index({ googleId: 1 }, { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } })
userSchema.index({ hostId: 1 }, { unique: true, partialFilterExpression: { hostId: { $type: 'string' } } })
userSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: 'string' } } })

// Every host gets a Host ID the first time the account is saved as a host.
userSchema.pre('save', async function () {
  if (this.role !== 'host' || this.hostId) return
  for (let i = 0; i < 20; i++) {
    const candidate = `NEP-HOST-${randomInt(1000, 10000)}`
    if (!(await this.constructor.exists({ hostId: candidate }))) {
      this.hostId = candidate
      return
    }
  }
  this.hostId = `NEP-HOST-${randomInt(100000, 1000000)}`
})

export const VERIFY_FIELDS = '+verifyCodeHash +verifyCodeExpires +verifyAttempts +verifyLastSent'

const hashCode = (user, code) =>
  createHash('sha256').update(`${user._id}:${code}`).digest()

userSchema.methods.setPassword = async function (password) {
  this.passwordHash = await bcrypt.hash(password, 12)
}

userSchema.methods.checkPassword = async function (password) {
  const hash = this.passwordHash ?? this.password
  if (typeof hash !== 'string' || !hash.startsWith('$2')) return false
  return bcrypt.compare(password, hash)
}

/** Brings an account from the earlier app version up to the current shape. */
userSchema.methods.upgradeLegacy = async function () {
  if (this.passwordHash && this.password === undefined && this.phone !== '') return
  if (!this.passwordHash) this.passwordHash = this.password
  this.password = undefined
  if (this.phone === '') this.phone = undefined
  await this.save()
}

userSchema.methods.needsVerification = function () {
  return this.emailVerified === false
}

/** Seconds until another code may be sent (0 = now). Needs VERIFY_FIELDS selected. */
userSchema.methods.resendWait = function () {
  if (!this.verifyLastSent) return 0
  const left = RESEND_COOLDOWN_MS - (Date.now() - this.verifyLastSent.getTime())
  return Math.max(0, Math.ceil(left / 1000))
}

/** Creates and stores a fresh 6-digit code; returns it so it can be emailed. */
userSchema.methods.newVerifyCode = async function () {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  this.verifyCodeHash = hashCode(this, code).toString('hex')
  this.verifyCodeExpires = new Date(Date.now() + CODE_MINUTES * 60 * 1000)
  this.verifyAttempts = 0
  this.verifyLastSent = new Date()
  await this.save()
  return code
}

/**
 * Checks a submitted code. Needs VERIFY_FIELDS selected.
 * Returns 'ok' | 'wrong' | 'expired' | 'locked'.
 */
userSchema.methods.confirmVerifyCode = async function (code) {
  if (!this.verifyCodeHash || !this.verifyCodeExpires || this.verifyCodeExpires < new Date())
    return 'expired'
  if ((this.verifyAttempts ?? 0) >= CODE_MAX_ATTEMPTS) return 'locked'

  const given = hashCode(this, String(code))
  const stored = Buffer.from(this.verifyCodeHash, 'hex')
  if (given.length !== stored.length || !timingSafeEqual(given, stored)) {
    this.verifyAttempts = (this.verifyAttempts ?? 0) + 1
    await this.save()
    return this.verifyAttempts >= CODE_MAX_ATTEMPTS ? 'locked' : 'wrong'
  }

  this.emailVerified = true
  this.verifyCodeHash = undefined
  this.verifyCodeExpires = undefined
  this.verifyAttempts = undefined
  this.verifyLastSent = undefined
  await this.save()
  return 'ok'
}

export const RESET_FIELDS = '+resetCodeHash +resetCodeExpires +resetAttempts +resetLastSent'

/** Seconds until another reset code may be sent (0 = now). Needs RESET_FIELDS selected. */
userSchema.methods.resetWait = function () {
  if (!this.resetLastSent) return 0
  const left = RESEND_COOLDOWN_MS - (Date.now() - this.resetLastSent.getTime())
  return Math.max(0, Math.ceil(left / 1000))
}

/** Creates and stores a fresh 6-digit password reset code; returns it so it can be emailed. */
userSchema.methods.newResetCode = async function () {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  this.resetCodeHash = hashCode(this, `reset:${code}`).toString('hex')
  this.resetCodeExpires = new Date(Date.now() + CODE_MINUTES * 60 * 1000)
  this.resetAttempts = 0
  this.resetLastSent = new Date()
  await this.save()
  return code
}

/**
 * Checks a submitted reset code. Needs RESET_FIELDS selected.
 * Returns 'ok' | 'wrong' | 'expired' | 'locked'. On 'ok' the code is used up,
 * but the caller must still save the user (after setting the new password).
 */
userSchema.methods.confirmResetCode = async function (code) {
  if (!this.resetCodeHash || !this.resetCodeExpires || this.resetCodeExpires < new Date())
    return 'expired'
  if ((this.resetAttempts ?? 0) >= CODE_MAX_ATTEMPTS) return 'locked'

  const given = hashCode(this, `reset:${code}`)
  const stored = Buffer.from(this.resetCodeHash, 'hex')
  if (given.length !== stored.length || !timingSafeEqual(given, stored)) {
    this.resetAttempts = (this.resetAttempts ?? 0) + 1
    await this.save()
    return this.resetAttempts >= CODE_MAX_ATTEMPTS ? 'locked' : 'wrong'
  }

  this.resetCodeHash = undefined
  this.resetCodeExpires = undefined
  this.resetAttempts = undefined
  this.resetLastSent = undefined
  return 'ok'
}

userSchema.methods.toPublic = function () {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email ?? null,
    username: this.username ?? null,
    hostId: this.hostId ?? null,
    kycStatus: this.role === 'host' ? (this.kycStatus ?? 'none') : undefined,
    phone: this.phone ?? null,
    role: this.role,
  }
}

export default mongoose.model('User', userSchema)
