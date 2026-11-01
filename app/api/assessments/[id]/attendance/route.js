import { NextResponse } from 'next/server';
import connectDB from '../../../../../lib/db';
import { Assessment, SeatAllocation, Seat, User, qualificationsMatch } from '../../../../../models';

const { requireAuth } = require('../../../../../lib/auth');

const SEAT_REVEAL_LEAD_MS = 60 * 60 * 1000;

function attendanceResponse(allocation, assessment) {
  const seatAvailableAt = new Date(assessment.startsAt.getTime() - SEAT_REVEAL_LEAD_MS);
  const seatIsVisible = Date.now() >= seatAvailableAt.getTime()
    && allocation.seatId?.condition === 'working';
  return {
    confirmed: true,
    verified: Boolean(allocation.verifiedAt || allocation.status === 'verified'),
    verifiedAt: allocation.verifiedAt || null,
    verifiedBy: allocation.verifiedBy
      ? [allocation.verifiedBy.firstName, allocation.verifiedBy.lastName].filter(Boolean).join(' ')
      : null,
    allocationId: allocation._id,
    seat: seatIsVisible ? allocation.seatId : null,
    seatAvailableAt,
  };
}

export async function GET(request, { params }) {
  try {
    await connectDB();
    const { userId, role } = requireAuth(request);
    if (role !== 'student') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

    const { id } = await params;
    const assessment = await Assessment.findById(id);
    if (!assessment) return NextResponse.json({ message: 'Assessment not found' }, { status: 404 });

    const student = await User.findById(userId).select('course year isActive').lean();
    if (
      !student?.isActive
      || !qualificationsMatch(assessment.qualification, student.course)
      || assessment.qualificationYear !== student.year
    ) {
      return NextResponse.json({ message: 'This assessment is not assigned to your qualification and year' }, { status: 403 });
    }

    const allocation = await SeatAllocation.findOne({
      assessmentId: id,
      studentId: userId,
    })
      .populate('seatId', 'label number condition')
      .populate('verifiedBy', 'firstName lastName');

    if (!allocation) {
      return NextResponse.json({
        confirmed: false,
        seat: null,
        seatAvailableAt: new Date(assessment.startsAt.getTime() - SEAT_REVEAL_LEAD_MS),
      });
    }
    if (allocation.status === 'expelled') {
      return NextResponse.json({ message: 'You have been expelled from this assessment.' }, { status: 403 });
    }

    return NextResponse.json(attendanceResponse(allocation, assessment));
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}

export async function POST(request, { params }) {
  try {
    await connectDB();
    const { userId, role } = requireAuth(request);
    if (role !== 'student') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    const { id } = await params;
    const assessment = await Assessment.findById(id);
    if (!assessment) return NextResponse.json({ message: 'Assessment not found' }, { status: 404 });
    const student = await User.findById(userId).select('course year eligibility isActive').lean();
    if (!student || !student.isActive || student.eligibility !== 'eligible') {
      return NextResponse.json({ message: 'You are not eligible to attend this assessment' }, { status: 403 });
    }

    if (!qualificationsMatch(assessment.qualification, student.course) || assessment.qualificationYear !== student.year) {
      return NextResponse.json({ message: 'This assessment is not assigned to your qualification and year' }, { status: 403 });
    }

    const existing = await SeatAllocation.findOne({
      assessmentId: id,
      studentId: userId,
      status: { $ne: 'expelled' },
    })
      .populate('seatId', 'label number condition')
      .populate('verifiedBy', 'firstName lastName');
    if (existing) {
      return NextResponse.json(attendanceResponse(existing, assessment));
    }

    const seats = await Seat.find({
      venueId: assessment.venueId,
      isActive: true,
      condition: 'working',
    }).select('_id').lean();

    for (const seat of seats.sort(() => Math.random() - 0.5)) {
      try {
        const allocation = await SeatAllocation.create({
          assessmentId: id,
          studentId: userId,
          seatId: seat._id,
          status: 'pending',
        });
        const populated = await allocation.populate('seatId', 'label number condition');
        return NextResponse.json(attendanceResponse(populated, assessment));
      } catch (error) {
        if (error?.code !== 11000) throw error;
      }
    }

    return NextResponse.json({ message: 'No working seats are available for this assessment' }, { status: 409 });
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}
