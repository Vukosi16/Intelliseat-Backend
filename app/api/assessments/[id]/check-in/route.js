import { NextResponse } from 'next/server';
import connectDB from '../../../../../lib/db';
import { SeatAllocation } from '../../../../../models';

const { requireAuth } = require('../../../../../lib/auth');

export async function POST(request, { params }) {
  try {
    await connectDB();
    const { userId, role } = requireAuth(request);
    if (role !== 'invigilator' && role !== 'admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    const { studentId } = await request.json();
    if (!studentId) return NextResponse.json({ message: 'studentId is required' }, { status: 400 });
    const { id } = await params;
    const allocation = await SeatAllocation.findOneAndUpdate(
      { assessmentId: id, studentId, status: { $ne: 'expelled' } },
      { $set: { status: 'verified', verifiedAt: new Date(), verifiedBy: userId } },
      { new: true }
    );
    if (!allocation) return NextResponse.json({ message: 'Active seat allocation not found' }, { status: 404 });
    return NextResponse.json(allocation);
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}
