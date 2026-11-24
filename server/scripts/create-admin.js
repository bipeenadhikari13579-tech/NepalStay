// Creates a System Admin account, or resets the password of an existing one.
// Usage:  npm run create-admin -- <username> "<password>" ["Display Name"]
import 'dotenv/config'
import mongoose from 'mongoose'
import { connectDB } from '../src/config/db.js'
import User from '../src/models/User.js'

const [rawUsername, password, name] = process.argv.slice(2)
const username = (rawUsername ?? '').trim().toLowerCase()

if (!/^[a-z0-9._-]{3,30}$/.test(username) || !password || password.length < 4) {
  console.error('Usage: npm run create-admin -- <username> "<password>" ["Display Name"]')
  console.error('Username: 3-30 characters, letters, numbers, dot, dash or underscore.')
  console.error('Password: at least 4 characters (use 8+ before the site goes public).')
  process.exit(1)
}

await connectDB()
const user = (await User.findOne({ username })) ?? new User({ username })
if (user.role && user.role !== 'admin' && !user.isNew) {
  console.error(`"${username}" belongs to a non-admin account.`)
  process.exit(1)
}
user.name = name ?? user.name ?? username
user.role = 'admin'
user.emailVerified = true
await user.setPassword(password)
await user.save()
console.log(`Admin ready. Username: ${user.username}`)
await mongoose.disconnect()
