const { Schema, model, models } = require('mongoose');
const { ALLOCATION_STATUSES } = require('./constants');

// One row per student per assessment: which seat they have and whether they were checked in.
const seatAllocationSchema = new Schema(
  {
    assessmentId: { type: Schema.Types.ObjectId, ref: 'Assessment', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    seatId: { type: Schema.Types.ObjectId, ref: 'Seat', required: true },
    status: { type: String, enum: ALLOCATION_STATUSES, default: 'pending' },

    // Set by "Verify & Log". Check-in and late arrivals are worked out from verifiedAt.
    verifiedAt: { type: Date },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    expelledAt: { type: Date },

    // true while the student holds the seat. Becomes false when they are expelled, which frees
    // the seat. Used by the unique index below. If you change status with updateOne, set this
    // yourself (the save/validate hook does it for you).
    holdsSeat: { type: Boolean, default: true },
  },
  { timestamps: true }
);

seatAllocationSchema.pre('validate', function () {
  this.holdsSeat = this.status !== 'expelled';
});

// One allocation per student per assessment
seatAllocationSchema.index({ assessmentId: 1, studentId: 1 }, { unique: true });
// One student per seat per assessment (an expelled student no longer holds the seat)
seatAllocationSchema.index(
  { assessmentId: 1, seatId: 1 },
  { unique: true, partialFilterExpression: { holdsSeat: true } }
);
seatAllocationSchema.index({ studentId: 1, createdAt: -1 });
seatAllocationSchema.index({ assessmentId: 1, status: 1 });

module.exports = models.SeatAllocation || model('SeatAllocation', seatAllocationSchema);
