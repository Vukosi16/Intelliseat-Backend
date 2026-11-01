const { Schema, model, models } = require('mongoose');

// Expulsions are final. When you create one, also set the seatAllocation status to 'expelled'
// (and holdsSeat to false), and stop that student's QR scans for the assessment.
const expulsionSchema = new Schema(
  {
    assessmentId: { type: Schema.Types.ObjectId, ref: 'Assessment', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    seatId: { type: Schema.Types.ObjectId, ref: 'Seat', required: true },
    expelledBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

expulsionSchema.index({ assessmentId: 1, studentId: 1 }, { unique: true });

module.exports = models.Expulsion || model('Expulsion', expulsionSchema);
