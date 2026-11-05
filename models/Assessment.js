const { Schema, model, models } = require('mongoose');
const { ASSESSMENT_TYPES } = require('./constants');

const assessmentSchema = new Schema(
  {
    moduleId: { type: Schema.Types.ObjectId, ref: 'Module', required: true },
    qualification: { type: String, trim: true },
    qualificationYear: { type: Number, min: 1, max: 4 },
    name: { type: String, required: true, trim: true }, // "Systems Design" or "Test 1"
    type: { type: String, enum: ASSESSMENT_TYPES },
    examPassword: { type: String, trim: true, select: false },

    // Real date-times. The admin form sends a date plus start and end times (Africa/Johannesburg)
    // and the server converts them (see lib/time.js).
    startsAt: { type: Date, required: true },
    endsAt: {
      type: Date,
      required: true,
      validate: {
        validator: function (value) {
          return !this.startsAt || value > this.startsAt;
        },
        message: 'The end time must be after the start time',
      },
    },

    venueId: { type: Schema.Types.ObjectId, ref: 'Venue', required: true },
    invigilatorIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    instructions: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },

    cancelledAt: { type: Date },
    cancelReason: { type: String, trim: true },

    // Set by the 03:00 seating job (and left empty until it has run)
    seatsAllocatedAt: { type: Date },
    // Filled if some students could not be seated, for example not enough working PCs
    seatingNote: { type: String, trim: true },
  },
  { timestamps: true }
);

// Status is not stored: it is worked out from the current time.
assessmentSchema.methods.getStatus = function (now = new Date()) {
  if (this.cancelledAt) return 'cancelled';
  if (now < this.startsAt) return 'upcoming';
  if (now < this.endsAt) return 'in_progress';
  return 'completed';
};
assessmentSchema.virtual('status').get(function () {
  return this.getStatus();
});

// Find a booking that overlaps the given time in a venue (used to stop double booking)
assessmentSchema.statics.findOverlapping = function (venueId, startsAt, endsAt, excludeId) {
  const filter = {
    venueId,
    cancelledAt: null,
    startsAt: { $lt: endsAt },
    endsAt: { $gt: startsAt },
  };
  if (excludeId) filter._id = { $ne: excludeId };
  return this.findOne(filter);
};

assessmentSchema.index({ venueId: 1, startsAt: 1, endsAt: 1 });
assessmentSchema.index({ startsAt: 1 });
assessmentSchema.index({ invigilatorIds: 1, startsAt: 1 });
assessmentSchema.index({ moduleId: 1 });

assessmentSchema.set('toJSON', { virtuals: true, versionKey: false });

module.exports = models.Assessment || model('Assessment', assessmentSchema);
