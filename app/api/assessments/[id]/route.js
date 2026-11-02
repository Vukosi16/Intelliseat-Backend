import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import crypto from 'node:crypto';
import connectDB from '../../../../lib/db';
import {
  Assessment,
  AuditLog,
  Module,
  Seat,
  SeatAllocation,
  User,
  Venue,
  ASSESSMENT_TYPES,
  isValidQualificationYear,
  qualificationVariants,
  qualificationsMatch,
} from '../../../../models';

const { requireAuth } = require('../../../../lib/auth');
const { parseScheduleDate } = require('../../../../lib/time');

async function getPopulatedAssessment(id) {
  return Assessment.findById(id)
    .populate('moduleId', 'code name course year')
    .populate('venueId', 'name type building');
}

function isValidScheduleDate(value) {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

export async function GET(request, { params }) {
  try {
    await connectDB();
    const { userId, role } = requireAuth(request);

    const { id } = await params;
    const assessment = await Assessment.findById(id)
      .populate('moduleId', 'code name course year')
      .populate('venueId', 'name type building');

    if (!assessment) {
      return NextResponse.json({ message: 'Assessment not found' }, { status: 404 });
    }
    if (assessment.cancelledAt && role !== 'admin') {
      return NextResponse.json({ message: 'Assessment not found' }, { status: 404 });
    }

    if (role === 'student') {
      const student = await User.findById(userId).select('course year').lean();
      const isMatchingAssessment =
        qualificationsMatch(student?.course, assessment.qualification) &&
        Number(student?.year) === Number(assessment.qualificationYear);

      if (!isMatchingAssessment) {
        return NextResponse.json({ message: 'Assessment not found' }, { status: 404 });
      }
    } else if (role !== 'admin' && role !== 'invigilator') {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(assessment);
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}

export async function PATCH(request, { params }) {
  try {
    await connectDB();
    const { userId, role } = requireAuth(request, ['admin']);
    if (role !== 'admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ message: 'Assessment ID is invalid' }, { status: 400 });
    }

    const assessment = await Assessment.findById(id);
    if (!assessment) return NextResponse.json({ message: 'Assessment not found' }, { status: 404 });

    const body = await request.json();
    if (body?.restore === true) {
      if (!assessment.cancelledAt) {
        return NextResponse.json({ message: 'Assessment is already active' }, { status: 409 });
      }

      assessment.cancelledAt = null;
      assessment.cancelReason = null;
      assessment.invigilatorIds = [];
      await assessment.save();
      await AuditLog.create({
        actorId: userId,
        action: 'assessment_updated',
        entityType: 'Assessment',
        entityId: assessment._id,
        details: { restored: true },
      });
      return NextResponse.json(await getPopulatedAssessment(id));
    }

    const {
      moduleName,
      qualification,
      qualificationYear,
      name,
      type,
      startsAt,
      endsAt,
      venueId,
      instructions,
    } = body || {};
    if (
      typeof moduleName !== 'string'
      || !moduleName.trim()
      || moduleName.trim().length > 120
      || typeof qualification !== 'string'
      || !qualification.trim()
      || !isValidQualificationYear(qualification, Number(qualificationYear))
      || typeof name !== 'string'
      || !name.trim()
      || name.trim().length > 120
      || !ASSESSMENT_TYPES.includes(type)
      || !isValidScheduleDate(startsAt)
      || !isValidScheduleDate(endsAt)
      || typeof venueId !== 'string'
      || !mongoose.isValidObjectId(venueId)
      || (instructions !== undefined && typeof instructions !== 'string')
    ) {
      return NextResponse.json({ message: 'Complete all required assessment fields with valid values.' }, { status: 400 });
    }

    const startDate = parseScheduleDate(startsAt);
    const endDate = parseScheduleDate(endsAt);
    if (endDate <= startDate) {
      return NextResponse.json({ message: 'The end time must be after the start time' }, { status: 400 });
    }

    const resolvedQualification = qualification.trim();
    const resolvedYear = Number(qualificationYear);
    const [existingAllocations, selectedVenue, workingSeatCount, eligibleStudentCount] = await Promise.all([
      SeatAllocation.countDocuments({ assessmentId: id }),
      Venue.findOne({ _id: venueId, isActive: true }).select('_id').lean(),
      Seat.countDocuments({ venueId, isActive: true, condition: 'working' }),
      User.countDocuments({
        role: 'student',
        course: { $in: qualificationVariants(resolvedQualification) },
        year: resolvedYear,
        eligibility: 'eligible',
        isActive: true,
      }),
    ]);

    if (
      existingAllocations
      && (String(assessment.venueId) !== venueId
        || assessment.qualification !== resolvedQualification
        || Number(assessment.qualificationYear) !== resolvedYear)
    ) {
      return NextResponse.json({
        message: 'Venue or qualification cannot be changed after seats have been allocated.',
      }, { status: 409 });
    }
    if (!selectedVenue) return NextResponse.json({ message: 'Active venue not found' }, { status: 404 });
    if (!workingSeatCount) return NextResponse.json({ message: 'The selected venue has no working seats' }, { status: 409 });
    if (eligibleStudentCount > workingSeatCount) {
      return NextResponse.json({
        message: `The selected venue has ${workingSeatCount} working seat(s), but ${eligibleStudentCount} eligible student(s) are in this qualification and year.`,
      }, { status: 409 });
    }
    let selectedModule = await Module.findOne({
      course: resolvedQualification,
      year: resolvedYear,
      name: moduleName.trim(),
      isActive: true,
    });
    if (!selectedModule) {
      const generatedCode = `USR-${crypto
        .createHash('sha256')
        .update(`${resolvedQualification.toLowerCase()}|${resolvedYear}|${moduleName.trim().toLowerCase()}`)
        .digest('hex')
        .slice(0, 12)
        .toUpperCase()}`;
      selectedModule = await Module.findOneAndUpdate(
        { code: generatedCode },
        {
          $setOnInsert: {
            code: generatedCode,
            name: moduleName.trim(),
            course: resolvedQualification,
            year: resolvedYear,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    assessment.moduleId = selectedModule._id;
    assessment.qualification = resolvedQualification;
    assessment.qualificationYear = resolvedYear;
    assessment.name = name.trim();
    assessment.type = type;
    assessment.startsAt = startDate;
    assessment.endsAt = endDate;
    assessment.venueId = venueId;
    assessment.invigilatorIds = [];
    assessment.instructions = instructions?.trim() || undefined;
    await assessment.save();

    await AuditLog.create({
      actorId: userId,
      action: 'assessment_updated',
      entityType: 'Assessment',
      entityId: assessment._id,
      details: { name: assessment.name, venueId, startsAt: startDate, endsAt: endDate },
    });
    return NextResponse.json(await getPopulatedAssessment(id));
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : err.message === 'Forbidden' ? 403 : err.code === 11000 ? 409 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}

export async function DELETE(request, { params }) {
  try {
    await connectDB();
    const { userId, role } = requireAuth(request, ['admin']);
    if (role !== 'admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ message: 'Assessment ID is invalid' }, { status: 400 });
    }

    const assessment = await Assessment.findById(id);
    if (!assessment) return NextResponse.json({ message: 'Assessment not found' }, { status: 404 });
    const allocationCount = await SeatAllocation.countDocuments({ assessmentId: id });
    if (allocationCount) {
      return NextResponse.json({
        message: 'This assessment has attendance or seat history and cannot be permanently deleted. Cancel it to remove it from schedules while keeping the history.',
      }, { status: 409 });
    }

    await Assessment.deleteOne({ _id: id });
    await AuditLog.create({
      actorId: userId,
      action: 'assessment_deleted',
      entityType: 'Assessment',
      entityId: assessment._id,
      details: { name: assessment.name, venueId: assessment.venueId },
    });

    return NextResponse.json({ deleted: true, id });
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : err.message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}
