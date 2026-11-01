const { Schema, model, models } = require('mongoose');
const { VENUE_TYPES } = require('./constants');

// Capacity is not stored. It is worked out from the venue's active seats,
// so it can never be out of date.
const venueSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    type: { type: String, enum: VENUE_TYPES, default: 'lab' },
    building: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = models.Venue || model('Venue', venueSchema);
