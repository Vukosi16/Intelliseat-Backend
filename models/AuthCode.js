const { Schema, model, models } = require('mongoose');
const { AUTH_CODE_PURPOSES } = require('./constants');

// One-time codes for first sign-in (invite) and forgotten passwords.
// Only hashes are stored. Never save the real 6-digit code or the link token.
const authCodeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    purpose: { type: String, enum: AUTH_CODE_PURPOSES, required: true },
    otpHash: { type: String, required: true },
    linkTokenHash: { type: String }, // for a reset link sent by email
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 }, // wrong guesses so far (code is dead after 5)
    usedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Expired codes are deleted automatically by MongoDB
authCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
authCodeSchema.index({ userId: 1, purpose: 1 });
authCodeSchema.index(
  { linkTokenHash: 1 },
  { unique: true, partialFilterExpression: { linkTokenHash: { $type: 'string' } } }
);

module.exports = models.AuthCode || model('AuthCode', authCodeSchema);
