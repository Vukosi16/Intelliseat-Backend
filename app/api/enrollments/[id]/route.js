import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/db';
import { Enrollment, AuditLog } from '../../../../models';

const { requireAuth } = require('../../../../lib/auth');

export async function PATCH(request, { params }) {
  try {
    await connectDB();
    const { userId, role } = requireAuth(request);
    if (role !== 'admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    const { status } = await request.json();
    if (!['enrolled', 'withdrawn'].includes(status)) {
      return NextResponse.json({ message: "status must be 'enrolled' or 'withdrawn'" }, { status: 400 });
    }
    const { id } = await params;
    const enrollment = await Enrollment.findByIdAndUpdate(id, { status }, { new: true })
      .populate('studentId', 'firstName lastName email studentNumber eligibility')
      .populate('moduleId', 'code name');
    if (!enrollment) return NextResponse.json({ message: 'Enrollment not found' }, { status: 404 });
    await AuditLog.create({ actorId: userId, action: 'enrollment_created', entityType: 'Enrollment', entityId: enrollment._id, details: { status } });
    return NextResponse.json(enrollment);
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}
