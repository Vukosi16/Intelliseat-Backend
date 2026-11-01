import { NextResponse } from 'next/server';
import connectDB from '../../../../../lib/db';
import { SeatAllocation } from '../../../../../models';

const { requireAuth } = require('../../../../../lib/auth');

export async function GET(request, { params }) {
  try {
    await connectDB();
    const { role } = requireAuth(request);

    if (role !== 'invigilator' && role !== 'admin') {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    const allocations = await SeatAllocation.find({ assessmentId: id })
      .populate('studentId', 'firstName lastName studentNumber eligibility clearanceStatus')
      .populate('seatId', 'label number condition')
      .populate('verifiedBy', 'firstName lastName')
      .sort({ createdAt: 1 });

    return NextResponse.json(allocations);
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}
