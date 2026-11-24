// Host KYC endpoints: the host submits documents, an admin approves or rejects them.
import User from '../models/User.js'
import KycSubmission, { ID_TYPES } from '../models/KycSubmission.js'
import { audit } from '../models/AuditLog.js'
import {
  KYC_FILES,
  isKycName,
  kycKind,
  readKycUpload,
  sendKycFile,
  writeKycFile,
} from './kycFiles.js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ID_NUMBER_RE = /^[A-Za-z0-9][A-Za-z0-9 /-]{2,39}$/

function ageOn(dob, today = new Date()) {
  const [y, m, d] = dob.split('-').map(Number)
  let age = today.getUTCFullYear() - y
  if (today.getUTCMonth() + 1 < m || (today.getUTCMonth() + 1 === m && today.getUTCDate() < d)) age -= 1
  return age
}

/** Checks the text fields. Returns an errors object (empty when everything is fine). */
function readFields(body) {
  const errors = {}
  const fullName = String(body.fullName ?? '').trim().replace(/\s+/g, ' ')
  const dob = String(body.dob ?? '').trim()
  const idType = String(body.idType ?? '')
  const idNumber = String(body.idNumber ?? '').trim()

  if (fullName.length < 3 || fullName.length > 100) errors.fullName = 'Enter your full legal name.'
  if (!DATE_RE.test(dob) || Number.isNaN(Date.parse(dob))) errors.dob = 'Enter your date of birth.'
  else if (ageOn(dob) < 18) errors.dob = 'You must be at least 18 years old to host.'
  else if (ageOn(dob) > 110) errors.dob = 'Check the year of your date of birth.'
  if (!ID_TYPES[idType]) errors.idType = 'Choose the type of ID document.'
  if (!ID_NUMBER_RE.test(idNumber)) errors.idNumber = 'Enter the number shown on your ID document.'

  return { errors, fields: { fullName, dob, idType, idNumber } }
}

/** What a host may see about their own submission. */
const forHost = (s) =>
  s && {
    id: s._id,
    status: s.status,
    fullName: s.fullName,
    dob: s.dob,
    idType: s.idType,
    idNumber: s.idNumber,
    files: s.files,
    reviewNote: s.reviewNote ?? null,
    reviewedAt: s.reviewedAt ?? null,
    createdAt: s.createdAt,
  }

/* ---------------- Host side ---------------- */

export function mountHostKyc(router) {
  router.get('/kyc', async (req, res, next) => {
    try {
      const latest = await KycSubmission.findOne({ userId: req.user._id.toString() }).sort({ createdAt: -1 })
      res.json({ status: req.user.kycStatus ?? 'none', submission: forHost(latest), idTypes: ID_TYPES })
    } catch (err) {
      next(err)
    }
  })

  router.post('/kyc', readKycUpload, async (req, res, next) => {
    try {
      if (['pending', 'approved'].includes(req.user.kycStatus)) {
        return res.status(409).json({
          message:
            req.user.kycStatus === 'approved'
              ? 'Your identity is already verified.'
              : 'Your documents are already being reviewed.',
        })
      }

      const { errors, fields } = readFields(req.body ?? {})

      // Check every file before writing any of them.
      const kinds = {}
      for (const [name, spec] of Object.entries(KYC_FILES)) {
        const upload = req.files?.[name]?.[0]
        if (!upload) {
          if (spec.required) errors[name] = `Add your ${spec.label.toLowerCase()}.`
          continue
        }
        const kind = kycKind(upload.buffer, spec)
        if (!kind) errors[name] = spec.pdf ? 'Upload a JPG, PNG, WebP photo or a PDF.' : 'Upload a JPG, PNG or WebP photo.'
        else kinds[name] = { kind, buffer: upload.buffer }
      }
      if (Object.keys(errors).length)
        return res.status(400).json({ message: 'Please fix the highlighted fields.', errors })

      const files = {}
      for (const [name, { kind, buffer }] of Object.entries(kinds)) files[name] = await writeKycFile(buffer, kind)

      const submission = await KycSubmission.create({
        userId: req.user._id.toString(),
        hostId: req.user.hostId,
        ...fields,
        files,
        status: 'pending',
      })
      req.user.kycStatus = 'pending'
      await req.user.save()
      res.status(201).json({ status: 'pending', submission: forHost(submission) })
    } catch (err) {
      next(err)
    }
  })

  router.get('/kyc/files/:file', async (req, res, next) => {
    try {
      const { file } = req.params
      const own =
        isKycName(file) &&
        (await KycSubmission.exists({
          userId: req.user._id.toString(),
          $or: Object.keys(KYC_FILES).map((name) => ({ [`files.${name}.file`]: file })),
        }))
      if (!own) return res.status(404).json({ message: 'File not found.' })
      await sendKycFile(res, file)
    } catch (err) {
      next(err)
    }
  })
}

