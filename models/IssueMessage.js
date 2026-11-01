const { Schema, model, models } = require('mongoose');

// The replies on an issue (admin to reporter and back).
const issueMessageSchema = new Schema(
  {
    issueId: { type: Schema.Types.ObjectId, ref: 'Issue', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 1000 },
    readAt: { type: Date }, // set when the other person opens it
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

issueMessageSchema.index({ issueId: 1, createdAt: 1 });

module.exports = models.IssueMessage || model('IssueMessage', issueMessageSchema);
