import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '../../../lib/db';
import { Assessment, Issue, AuditLog, ISSUE_CATEGORIES, Seat, SeatAllocation, SeatSwap, Venue } from '../../../models';

const { requireAuth } = require('../../../lib/auth');

export async function GET(request) {
  try {
    await connectDB();
    const { userId, role } = requireAuth(request);
    const { searchParams } = new URL(request.url);
    const assessmentId = searchParams.get('assessmentId');

    let filter;
    if (role === 'admin') {
      filter = assessmentId ? { assessmentId } : {};
    } else if (role === 'invigilator') {
      if (!assessmentId || !mongoose.isValidObjectId(assessmentId)) {
        return NextResponse.json({ message: 'A valid assessmentId is required' }, { status: 400 });
      }
      const assessmentExists = await Assessment.exists({ _id: assessmentId });
      if (!assessmentExists) {
        return NextResponse.json({ message: 'Assessment not found' }, { status: 404 });
      }
      filter = {
        assessmentId,
        status: { $in: ['open', 'in_progress'] },
      };
    } else {
      filter = { reporterId: userId };
      if (assessmentId) filter.assessmentId = assessmentId;
    }

    const issues = await Issue.find(filter)
      .sort({ createdAt: -1 })
      .populate('reporterId', 'firstName lastName email role')
      .populate('assessmentId', 'name venueId')
      .populate({ path: 'seatId', select: 'label number venueId', populate: { path: 'venueId', select: 'name' } })
      .populate('venueId', 'name');

    await Promise.all(issues.map(async (issue) => {
      if (issue.seatId || !issue.assessmentId?._id) return;

      const studentId = issue.reporterId?._id;
      const priorSwap = studentId
        ? await SeatSwap.findOne({ assessmentId: issue.assessmentId._id, studentId })
          .sort({ createdAt: -1 })
          .populate({ path: 'fromSeatId', select: 'label number venueId', populate: { path: 'venueId', select: 'name' } })
        : null;
      const allocation = !priorSwap && studentId
        ? await SeatAllocation.findOne({ assessmentId: issue.assessmentId._id, studentId })
          .populate({ path: 'seatId', select: 'label number venueId', populate: { path: 'venueId', select: 'name' } })
        : null;
      const seat = priorSwap?.fromSeatId || allocation?.seatId;

      if (seat) {
        issue.seatId = seat;
        if (!issue.venueId) issue.venueId = seat.venueId;
      } else if (!issue.venueId && issue.assessmentId.venueId) {
        issue.venueId = await Venue.findById(issue.assessmentId.venueId).select('name');
      }
    }));

    return NextResponse.json(issues);
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}

export async function POST(request) {
  try {
    await connectDB();
    const { userId } = requireAuth(request);

    const body = await request.json();
    const { assessmentId, venueId, seatId, seat, category, description } = body || {};

    if (typeof description !== 'string' || !description.trim()) {
      return NextResponse.json({ message: 'description is required' }, { status: 400 });
    }

    const normalizedCategory = category === 'technical' ? 'other' : category || 'other';
    if (!ISSUE_CATEGORIES.includes(normalizedCategory)) {
      return NextResponse.json(
        { message: `category must be one of: ${ISSUE_CATEGORIES.join(', ')}` },
        { status: 400 }
      );
    }

    let resolvedSeat = seatId && mongoose.isValidObjectId(seatId)
      ? await Seat.findById(seatId).select('venueId')
      : null;
    let resolvedVenueId = resolvedSeat?.venueId || (venueId && mongoose.isValidObjectId(venueId) ? venueId : null);

    if (assessmentId && mongoose.isValidObjectId(assessmentId)) {
      const assessment = await Assessment.findById(assessmentId).select('venueId');
      if (!assessment) return NextResponse.json({ message: 'Assessment not found' }, { status: 404 });
      resolvedVenueId = resolvedVenueId || assessment.venueId;

      if (!resolvedSeat && typeof seat === 'string' && seat.trim()) {
        resolvedSeat = await Seat.findOne({ venueId: resolvedVenueId, label: seat.trim() }).select('venueId');
      }
      if (!resolvedSeat && !seat && !seatId) {
        const allocation = await SeatAllocation.findOne({
          assessmentId,
          studentId: userId,
          status: { $ne: 'expelled' },
        }).select('seatId').populate('seatId', 'venueId');
        resolvedSeat = allocation?.seatId || null;
      }
    }
    if (!resolvedSeat && resolvedVenueId && typeof seat === 'string' && seat.trim()) {
      resolvedSeat = await Seat.findOne({ venueId: resolvedVenueId, label: seat.trim() }).select('venueId');
    }

    const issue = await Issue.create({
      reporterId: userId,
      assessmentId: assessmentId || undefined,
      venueId: resolvedVenueId || undefined,
      seatId: resolvedSeat?._id || undefined,
      category: normalizedCategory,
      description: description.trim(),
    });

    await AuditLog.create({
      actorId: userId,
      action: 'issue_created',
      entityType: 'Issue',
      entityId: issue._id,
      details: { category: issue.category, description: issue.description },
    });

    const populated = await Issue.findById(issue._id)
      .populate('reporterId', 'firstName lastName email role')
      .populate('assessmentId', 'name')
      .populate({ path: 'seatId', select: 'label number venueId', populate: { path: 'venueId', select: 'name' } })
      .populate('venueId', 'name');

    return NextResponse.json(populated, { status: 201 });
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : err.name === 'ValidationError' || err.name === 'CastError' ? 400 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}
