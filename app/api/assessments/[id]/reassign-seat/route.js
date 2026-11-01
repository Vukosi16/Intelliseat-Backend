import { NextResponse } from 'next/server';
import connectDB from '../../../../../lib/db';
import { Assessment, SeatAllocation, Seat, SeatSwap } from '../../../../../models';

const { requireAuth } = require('../../../../../lib/auth');

export async function POST(request, { params }) {
  try {
    await connectDB();
    const { userId, role } = requireAuth(request);
    if (role !== 'invigilator' && role !== 'admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    const { studentId } = await request.json();
    const { id } = await params;
    const assessment = await Assessment.findById(id).select('venueId cancelledAt');
    if (!assessment || assessment.cancelledAt) {
      return NextResponse.json({ message: 'Active assessment not found' }, { status: 404 });
    }
    const allocation = await SeatAllocation.findOne({ assessmentId: id, studentId, status: { $ne: 'expelled' } });
    if (!allocation) return NextResponse.json({ message: 'Active seat allocation not found' }, { status: 404 });
    const occupied = await SeatAllocation.find({ assessmentId: id, status: { $ne: 'expelled' } }).select('seatId');
    const occupiedIds = occupied.map((item) => item.seatId);
    const newSeat = await Seat.findOne({
      _id: { $nin: occupiedIds },
      venueId: assessment.venueId,
      condition: 'working',
      isActive: true,
    }).sort({ number: 1 });
    if (!newSeat) return NextResponse.json({ message: 'No working vacant seat is available' }, { status: 409 });
    const previousSeatId = allocation.seatId;
    allocation.seatId = newSeat._id;
    await allocation.save();
    await SeatSwap.create({ assessmentId: id, studentId, fromSeatId: previousSeatId, toSeatId: newSeat._id, reason: 'manual', swappedBy: userId });
    return NextResponse.json({ allocation, seat: newSeat });
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}
