// Uploaded files (chat photos, KYC documents) are kept in MongoDB (GridFS), so they
// survive restarts and redeploys on hosts whose disk is wiped, such as Render's free plan.
// Files saved to disk by earlier versions of the app are still served as a fallback.
import { createReadStream } from 'node:fs'
import { access } from 'node:fs/promises'
import path from 'node:path'
import mongoose from 'mongoose'

let bucket = null
const getBucket = () =>
  (bucket ??= new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' }))

/** Stores a file under a name chosen by the caller (always a random, generated name). */
export function storeFile(name, buffer, { type, category }) {
  return new Promise((resolve, reject) => {
    const up = getBucket().openUploadStream(name, { metadata: { type, category } })
    up.once('error', reject)
    up.once('finish', resolve)
    up.end(buffer)
  })
}

/**
 * Streams a stored file to the response. `legacyDir` is where older versions kept the
 * file on disk. Responds 404 when the file exists in neither place.
 */
export async function sendStoredFile(res, name, { type, legacyDir, cache }) {
  res.set('Cache-Control', cache)
  res.set('X-Content-Type-Options', 'nosniff')

  const found = await getBucket().find({ filename: name }).limit(1).toArray()
  if (found.length) {
    res.type(type ?? found[0].metadata?.type ?? 'application/octet-stream')
    getBucket()
      .openDownloadStreamByName(name)
      .once('error', () => !res.headersSent && res.status(404).json({ message: 'File not found.' }))
      .pipe(res)
    return
  }

  const onDisk = legacyDir && path.join(legacyDir, name)
  if (onDisk && (await access(onDisk).then(() => true, () => false))) {
    if (type) res.type(type)
    createReadStream(onDisk).pipe(res)
    return
  }
  res.status(404).json({ message: 'File not found.' })
}
