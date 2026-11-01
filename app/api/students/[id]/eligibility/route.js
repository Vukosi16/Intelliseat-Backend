import { NextResponse } from 'next/server';
import connectDB from '../../../../../lib/db';
import { User, AuditLog } from '../../../../../models';

const { requireAuth } = require('../../../../../lib/auth');

export async function PATCH(request, { params }) {
  try {
    await connectDB();
    const { userId, role } = requireAuth(request);

    if (role !== 'admin') {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { eligibility, reason } = body || {};

    if (!eligibility) {
      return NextResponse.json({ message: 'eligibility is required' }, { status: 400 });
    }

    const user = await User.findById(id);
    if (!user || user.role !== 'student') {
      return NextResponse.json({ message: 'Student not found' }, { status: 404 });
    }

    const previousEligibility = user.eligibility;
    user.eligibility = eligibility;
    user.eligibilityReason = reason ? String(reason).trim() : undefined;
    user.eligibilityReviewedBy = userId;
    user.eligibilityReviewedAt = new Date();

    await user.save();

    await AuditLog.create({
      actorId: userId,
      action: 'eligibility_changed',
      entityType: 'User',
      entityId: user._id,
      details: {
        from: previousEligibility,
        to: eligibility,
        reason: reason || null,
      },
    });

    return NextResponse.json(user);
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}
