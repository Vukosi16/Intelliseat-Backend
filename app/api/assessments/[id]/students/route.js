import { NextResponse } from 'next/server';
import connectDB from '../../../../../lib/db';
import { Assessment, SeatAllocation, qualificationsMatch } from '../../../../../models';

const { requireAuth } = require('../../../../../lib/auth');

export async function GET(request, { params }) {
  try {
    await connectDB();
    const { role } = requireAuth(request);

    if (role !== 'invigilator' && role !== 'admin') {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const assessment = await Assessment.findById(id).select('qualification qualificationYear').lean();
    if (!assessment) return NextResponse.json({ message: 'Assessment not found' }, { status: 404 });

    const allocations = await SeatAllocation.find({ assessmentId: id })
      .populate('studentId', 'firstName lastName studentNumber eligibility clearanceStatus course year')
      .populate('seatId', 'label number condition')
      .populate('verifiedBy', 'firstName lastName')
      .sort({ createdAt: 1 })
      .lean();

    const currentAllocations = allocations.filter((allocation) => allocation.studentId
      && qualificationsMatch(allocation.studentId.course, assessment.qualification)
      && Number(allocation.studentId.year) === Number(assessment.qualificationYear));

    return NextResponse.json(currentAllocations);
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}
