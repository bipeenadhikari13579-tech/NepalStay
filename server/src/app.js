// The Express app, shared by the local server (index.js) and the Vercel "server" service (see vercel.json).
import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connectDB } from './config/db.js'
import authRoutes from './routes/auth.js'
import adminRoutes from './routes/admin.js'
import hostRoutes from './routes/host.js'
import staysRoutes from './routes/stays.js'
import messageRoutes from './routes/messages.js'
import Listing from './models/Listing.js'

const { JWT_SECRET } = process.env
if (!JWT_SECRET || JWT_SECRET === 'change-me') throw new Error('JWT_SECRET is missing. Copy .env.example to .env and set it.')

let ready = null
/** Connects to MongoDB once and runs one-off data fixes. Safe to call on every request. */
export function connect() {
  ready ??= connectDB()
    // Listings created before statuses existed are live listings.
    .then(() => Listing.updateMany({ status: { $exists: false } }, { $set: { status: 'published' } }))
    .catch((err) => {
      ready = null // try again on the next request
      throw err
    })
  return ready
}

const app = express()
const production = process.env.NODE_ENV === 'production'
// Hosts like Render and Vercel sit behind one proxy: trust it so secure cookies and rate limits see the real visitor.
if (production || process.env.VERCEL) app.set('trust proxy', 1)
app.use(express.json({ limit: '100kb' }))
app.use(cookieParser())
// On Vercel each server instance connects on its first request.
app.use('/api', async (_req, _res, next) => {
  try {
    await connect()
    next()
  } catch (err) {
    next(err)
  }
})

app.get('/api/health', (_req, res) => res.json({ name: 'Nepal Stay API', status: 'ok' }))
app.use('/api/auth', authRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/host', hostRoutes)
app.use('/api/messages', messageRoutes)
app.use('/api', staysRoutes)

// In production this server also serves the built website (client/dist), so the
// whole site lives at one address and login cookies stay on that one site.
const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist')
if (production && existsSync(site)) {
  app.use(express.static(site, { index: false, maxAge: '1h' }))
  // Every other page address (no file extension, not /api) is handled by the website itself.
  app.get(/^\/(?!api\/)(?!.*\.[a-z0-9]+$).*/i, (_req, res) => res.sendFile(path.join(site, 'index.html')))
}

app.use((_req, res) => res.status(404).json({ message: 'Not found.' }))

app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid request body.' })
  }
  console.error(err)
  res.status(500).json({ message: 'Something went wrong on our side. Please try again.' })
})

export default app
