import { NextResponse } from 'next/server';
import connectDB from '../../../../../lib/db';
import { Absence, Assessment, SeatAllocation } from '../../../../../models';

const { requireAuth } = require('../../../../../lib/auth');

export async function POST(request, { params }) {
  try {
    await connectDB();
    const { userId, role } = requireAuth(request);
    if (role !== 'student') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    const { id } = await params;
    const { reason, details } = await request.json();
    if (!reason || !String(reason).trim()) return NextResponse.json({ message: 'reason is required' }, { status: 400 });
    const [assessment, allocation] = await Promise.all([
      Assessment.findById(id).select('_id'),
      SeatAllocation.findOne({ assessmentId: id, studentId: userId }).select('_id'),
    ]);
    if (!assessment) return NextResponse.json({ message: 'Assessment not found' }, { status: 404 });
    if (!allocation) return NextResponse.json({ message: 'No seat allocation found for this assessment' }, { status: 404 });
    const absence = await Absence.findOneAndUpdate(
      { assessmentId: id, studentId: userId },
      { reason: String(reason).trim(), details: details ? String(details).trim() : undefined },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return NextResponse.json(absence, { status: 201 });
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}

export async function GET(request, { params }) {
  try {
    await connectDB();
    const { role } = requireAuth(request);
    if (role !== 'admin' && role !== 'invigilator') {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const assessment = await Assessment.findById(id).select('_id');
    if (!assessment) return NextResponse.json({ message: 'Assessment not found' }, { status: 404 });

    const absences = await Absence.find({ assessmentId: id })
      .populate('studentId', 'firstName lastName studentNumber')
      .sort({ createdAt: -1 });

    return NextResponse.json(absences);
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}
