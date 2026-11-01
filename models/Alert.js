const { Schema, model, models } = require('mongoose');
const { ALERT_KINDS, ALERT_AUDIENCES, RULES } = require('./constants');

// One row per alert, however many people it reaches.
// A person sees an alert when its audience matches them:
//   all_students       every student
//   all_invigilators   every invigilator
//   all_admins         every admin
//   year_students      students in `year`
//   assessment         students seated in `assessmentId`
//   user               only `recipientId`
// There is no title. Read state is kept in alertReads.
const alertSchema = new Schema(
  {
    senderId: { type: Schema.Types.ObjectId, ref: 'User' }, // empty for system alerts
    kind: { type: String, enum: ALERT_KINDS, default: 'manual' },
    audienceType: { type: String, enum: ALERT_AUDIENCES, required: true },
    year: {
      type: Number,
      min: 1,
      max: 4,
      required: function () {
        return this.audienceType === 'year_students';
      },
    },
    assessmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Assessment',
      required: function () {
        return this.audienceType === 'assessment';
      },
    },
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: function () {
        return this.audienceType === 'user';
      },
    },
    message: { type: String, required: true, trim: true, maxlength: RULES.ALERT_MAX_LENGTH },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

alertSchema.index({ audienceType: 1, createdAt: -1 });
alertSchema.index({ recipientId: 1, createdAt: -1 });
alertSchema.index({ assessmentId: 1, createdAt: -1 });
alertSchema.index({ year: 1, createdAt: -1 });

module.exports = models.Alert || model('Alert', alertSchema);