/* ---------------- Admin side ---------------- */

export function mountAdminKyc(router) {
  router.get('/kyc', async (req, res, next) => {
    try {
      const filter = {}
      if (['pending', 'approved', 'rejected'].includes(req.query.status)) filter.status = req.query.status
      const [subs, counts] = await Promise.all([
        KycSubmission.find(filter).sort({ status: 1, createdAt: 1 }).limit(200),
        KycSubmission.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      ])
      const users = await User.find({ _id: { $in: subs.map((s) => s.userId) } }).select('name email hostId')
      const byId = Object.fromEntries(users.map((u) => [u._id.toString(), u]))
      res.json({
        submissions: subs.map((s) => ({
          id: s._id,
          status: s.status,
          fullName: s.fullName,
          idType: s.idType,
          hostId: s.hostId ?? byId[s.userId]?.hostId ?? null,
          accountName: byId[s.userId]?.name ?? '(deleted account)',
          email: byId[s.userId]?.email ?? null,
          createdAt: s.createdAt,
          reviewedAt: s.reviewedAt ?? null,
        })),
        counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
      })
    } catch (err) {
      next(err)
    }
  })

  router.get('/kyc/:id', async (req, res, next) => {
    try {
      const s = await KycSubmission.findById(req.params.id).catch(() => null)
      if (!s) return res.status(404).json({ message: 'Submission not found.' })
      const user = await User.findById(s.userId).select('name email hostId kycStatus createdAt')
      const previous = await KycSubmission.countDocuments({ userId: s.userId, _id: { $ne: s._id } })
      res.json({
        submission: { ...forHost(s), reviewedBy: s.reviewedBy ?? null },
        account: user && {
          name: user.name,
          email: user.email ?? null,
          hostId: user.hostId ?? null,
          kycStatus: user.kycStatus ?? 'none',
          joined: user.createdAt,
        },
        previousSubmissions: previous,
        idTypes: ID_TYPES,
      })
    } catch (err) {
      next(err)
    }
  })

  router.get('/kyc/:id/files/:file', async (req, res, next) => {
    try {
      const s = await KycSubmission.findById(req.params.id).catch(() => null)
      const { file } = req.params
      if (!s || !isKycName(file) || !s.fileNames().includes(file))
        return res.status(404).json({ message: 'File not found.' })
      await sendKycFile(res, file)
    } catch (err) {
      next(err)
    }
  })

  router.patch('/kyc/:id', async (req, res, next) => {
    try {
      const s = await KycSubmission.findById(req.params.id).catch(() => null)
      if (!s) return res.status(404).json({ message: 'Submission not found.' })
      if (s.status !== 'pending')
        return res.status(400).json({ message: `This submission was already ${s.status}.` })

      const decision = req.body?.decision
      const note = String(req.body?.note ?? '').trim().slice(0, 500)
      if (!['approve', 'reject'].includes(decision))
        return res.status(400).json({ message: 'Choose approve or reject.' })
      if (decision === 'reject' && note.length < 5)
        return res.status(400).json({
          message: 'Tell the host what to fix.',
          errors: { note: 'Write a reason the host will see, for example "Photo of the ID is blurry".' },
        })

      const user = await User.findById(s.userId)
      s.status = decision === 'approve' ? 'approved' : 'rejected'
      s.reviewNote = note || undefined
      s.reviewedBy = req.user.name
      s.reviewedAt = new Date()
      await s.save()
      if (user) {
        user.kycStatus = s.status
        await user.save()
      }
      await audit(req.user, decision === 'approve' ? 'approved host KYC' : 'rejected host KYC', `${s.fullName} (${s.hostId ?? 'no Host ID'})`)
      res.json({ status: s.status })
    } catch (err) {
      next(err)
    }
  })
}
