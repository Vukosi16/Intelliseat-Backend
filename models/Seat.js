const { Schema, model, models } = require('mongoose');
const { SEAT_CONDITIONS } = require('./constants');

// A seat is a PC in a lab or a desk in a hall.
// It only stores the permanent condition (working or faulty).
// Verified, pending and vacant are per assessment and come from seatAllocations.
const seatSchema = new Schema(
  {
    venueId: { type: Schema.Types.ObjectId, ref: 'Venue', required: true },
    label: { type: String, required: true, trim: true }, // "PC 14" or "Desk 7"
    number: { type: Number, required: true }, // for sorting: PC 2 before PC 14
    condition: { type: String, enum: SEAT_CONDITIONS, default: 'working' },
    faultyReason: { type: String, trim: true },
    faultySince: { type: Date },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

seatSchema.index({ venueId: 1, label: 1 }, { unique: true });
seatSchema.index({ venueId: 1, number: 1 });

module.exports = models.Seat || model('Seat', seatSchema);
