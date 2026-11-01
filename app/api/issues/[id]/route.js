import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '../../../../lib/db';
import { Issue, AuditLog, Seat, ISSUE_STATUSES } from '../../../../models';

const { requireAuth } = require('../../../../lib/auth');

export async function PATCH(request, { params }) {
  try {
    await connectDB();
    const { userId, role } = requireAuth(request);

    if (role !== 'admin' && role !== 'invigilator') {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { status, seatId, confirmResolution } = body || {};

    if (!ISSUE_STATUSES.includes(status)) {
      return NextResponse.json(
        { message: `status must be one of: ${ISSUE_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }
    if (status === 'resolved' && confirmResolution !== true) {
      return NextResponse.json(
        { message: 'confirmResolution must be true to resolve an issue' },
        { status: 400 }
      );
    }

    const issue = await Issue.findById(id);
    if (!issue) {
      return NextResponse.json({ message: 'Issue not found' }, { status: 404 });
    }

    if (seatId !== undefined) {
      if (!mongoose.isValidObjectId(seatId)) {
        return NextResponse.json({ message: 'seatId must be a valid seat ID' }, { status: 400 });
      }
      const seat = await Seat.findById(seatId).select('venueId');
      if (!seat) {
        return NextResponse.json({ message: 'Seat not found' }, { status: 404 });
      }
      issue.seatId = seat._id;
      issue.venueId = seat.venueId;
    }

    const previousStatus = issue.status;
    issue.status = status;

    if (status === 'resolved') {
      issue.resolvedBy = userId;
      issue.resolvedAt = new Date();
    } else {
      issue.resolvedBy = undefined;
      issue.resolvedAt = undefined;
    }

    await issue.save();

    await AuditLog.create({
      actorId: userId,
      action: 'issue_status_changed',
      entityType: 'Issue',
      entityId: issue._id,
      details: { from: previousStatus, to: status, seatId: issue.seatId, venueId: issue.venueId },
    });

    const populated = await Issue.findById(issue._id)
      .populate('reporterId', 'firstName lastName email role')
      .populate('assessmentId', 'name')
      .populate('seatId', 'label number')
      .populate('venueId', 'name')
      .populate('resolvedBy', 'firstName lastName');

    return NextResponse.json(populated);
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}
