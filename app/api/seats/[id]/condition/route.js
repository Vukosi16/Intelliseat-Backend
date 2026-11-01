import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '../../../../../lib/db';
import { Assessment, Issue, Seat, SeatAllocation, SeatSwap, PcStatusLog, AuditLog } from '../../../../../models';

const { requireAuth } = require('../../../../../lib/auth');

export async function PATCH(request, { params }) {
  try {
    await connectDB();
    const { userId, role } = requireAuth(request);

    if (role !== 'admin' && role !== 'invigilator') {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { condition, faultyReason, assessmentId, issueId } = body || {};

    if (!condition || !['working', 'faulty'].includes(condition)) {
      return NextResponse.json(
        { message: "condition must be either 'working' or 'faulty'" },
        { status: 400 }
      );
    }

    const seat = await Seat.findById(id);
    if (!seat || !seat.isActive) {
      return NextResponse.json({ message: 'Seat not found' }, { status: 404 });
    }

    let assessment = null;
    if (assessmentId !== undefined) {
      if (!mongoose.isValidObjectId(assessmentId)) {
        return NextResponse.json({ message: 'assessmentId must be a valid assessment ID' }, { status: 400 });
      }
      assessment = await Assessment.findById(assessmentId).select('venueId');
      if (!assessment || String(assessment.venueId) !== String(seat.venueId)) {
        return NextResponse.json({ message: 'Assessment does not belong to this seat venue' }, { status: 400 });
      }
    }
    if (condition === 'faulty' && issueId !== undefined && !mongoose.isValidObjectId(issueId)) {
      return NextResponse.json({ message: 'issueId must be a valid issue ID' }, { status: 400 });
    }

    let faultyIssue = null;
    let studentsWithoutReplacement = 0;
    let issueWasNew = false;
    let previousIssueStatus = null;
    if (condition === 'faulty') {
      faultyIssue = issueId
        ? await Issue.findById(issueId)
        : await Issue.findOne({
          seatId: seat._id,
          ...(assessment ? { assessmentId: assessment._id } : {}),
          status: { $in: ['open', 'in_progress'] },
        }).sort({ createdAt: -1 });

      if (issueId && !faultyIssue) {
        return NextResponse.json({ message: 'Issue not found' }, { status: 404 });
      }
      if (faultyIssue && faultyIssue.seatId && String(faultyIssue.seatId) !== String(seat._id)) {
        return NextResponse.json({ message: 'Issue is already associated with a different seat' }, { status: 400 });
      }
      if (
        faultyIssue?.assessmentId
        && assessment
        && String(faultyIssue.assessmentId) !== String(assessment._id)
      ) {
        return NextResponse.json({ message: 'Issue belongs to a different assessment' }, { status: 400 });
      }
      if (!faultyIssue) {
        faultyIssue = new Issue({
          reporterId: userId,
          category: 'hardware',
          description: faultyReason ? String(faultyReason).trim() : 'Marked faulty by invigilator',
        });
      }
      issueWasNew = faultyIssue.isNew;
      previousIssueStatus = faultyIssue.status;
    }

    const previousCondition = seat.condition;
    seat.condition = condition;

    if (condition === 'faulty') {
      seat.faultyReason = faultyReason ? String(faultyReason).trim() : faultyIssue.description;
      seat.faultySince = new Date();
    } else {
      seat.faultyReason = undefined;
      seat.faultySince = undefined;
    }

    await seat.save();

    if (condition === 'faulty') {
      faultyIssue.seatId = seat._id;
      faultyIssue.venueId = seat.venueId;
      if (assessment) faultyIssue.assessmentId = assessment._id;
      if (faultyReason && String(faultyReason).trim()) {
        faultyIssue.description = String(faultyReason).trim();
      }
      if (faultyIssue.status === 'resolved') {
        faultyIssue.status = 'open';
        faultyIssue.resolvedBy = undefined;
        faultyIssue.resolvedAt = undefined;
      }
      await faultyIssue.save();

      const activeAssessments = await Assessment.find({
        venueId: seat.venueId,
        endsAt: { $gt: new Date() },
        cancelledAt: null,
      }).select('_id venueId');
      for (const activeAssessment of activeAssessments) {
        const affectedAllocations = await SeatAllocation.find({
          assessmentId: activeAssessment._id,
          seatId: seat._id,
          holdsSeat: true,
        });
        for (const allocation of affectedAllocations) {
          const occupiedSeats = await SeatAllocation.find({
            assessmentId: activeAssessment._id,
            holdsSeat: true,
            _id: { $ne: allocation._id },
          }).distinct('seatId');
          const replacementSeat = await Seat.findOne({
            venueId: seat.venueId,
            condition: 'working',
            isActive: true,
            _id: { $nin: occupiedSeats },
          }).sort({ number: 1 });
          if (!replacementSeat) {
            studentsWithoutReplacement += 1;
            continue;
          }

          allocation.seatId = replacementSeat._id;
          await allocation.save();
          await SeatSwap.create({
            assessmentId: activeAssessment._id,
            studentId: allocation.studentId,
            fromSeatId: seat._id,
            toSeatId: replacementSeat._id,
            reason: 'faulty_pc',
            swappedBy: userId,
          });
        }
      }

      await AuditLog.create({
        actorId: userId,
        action: issueWasNew ? 'issue_created' : 'issue_status_changed',
        entityType: 'Issue',
        entityId: faultyIssue._id,
        details: issueWasNew
          ? { category: faultyIssue.category, description: faultyIssue.description, seatId: seat._id }
          : { from: previousIssueStatus, to: faultyIssue.status, seatId: seat._id },
      });
    }

    const pcStatus = condition === 'faulty' ? 'faulty' : 'verified';
    await PcStatusLog.create({
      seatId: seat._id,
      status: pcStatus,
      markedBy: userId,
      note: faultyReason ? String(faultyReason).trim() : undefined,
    });

    await AuditLog.create({
      actorId: userId,
      action: 'pc_marked',
      entityType: 'Seat',
      entityId: seat._id,
      details: {
        from: previousCondition,
        to: condition,
        faultyReason: seat.faultyReason,
        issueId: faultyIssue?._id,
      },
    });

    return NextResponse.json({ ...seat.toObject(), issueId: faultyIssue?._id, studentsWithoutReplacement });
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}
