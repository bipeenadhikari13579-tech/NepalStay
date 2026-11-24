import mongoose from 'mongoose'

// Append-only record of what admins did. Never updated or deleted by the app.
const auditLogSchema = new mongoose.Schema(
  {
    actorId: String,
    actorName: String,
    action: { type: String, required: true }, // short verb phrase, e.g. "published listing"
    detail: String, // what it was done to
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

auditLogSchema.index({ createdAt: -1 })

const AuditLog = mongoose.model('AuditLog', auditLogSchema)

/** Records an admin action. Never throws: a logging failure must not break the action. */
export async function audit(user, action, detail = '') {
  try {
    await AuditLog.create({ actorId: user._id.toString(), actorName: user.name, action, detail })
  } catch (err) {
    console.error(`Audit log failed: ${err.message}`)
  }
}

export default AuditLog
