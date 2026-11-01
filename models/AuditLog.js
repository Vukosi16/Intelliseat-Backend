const { Schema, model, models } = require('mongoose');
const { AUDIT_ACTIONS } = require('./constants');

// Who did what, and when. Also feeds the admin Overview "Recent activity" list.
const auditLogSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User' }, // empty for system actions (the 03:00 job)
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    entityType: { type: String, trim: true }, // 'User', 'Assessment', ...
    entityId: { type: Schema.Types.ObjectId },
    details: { type: Schema.Types.Mixed }, // old and new values, the reason, and so on
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });

const AuditLog = models.AuditLog || model('AuditLog', auditLogSchema);
const actionPath = AuditLog.schema.path('action');

actionPath.validators = actionPath.validators.filter((validator) => validator.type !== 'enum');
actionPath.enumValues = [];
actionPath.enum(...AUDIT_ACTIONS);

module.exports = AuditLog;
