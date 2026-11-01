const { Schema, model, models } = require('mongoose');
const { SWAP_REASONS } = require('./constants');

// Every seat change after the morning allocation.
// Create this and update the seatAllocation together inside one transaction.
const seatSwapSchema = new Schema(
  {
    assessmentId: { type: Schema.Types.ObjectId, ref: 'Assessment', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fromSeatId: { type: Schema.Types.ObjectId, ref: 'Seat', required: true },
    toSeatId: { type: Schema.Types.ObjectId, ref: 'Seat', required: true },
    reason: { type: String, enum: SWAP_REASONS, required: true },
    swappedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

seatSwapSchema.index({ assessmentId: 1, studentId: 1, createdAt: -1 });

module.exports = models.SeatSwap || model('SeatSwap', seatSwapSchema);
