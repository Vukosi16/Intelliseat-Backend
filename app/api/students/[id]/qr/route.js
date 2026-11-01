import { NextResponse } from 'next/server';
import connectDB from '../../../../../lib/db';
import { Assessment, SeatAllocation, QrToken } from '../../../../../models';

const crypto = require('crypto');
const { requireAuth } = require('../../../../../lib/auth');

export async function GET(request, { params }) {
  try {
    await connectDB();
    const { userId, role } = requireAuth(request);
    const { id } = await params;

    if (role !== 'admin' && (role !== 'student' || userId !== id)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const assessmentId = searchParams.get('assessmentId');

    if (!assessmentId) {
      return NextResponse.json({ message: 'assessmentId is required' }, { status: 400 });
    }

    const assessment = await Assessment.findById(assessmentId);
    if (!assessment) {
      return NextResponse.json({ message: 'Assessment not found' }, { status: 404 });
    }

    const allocation = await SeatAllocation.findOne({
      assessmentId,
      studentId: id,
    });

    if (!allocation) {
      return NextResponse.json(
        { message: 'No seat allocation found for this assessment' },
        { status: 404 }
      );
    }

    if (allocation.status === 'expelled') {
      return NextResponse.json(
        { message: 'You have been expelled from this assessment.' },
        { status: 403 }
      );
    }

    const now = new Date();
    const opensAt = new Date(assessment.startsAt.getTime() - 60 * 60 * 1000); // 60 minutes before

    if (now < opensAt) {
      return NextResponse.json(
        { message: 'QR code is only available 60 minutes before the assessment starts.' },
        { status: 400 }
      );
    }

    if (now > assessment.endsAt) {
      return NextResponse.json({ message: 'Assessment has already ended.' }, { status: 400 });
    }

    // Delete any existing unused token for this student + assessment
    await QrToken.deleteMany({
      studentId: id,
      assessmentId,
      usedAt: null,
    });

    const rawToken = crypto.randomUUID();
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 120 * 1000); // 120 seconds

    await QrToken.create({
      studentId: id,
      assessmentId,
      tokenHash,
      expiresAt,
    });

    return NextResponse.json({
      token: rawToken,
      expiresAt,
    });
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}
