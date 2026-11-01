const { Schema, model, models } = require('mongoose');
const { ISSUE_CATEGORIES, ISSUE_STATUSES } = require('./constants');

// Support requests and reported problems are the same thing.
// Students, invigilators and the admin Support Queue all use this one collection.
const issueSchema = new Schema(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assessmentId: { type: Schema.Types.ObjectId, ref: 'Assessment' }, // optional
    venueId: { type: Schema.Types.ObjectId, ref: 'Venue' }, // "Lab 2" in "Lab 2 · PC 14"
    seatId: { type: Schema.Types.ObjectId, ref: 'Seat' }, // "PC 14"
    category: { type: String, enum: ISSUE_CATEGORIES, default: 'other' },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    status: { type: String, enum: ISSUE_STATUSES, default: 'open' },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' }, // the admin handling it
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

issueSchema.index({ status: 1, createdAt: -1 });
issueSchema.index({ reporterId: 1, createdAt: -1 });
issueSchema.index({ assessmentId: 1 });

module.exports = models.Issue || model('Issue', issueSchema);
