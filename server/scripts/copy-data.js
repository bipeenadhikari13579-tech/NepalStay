// Copies everything in your local database (accounts, listings, bookings, messages,
// KYC submissions and uploaded files) into another MongoDB database, such as MongoDB Atlas.
//
// Usage (from the NepalStay folder):
//   npm run copy-data -- "mongodb+srv://user:password@cluster.xxxxx.mongodb.net/nepalstay"
//
// It refuses to run if the target already has accounts, so it cannot overwrite live data.
import 'dotenv/config'
import { readdir, readFile } from 'node:fs/promises'
import mongoose from 'mongoose'
import { IMAGE_DIR } from '../src/lib/chatImages.js'
import { KYC_DIR, typeFor } from '../src/lib/kycFiles.js'

const target = process.argv[2]
if (!target || !/^mongodb(\+srv)?:\/\//.test(target)) {
  console.error('Usage: npm run copy-data -- "<MongoDB connection string of the target database>"')
  process.exit(1)
}
if (!/\/[^/?]+(\?|$)/.test(target.replace(/^mongodb(\+srv)?:\/\/[^/]+/, ''))) {
  console.error('Add the database name to the connection string, e.g. ...mongodb.net/nepalstay?retryWrites=true')
  process.exit(1)
}

const source = await mongoose.createConnection(process.env.MONGO_URI).asPromise()
const dest = await mongoose.createConnection(target, { serverSelectionTimeoutMS: 15000 }).asPromise()
console.log(`From: ${source.name} (this computer)`)
console.log(`To:   ${dest.name} on ${dest.host}`)

if (await dest.db.collection('users').estimatedDocumentCount()) {
  console.error('The target database already has accounts. Nothing was copied.')
  process.exit(1)
}

for (const { name } of await source.db.listCollections().toArray()) {
  if (name.startsWith('system.')) continue
  const docs = await source.db.collection(name).find().toArray()
  if (docs.length) await dest.db.collection(name).insertMany(docs, { ordered: false })
  console.log(`  ${name}: ${docs.length}`)
}

// Files saved on disk by earlier versions go into the target's file store too.
const bucket = new mongoose.mongo.GridFSBucket(dest.db, { bucketName: 'uploads' })
let moved = 0
for (const [dir, category] of [[IMAGE_DIR, 'chat'], [KYC_DIR, 'kyc']]) {
  for (const name of await readdir(dir).catch(() => [])) {
    if (await dest.db.collection('uploads.files').findOne({ filename: name })) continue
    const buffer = await readFile(`${dir}/${name}`)
    await new Promise((resolve, reject) =>
      bucket.openUploadStream(name, { metadata: { type: typeFor(name), category } }).once('error', reject).once('finish', resolve).end(buffer),
    )
    moved++
  }
}
console.log(`  files from disk: ${moved}`)

await Promise.all([source.close(), dest.close()])
console.log('Done. Restart the live site (or wait for its next start) so it builds its indexes.')
