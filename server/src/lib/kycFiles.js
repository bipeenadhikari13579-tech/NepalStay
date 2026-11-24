// Identity documents uploaded for host KYC. They are stored on disk in server/uploads/kyc
// and are only ever sent back through routes that check who is asking (the host or an admin).
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import multer from 'multer'
import { imageKind } from './chatImages.js'
import { sendStoredFile, storeFile } from './fileStore.js'

const MAX_KYC_BYTES = 5 * 1024 * 1024
// Where earlier versions saved KYC files on disk; still read as a fallback.
export const KYC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads/kyc')

const PDF = { ext: 'pdf', type: 'application/pdf' }

/** The documents a host uploads. `pdf` = a scanned PDF is accepted as well as a photo. */
export const KYC_FILES = {
  companyCert: { label: 'Certificate of Company Registration', pdf: true, required: true },
  idFront: { label: 'ID document (front)', pdf: true, required: true },
  idBack: { label: 'ID document (back)', pdf: true, required: false },
  selfie: { label: 'Photo holding the ID document', pdf: false, required: true },
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_KYC_BYTES, files: Object.keys(KYC_FILES).length },
}).fields(Object.keys(KYC_FILES).map((name) => ({ name, maxCount: 1 })))

/** Express middleware: reads the KYC files of a multipart request into req.files. */
export function readKycUpload(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next()
    const label = KYC_FILES[err.field]?.label
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `${label ?? 'A file'} is too large. The limit is 5 MB per file.`
        : 'The documents could not be uploaded. Please try again.'
    res.status(400).json({ message, errors: err.field ? { [err.field]: message } : undefined })
  })
}

/** Works out what a file really is from its first bytes. Returns a kind or null. */
export function kycKind(buffer, { pdf }) {
  const image = imageKind(buffer)
  if (image && image.ext !== 'gif') return image
  if (pdf && buffer.subarray(0, 5).toString('latin1') === '%PDF-') return PDF
  return null
}

/** Stores a checked file; returns { file, type, size } for the submission. */
export async function writeKycFile(buffer, kind) {
  const file = `${randomBytes(16).toString('hex')}.${kind.ext}`
  await storeFile(file, buffer, { type: kind.type, category: 'kyc' })
  return { file, type: kind.type, size: buffer.length }
}

/** Only names this module generated are ever read from disk. */
export const isKycName = (name) => /^[0-9a-f]{32}\.(jpg|png|webp|pdf)$/.test(name)

/** Sends one stored KYC file. Never cached by shared caches. */
export function sendKycFile(res, file) {
  return sendStoredFile(res, file, { type: typeFor(file), legacyDir: KYC_DIR, cache: 'private, no-store' })
}

const TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf' }
/** The content type of one of our generated file names, from its extension. */
export const typeFor = (name) => TYPES[name.split('.').pop()]
