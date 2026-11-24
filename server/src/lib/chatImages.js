// Photos attached to chat messages. They are stored on disk in server/uploads/messages
// and are only ever sent back through a route that checks who is asking.
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import multer from 'multer'
import { storeFile } from './fileStore.js'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
// Where earlier versions saved chat photos on disk; still read as a fallback.
export const IMAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads/messages')

// Recognised by their first bytes, not by the name or type the browser claims.
const KINDS = [
  { ext: 'jpg', type: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', type: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) },
  { ext: 'gif', type: 'image/gif', test: (b) => ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1')) },
  {
    ext: 'webp',
    type: 'image/webp',
    test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
]

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
}).single('image')

/** Express middleware: reads an optional "image" file from a multipart request into req.file. */
export function readImageUpload(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next()
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'That photo is too large. The limit is 5 MB.'
        : 'That photo could not be uploaded. Please try another one.'
    res.status(400).json({ message })
  })
}

/** The image kind of a buffer, recognised from its first bytes, or null. */
export const imageKind = (buffer) => (buffer.length >= 12 ? KINDS.find((k) => k.test(buffer)) : null) ?? null

/**
 * Saves an uploaded photo. Returns { file, type, size } for the message,
 * or null when the bytes are not a JPEG, PNG, GIF or WebP image.
 */
export async function saveImage(buffer) {
  const kind = imageKind(buffer)
  if (!kind) return null
  const file = `${randomBytes(16).toString('hex')}.${kind.ext}`
  await storeFile(file, buffer, { type: kind.type, category: 'chat' })
  return { file, type: kind.type, size: buffer.length }
}

/** Only names this module generated are ever read from disk. */
export const isImageName = (name) => /^[0-9a-f]{32}\.(jpg|png|gif|webp)$/.test(name)
