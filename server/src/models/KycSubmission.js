import mongoose from 'mongoose'

export const ID_TYPES = { passport: 'Passport', citizenship: 'Citizenship', nid: 'National ID (NID)' }
const KYC_STATUSES = ['pending', 'approved', 'rejected']

const fileSchema = new mongoose.Schema({ file: String, type: String, size: Number }, { _id: false })

// One identity check submitted by a host. A rejected host submits a new one;
// old submissions are kept as a record of what was reviewed.
const kycSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    hostId: String,
    fullName: { type: String, required: true, trim: true, maxlength: 100 },
    dob: { type: String, required: true }, // YYYY-MM-DD
    idType: { type: String, enum: Object.keys(ID_TYPES), required: true },
    idNumber: { type: String, required: true, trim: true, maxlength: 40 },
    files: {
      companyCert: fileSchema,
      idFront: fileSchema,
      idBack: fileSchema,
      selfie: fileSchema,
    },
    status: { type: String, enum: KYC_STATUSES, default: 'pending', index: true },
    reviewNote: { type: String, trim: true, maxlength: 500 },
    reviewedBy: String,
    reviewedAt: Date,
  },
  { timestamps: true },
)

/** Every stored file name of a submission. */
kycSchema.methods.fileNames = function () {
  return Object.values(this.files?.toObject?.() ?? this.files ?? {})
    .map((f) => f?.file)
    .filter(Boolean)
}

export default mongoose.model('KycSubmission', kycSchema)
