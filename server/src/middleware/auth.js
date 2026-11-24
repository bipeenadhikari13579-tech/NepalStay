import jwt from 'jsonwebtoken'
import User from '../models/User.js'

const COOKIE_NAME = 'ns_token'
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
}

export function setAuthCookie(res, user) {
  const token = jwt.sign({ sub: user._id.toString(), role: user.role }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  })
  res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: WEEK_MS })
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions)
}

/** Requires a valid session; attaches the user as req.user. */
export async function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME]
  if (!token) return res.status(401).json({ message: 'Please log in.' })
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    const user = await User.findById(payload.sub)
    if (!user) throw new Error('user no longer exists')
    req.user = user
    next()
  } catch {
    clearAuthCookie(res)
    res.status(401).json({ message: 'Your session has expired. Please log in again.' })
  }
}

/** Use after requireAuth: requireRole('host', 'admin') */
export function requireRole(...roles) {
  return (req, res, next) =>
    roles.includes(req.user.role)
      ? next()
      : res.status(403).json({ message: 'You do not have access to this.' })
}
