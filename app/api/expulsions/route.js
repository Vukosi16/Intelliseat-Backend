import { NextResponse } from 'next/server';
import connectDB from '../../../lib/db';
import { Expulsion, SeatAllocation, QrToken, AuditLog } from '../../../models';

const { requireAuth } = require('../../../lib/auth');

export async function POST(request) {
  try {
    await connectDB();
    const { userId, role } = requireAuth(request);

    if (role !== 'invigilator' && role !== 'admin') {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { studentId, assessmentId, reason } = body || {};

    if (!studentId || !assessmentId || !reason) {
      return NextResponse.json(
        { message: 'studentId, assessmentId, and reason are required' },
        { status: 400 }
      );
    }

    const allocation = await SeatAllocation.findOne({ assessmentId, studentId });
    if (!allocation) {
      return NextResponse.json(
        { message: 'Seat allocation not found for this student and assessment' },
        { status: 404 }
      );
    }

    const expulsion = await Expulsion.create({
      assessmentId,
      studentId,
      seatId: allocation.seatId,
      expelledBy: userId,
      reason: String(reason).trim(),
    });

    allocation.status = 'expelled';
    allocation.expelledAt = new Date();
    allocation.holdsSeat = false;
    await allocation.save();

    // Revoke any active QR tokens
    await QrToken.deleteMany({ studentId, assessmentId });

    await AuditLog.create({
      actorId: userId,
      action: 'student_expelled',
      entityType: 'Expulsion',
      entityId: expulsion._id,
      details: {
        assessmentId,
        studentId,
        seatId: allocation.seatId,
        reason,
      },
    });

    return NextResponse.json(expulsion, { status: 201 });
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}
