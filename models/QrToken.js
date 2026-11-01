const { Schema, model, models } = require('mongoose');

// The QR code a student shows to the invigilator. Valid for 2 minutes and single use.
// Only the hash is stored: the phone shows the real value.
const qrTokenSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assessmentId: { type: Schema.Types.ObjectId, ref: 'Assessment', required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
    usedBy: { type: Schema.Types.ObjectId, ref: 'User' }, // the invigilator who scanned it
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Expired tokens are deleted automatically by MongoDB
qrTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
qrTokenSchema.index({ studentId: 1, assessmentId: 1 });

module.exports = models.QrToken || model('QrToken', qrTokenSchema);
