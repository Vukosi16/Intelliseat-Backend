import { NextResponse } from 'next/server';
import connectDB from '../../../../../lib/db';
import { SeatAllocation, Expulsion } from '../../../../../models';

const { requireAuth } = require('../../../../../lib/auth');

export async function POST(request, { params }) {
  try {
    await connectDB();
    const { userId, role } = requireAuth(request);
    if (role !== 'invigilator' && role !== 'admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    const { studentId, reason } = await request.json();
    if (!studentId || !reason || !String(reason).trim()) return NextResponse.json({ message: 'studentId and reason are required' }, { status: 400 });
    const { id } = await params;
    const allocation = await SeatAllocation.findOne({ assessmentId: id, studentId, status: { $ne: 'expelled' } });
    if (!allocation) return NextResponse.json({ message: 'Active seat allocation not found' }, { status: 404 });
    await Expulsion.create({ assessmentId: id, studentId, seatId: allocation.seatId, expelledBy: userId, reason: String(reason).trim() });
    allocation.status = 'expelled';
    allocation.holdsSeat = false;
    allocation.expelledAt = new Date();
    await allocation.save();
    return NextResponse.json({ expelled: true, allocationId: allocation._id });
  } catch (err) {
    if (err.code === 11000) return NextResponse.json({ message: 'Student has already been expelled from this assessment' }, { status: 409 });
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}
