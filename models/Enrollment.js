const { Schema, model, models } = require('mongoose');
const { ENROLLMENT_STATUSES } = require('./constants');

// Who is supposed to sit which module in which academic year.
// This replaces the typed-in "Enrolled students: 40" number.
const enrollmentSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    moduleId: { type: Schema.Types.ObjectId, ref: 'Module', required: true },
    academicYear: { type: Number, required: true }, // 2026
    status: { type: String, enum: ENROLLMENT_STATUSES, default: 'enrolled' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// A student is enrolled in a module only once per academic year
enrollmentSchema.index({ studentId: 1, moduleId: 1, academicYear: 1 }, { unique: true });
enrollmentSchema.index({ moduleId: 1, academicYear: 1, status: 1 });

module.exports = models.Enrollment || model('Enrollment', enrollmentSchema);
