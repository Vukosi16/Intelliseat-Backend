import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '../../../../lib/db';
import {
  User,
  AuditLog,
  AuthCode,
  Enrollment,
  Absence,
  SeatAllocation,
  QrToken,
  SeatSwap,
  Expulsion,
  Issue,
  IssueMessage,
  Alert,
  AlertRead,
  Assessment,
  PcStatusLog,
  COURSES,
  CLEARANCE_STATUSES,
  ELIGIBILITY,
  isValidQualificationYear,
  qualificationsMatch,
} from '../../../../models';

const { requireAuth } = require('../../../../lib/auth');
const { normalizeEmail, isStudentNumber, isStaffNumber } = require('../../../../lib/validate');

async function requireActiveAdmin(userId) {
  const admin = await User.findById(userId).select('role accountStatus isActive').lean();
  if (!admin || admin.role !== 'admin' || admin.accountStatus !== 'active' || !admin.isActive) {
    throw new Error('Forbidden');
  }
}

function errorResponse(error) {
  const status = error.message === 'Unauthorized' ? 401
    : error.message === 'Forbidden' ? 403
      : error.code === 11000 ? 409
        : 500;
  return NextResponse.json({ message: error.message }, { status });
}

export async function PATCH(request, { params }) {
  try {
    await connectDB();
    const { userId } = requireAuth(request, ['admin']);
    await requireActiveAdmin(userId);
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ message: 'Invalid user ID' }, { status: 400 });
    }

    const user = await User.findById(id);
    if (!user) return NextResponse.json({ message: 'User not found' }, { status: 404 });
    if (user.role === 'admin') {
      return NextResponse.json({ message: 'Admin accounts cannot be edited here' }, { status: 403 });
    }

    const body = await request.json();
    if (body.accountStatus !== undefined || body.isActive !== undefined) {
      if (body.accountStatus !== 'active' || body.isActive !== true || user.accountStatus !== 'disabled') {
        return NextResponse.json({ message: 'Only disabled accounts can be reactivated' }, { status: 400 });
      }
      user.accountStatus = 'active';
      user.isActive = true;
      await user.save();
      await AuditLog.create({
        actorId: userId,
        action: 'user_updated',
        entityType: 'User',
        entityId: user._id,
        details: { action: 'user_reactivated' },
      });
      return NextResponse.json(user);
    }

    const updates = {};
    if (body.firstName !== undefined) {
      if (typeof body.firstName !== 'string' || !body.firstName.trim()) {
        return NextResponse.json({ message: 'First name is required' }, { status: 400 });
      }
      updates.firstName = body.firstName.trim();
    }
    if (body.lastName !== undefined) {
      if (typeof body.lastName !== 'string' || !body.lastName.trim()) {
        return NextResponse.json({ message: 'Last name is required' }, { status: 400 });
      }
      updates.lastName = body.lastName.trim();
    }
    if (body.email !== undefined) {
      const email = normalizeEmail(body.email);
      if (!email || (user.role === 'student' && !email.endsWith('@my.richfield.ac.za'))) {
        return NextResponse.json({ message: 'Use an institutional @my.richfield.ac.za email address' }, { status: 400 });
      }
      updates.email = email;
    }

    if (user.role === 'student') {
      if (body.studentNumber !== undefined && !isStudentNumber(body.studentNumber)) {
        return NextResponse.json({ message: 'Student number must contain exactly 9 digits' }, { status: 400 });
      }
      if (body.course !== undefined && (typeof body.course !== 'string' || !COURSES.includes(body.course))) {
        return NextResponse.json({ message: 'Course is invalid' }, { status: 400 });
      }
      const nextCourse = body.course !== undefined ? body.course : user.course;
      const nextYear = body.year !== undefined ? body.year : user.year;
      if ((body.course !== undefined || body.year !== undefined) && !isValidQualificationYear(nextCourse, nextYear)) {
        return NextResponse.json({ message: 'Year is not valid for the selected qualification' }, { status: 400 });
      }
      if (body.studentNumber !== undefined) updates.studentNumber = body.studentNumber;
      if (body.course !== undefined) updates.course = body.course;
      if (body.year !== undefined) updates.year = Number(body.year);
      if (body.clearanceStatus !== undefined) {
        if (typeof body.clearanceStatus !== 'string' || !CLEARANCE_STATUSES.includes(body.clearanceStatus)) {
          return NextResponse.json({ message: 'Clearance status is invalid' }, { status: 400 });
        }
        updates.clearanceStatus = body.clearanceStatus;
      }
      if (body.eligibility !== undefined) {
        if (typeof body.eligibility !== 'string' || !ELIGIBILITY.includes(body.eligibility)) {
          return NextResponse.json({ message: 'Eligibility status is invalid' }, { status: 400 });
        }
        updates.eligibility = body.eligibility;
        updates.eligibilityReason = body.eligibilityReason ? String(body.eligibilityReason).trim() : undefined;
        updates.eligibilityReviewedBy = userId;
        updates.eligibilityReviewedAt = new Date();
      }

      if (body.course !== undefined || body.year !== undefined) {
        const futureAllocations = await SeatAllocation.find({ studentId: user._id })
          .select('_id assessmentId')
          .populate('assessmentId', 'qualification qualificationYear startsAt')
          .lean();
        const staleAllocationIds = futureAllocations
          .filter((allocation) => allocation.assessmentId
            && allocation.assessmentId.startsAt >= new Date()
            && (!qualificationsMatch(nextCourse, allocation.assessmentId.qualification)
              || Number(nextYear) !== Number(allocation.assessmentId.qualificationYear)))
          .map((allocation) => allocation._id);
        if (staleAllocationIds.length) {
          await SeatAllocation.deleteMany({ _id: { $in: staleAllocationIds } });
        }
      }
    } else {
      if (body.staffNumber !== undefined && !isStaffNumber(body.staffNumber)) {
        return NextResponse.json({ message: 'Staff number must start with INV- followed by digits' }, { status: 400 });
      }
      for (const field of ['department', 'phone']) {
        if (body[field] !== undefined && (typeof body[field] !== 'string' || !body[field].trim())) {
          return NextResponse.json({ message: `${field} is required` }, { status: 400 });
        }
      }
      if (body.staffNumber !== undefined) updates.staffNumber = body.staffNumber.trim().toUpperCase();
      if (body.department !== undefined) updates.department = body.department.trim();
      if (body.phone !== undefined) updates.phone = body.phone.trim();
    }

    Object.assign(user, updates);
    await user.save();
    await AuditLog.create({
      actorId: userId,
      action: 'user_updated',
      entityType: 'User',
      entityId: user._id,
      details: { fields: Object.keys(updates) },
    });
    return NextResponse.json(user);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    await connectDB();
    const { userId } = requireAuth(request, ['admin']);
    await requireActiveAdmin(userId);
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ message: 'Invalid user ID' }, { status: 400 });
    }
    const user = await User.findById(id);
    if (!user) return NextResponse.json({ message: 'User not found' }, { status: 404 });
    if (user.role === 'admin') {
      return NextResponse.json({ message: 'Admin accounts cannot be deleted here' }, { status: 403 });
    }

    const mode = request.nextUrl.searchParams.get('mode') || 'inactive';
    if (mode === 'inactive') {
      user.isActive = false;
      user.accountStatus = 'disabled';
      await user.save();
      await AuditLog.create({
        actorId: userId,
        action: 'user_updated',
        entityType: 'User',
        entityId: user._id,
        details: { action: 'user_deactivated' },
      });
      return NextResponse.json({ message: 'User deactivated', user, mode });
    }

    if (mode !== 'hard') {
      return NextResponse.json({ message: 'mode must be "inactive" or "hard"' }, { status: 400 });
    }
    if (String(userId) === String(id)) {
      return NextResponse.json({ message: 'You cannot delete your own account' }, { status: 400 });
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const reportedIssues = await Issue.find({ reporterId: user._id }).select('_id').session(session).lean();
        const reportedIssueIds = reportedIssues.map((issue) => issue._id);
        const targetAlerts = await Alert.find({
          audienceType: 'user',
          recipientId: user._id,
        }).select('_id').session(session).lean();
        const targetAlertIds = targetAlerts.map((alert) => alert._id);

        await AuthCode.deleteMany({ userId: user._id }, { session });
        await Enrollment.deleteMany({ studentId: user._id }, { session });
        await Absence.deleteMany({ studentId: user._id }, { session });
        await SeatAllocation.deleteMany({ studentId: user._id }, { session });
        await QrToken.deleteMany({ studentId: user._id }, { session });
        await QrToken.updateMany({ usedBy: user._id }, { $unset: { usedBy: 1 } }, { session });
        await SeatSwap.deleteMany({ $or: [{ studentId: user._id }, { swappedBy: user._id }] }, { session });
        await Expulsion.deleteMany({ $or: [{ studentId: user._id }, { expelledBy: user._id }] }, { session });
        await IssueMessage.deleteMany({
          $or: [
            { senderId: user._id },
            ...(reportedIssueIds.length ? [{ issueId: { $in: reportedIssueIds } }] : []),
          ],
        }, { session });
        await Issue.deleteMany({ reporterId: user._id }, { session });
        await Issue.updateMany(
          { $or: [{ assignedTo: user._id }, { resolvedBy: user._id }] },
          { $unset: { assignedTo: 1, resolvedBy: 1 } },
          { session }
        );
        await AlertRead.deleteMany({
          $or: [
            { userId: user._id },
            ...(targetAlertIds.length ? [{ alertId: { $in: targetAlertIds } }] : []),
          ],
        }, { session });
        await Alert.deleteMany({ audienceType: 'user', recipientId: user._id }, { session });
        await Alert.updateMany({ senderId: user._id }, { $unset: { senderId: 1 } }, { session });
        await Assessment.updateMany(
          { $or: [{ invigilatorIds: user._id }, { createdBy: user._id }] },
          { $pull: { invigilatorIds: user._id }, $unset: { createdBy: user._id } },
          { session }
        );
        await User.updateMany(
          { eligibilityReviewedBy: user._id },
          { $unset: { eligibilityReviewedBy: 1 } },
          { session }
        );
        await SeatAllocation.updateMany(
          { verifiedBy: user._id },
          { $unset: { verifiedBy: 1 } },
          { session }
        );
        await PcStatusLog.deleteMany({ markedBy: user._id }, { session });
        await AuditLog.deleteMany(
          { $or: [{ actorId: user._id }, { entityId: user._id }] },
          { session }
        );
        await AuditLog.create([{
          actorId: userId,
          action: 'user_updated',
          entityType: 'User',
          details: { action: 'user_hard_deleted', deletedRole: user.role },
        }], { session });
        await User.deleteOne({ _id: user._id }, { session });
      });
    } finally {
      await session.endSession();
    }

    return NextResponse.json({ message: 'User and linked data permanently deleted', mode });
  } catch (error) {
    return errorResponse(error);
  }
}
