const { Schema, model, models } = require('mongoose');

const absenceSchema = new Schema(
  {
    assessmentId: { type: Schema.Types.ObjectId, ref: 'Assessment', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true, trim: true, maxlength: 120 },
    details: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

absenceSchema.index({ assessmentId: 1, studentId: 1 }, { unique: true });

module.exports = models.Absence || model('Absence', absenceSchema);
