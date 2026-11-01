const { Schema, model, models } = require('mongoose');
const { PC_STATUSES } = require('./constants');

// History of the "PC Verified" (greenlist) and "PC Faulty" (redlist) buttons.
// "faulty" also sets seats.condition to 'faulty'. "verified" sets it back to 'working'.
const pcStatusLogSchema = new Schema(
  {
    seatId: { type: Schema.Types.ObjectId, ref: 'Seat', required: true },
    assessmentId: { type: Schema.Types.ObjectId, ref: 'Assessment' },
    status: { type: String, enum: PC_STATUSES, required: true },
    markedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    note: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

pcStatusLogSchema.index({ seatId: 1, createdAt: -1 });

module.exports = models.PcStatusLog || model('PcStatusLog', pcStatusLogSchema);
