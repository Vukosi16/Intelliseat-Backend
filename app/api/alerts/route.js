import { NextResponse } from 'next/server';
import connectDB from '../../../lib/db';
import { Alert, AlertRead, User, AuditLog, SeatAllocation, ALERT_AUDIENCES } from '../../../models';

const { requireAuth } = require('../../../lib/auth');

export async function GET(request) {
  try {
    await connectDB();
    const { userId, role } = requireAuth(request);

    let conditions = [];

    if (role === 'student') {
      const user = await User.findById(userId).select('year');
      const allocations = await SeatAllocation.find({ studentId: userId }).distinct('assessmentId');
      conditions = [
        { audienceType: 'all_students' },
        { audienceType: 'assessment', assessmentId: { $in: allocations } },
        { audienceType: 'user', recipientId: userId },
      ];
      if (user && user.year) {
        conditions.push({ audienceType: 'year_students', year: user.year });
      }
    } else if (role === 'invigilator') {
      conditions = [
        { audienceType: 'all_invigilators' },
        { audienceType: 'assessment' },
        { audienceType: 'user', recipientId: userId },
      ];
    } else if (role === 'admin') {
      // Admins see admin alerts, user alerts, and system-wide visibility
      conditions = [
        { audienceType: 'all_admins' },
        { audienceType: 'assessment' },
        { audienceType: 'user', recipientId: userId },
        { audienceType: 'all_students' },
        { audienceType: 'all_invigilators' },
      ];
    } else {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const alerts = await Alert.find({ $or: conditions })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('senderId', 'firstName lastName role')
      .populate('assessmentId', 'name');

    const reads = await AlertRead.find({ userId, alertId: { $in: alerts.map((alert) => alert._id) } }).select('alertId');
    const readIds = new Set(reads.map((read) => String(read.alertId)));
    return NextResponse.json(alerts.map((alert) => ({ ...alert.toObject(), read: readIds.has(String(alert._id)) })));
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}

export async function POST(request) {
  try {
    await connectDB();
    const { userId, role } = requireAuth(request);

    if (role !== 'admin' && role !== 'invigilator') {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const {
      message,
      audienceType,
      audience,
      audienceYear,
      year,
      assessmentId,
      audienceUserId,
      recipientId,
    } = body || {};
    const resolvedAudienceType = audienceType || (audience === 'session_students' ? 'assessment' : audience);

    if (typeof message !== 'string' || !message.trim() || !ALERT_AUDIENCES.includes(resolvedAudienceType)) {
      return NextResponse.json(
        { message: 'A message and valid audienceType are required' },
        { status: 400 }
      );
    }
    if (resolvedAudienceType === 'assessment' && typeof assessmentId !== 'string') {
      return NextResponse.json({ message: 'assessmentId is required for assessment alerts' }, { status: 400 });
    }

    const alertData = {
      senderId: userId,
      kind: 'manual',
      audienceType: resolvedAudienceType,
      message: String(message).trim(),
    };

    const resolvedYear = audienceYear || year;
    if (resolvedYear) alertData.year = Number(resolvedYear);

    if (assessmentId) alertData.assessmentId = assessmentId;

    const resolvedRecipientId = audienceUserId || recipientId;
    if (resolvedRecipientId) alertData.recipientId = resolvedRecipientId;

    const alert = await Alert.create(alertData);

    await AuditLog.create({
      actorId: userId,
      action: 'alert_sent',
      entityType: 'Alert',
      entityId: alert._id,
      details: { audienceType: resolvedAudienceType, message: alert.message },
    });

    const populated = await Alert.findById(alert._id)
      .populate('senderId', 'firstName lastName role')
      .populate('assessmentId', 'name');

    return NextResponse.json(populated, { status: 201 });
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}
