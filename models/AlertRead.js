const { Schema, model, models } = require('mongoose');

// A row here means "this person has read this alert".
// Unread = alerts for them that have no row.
const alertReadSchema = new Schema({
  alertId: { type: Schema.Types.ObjectId, ref: 'Alert', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  readAt: { type: Date, default: Date.now },
});

alertReadSchema.index({ alertId: 1, userId: 1 }, { unique: true });
alertReadSchema.index({ userId: 1 });

module.exports = models.AlertRead || model('AlertRead', alertReadSchema);
