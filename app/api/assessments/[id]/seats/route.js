import { NextResponse } from 'next/server';
import connectDB from '../../../../../lib/db';
import { Assessment, Seat, SeatAllocation, qualificationsMatch } from '../../../../../models';
import ensureLabSeats from '../../../../../lib/ensureLabSeats';

const { requireAuth } = require('../../../../../lib/auth');

export async function GET(request, { params }) {
  try {
    await connectDB();
    const { role } = requireAuth(request);
    if (role !== 'invigilator' && role !== 'admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    const { id } = await params;
    const assessment = await Assessment.findById(id).select('venueId qualification qualificationYear');
    if (!assessment) return NextResponse.json({ message: 'Assessment not found' }, { status: 404 });
    await ensureLabSeats(assessment.venueId);

    const [seats, allocations] = await Promise.all([
      Seat.find({ venueId: assessment.venueId, isActive: true }).sort({ number: 1 }).lean(),
      SeatAllocation.find({ assessmentId: id, status: { $ne: 'expelled' } })
      .populate('studentId', 'firstName lastName studentNumber eligibility course year')
      .populate('seatId', 'label number condition')
      .sort({ 'seatId.number': 1 })
      .lean(),
    ]);
    const currentAllocations = allocations.filter((allocation) => allocation.studentId
      && qualificationsMatch(allocation.studentId.course, assessment.qualification)
      && Number(allocation.studentId.year) === Number(assessment.qualificationYear));
    const allocationBySeat = new Map(currentAllocations.map((allocation) => [
      String(allocation.seatId?._id),
      allocation,
    ]));
    const seatMap = seats.map((seat) => {
      const allocation = allocationBySeat.get(String(seat._id));
      const student = allocation?.studentId || null;
      return {
        ...seat,
        status: seat.condition === 'faulty'
          ? 'faulty'
          : allocation?.verifiedAt || allocation?.status === 'verified'
            ? 'verified'
            : allocation
              ? 'pending'
              : 'vacant',
        student,
        studentName: student
          ? [student.firstName, student.lastName].filter(Boolean).join(' ')
          : '',
        studentId: student?._id || null,
        allocationId: allocation?._id || null,
      };
    });
    return NextResponse.json(seatMap);
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}
