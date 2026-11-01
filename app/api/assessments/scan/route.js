import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/db';
import { QrToken, SeatAllocation, AuditLog } from '../../../../models';

const crypto = require('crypto');
const { requireAuth } = require('../../../../lib/auth');

export async function POST(request) {
  try {
    await connectDB();
    const { userId, role } = requireAuth(request);

    if (role !== 'invigilator' && role !== 'admin') {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { assessmentId, qrToken } = body || {};

    if (!assessmentId || !qrToken) {
      return NextResponse.json(
        { message: 'assessmentId and qrToken are required' },
        { status: 400 }
      );
    }

    const tokenHash = crypto.createHash('sha256').update(String(qrToken)).digest('hex');
    const now = new Date();

    // Match either hashed token or raw token if stored directly in tokenHash
    const tokenDoc = await QrToken.findOne({
      assessmentId,
      usedAt: null,
      expiresAt: { $gt: now },
      $or: [{ tokenHash }, { tokenHash: String(qrToken) }],
    });

    if (!tokenDoc) {
      await AuditLog.create({
        actorId: userId,
        action: 'scan_failed',
        entityType: 'Assessment',
        entityId: assessmentId,
        details: { tokenHash: tokenHash.slice(0, 16), reason: 'Invalid or expired token' },
      });
      return NextResponse.json(
        { message: 'QR code is invalid or has expired.' },
        { status: 400 }
      );
    }

    // Mark token as used
    tokenDoc.usedAt = now;
    tokenDoc.usedBy = userId;
    await tokenDoc.save();

    // Find student's seat allocation
    const allocation = await SeatAllocation.findOne({
      assessmentId,
      studentId: tokenDoc.studentId,
    })
      .populate('studentId', 'firstName lastName studentNumber eligibility clearanceStatus')
      .populate('seatId', 'label number condition');

    if (!allocation) {
      return NextResponse.json(
        { message: 'Seat allocation not found for this student.' },
        { status: 404 }
      );
    }

    if (allocation.status === 'expelled') {
      return NextResponse.json(
        { message: 'Student is expelled from this assessment.' },
        { status: 403 }
      );
    }

    // Update allocation to verified
    allocation.status = 'verified';
    allocation.verifiedAt = now;
    allocation.verifiedBy = userId;
    await allocation.save();

    await AuditLog.create({
      actorId: userId,
      action: 'student_verified',
      entityType: 'SeatAllocation',
      entityId: allocation._id,
      details: {
        assessmentId,
        studentId: tokenDoc.studentId,
        seatId: allocation.seatId?._id,
      },
    });

    return NextResponse.json({
      student: allocation.studentId,
      seat: {
        _id: allocation.seatId?._id,
        label: allocation.seatId?.label,
        number: allocation.seatId?.number,
      },
      allocation: {
        _id: allocation._id,
        status: allocation.status,
        verifiedAt: allocation.verifiedAt,
      },
    });
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}
