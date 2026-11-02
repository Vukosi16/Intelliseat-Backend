import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import crypto from 'node:crypto';
import connectDB from '../../../lib/db';
import {
  Assessment,
  AuditLog,
  Module,
  Venue,
  Seat,
  User,
  ASSESSMENT_TYPES,
  isValidQualificationYear,
  qualificationVariants,
} from '../../../models';

const { requireAuth } = require('../../../lib/auth');

export async function GET(request) {
  try {
    await connectDB();
    const { userId, role } = requireAuth(request);

    let filter = {};

    if (role === 'student') {
      const student = await User.findById(userId).select('course year').lean();
      if (!student?.course || !Number.isInteger(student.year)) {
        return NextResponse.json([]);
      }

      filter = {
        cancelledAt: null,
        qualification: { $in: qualificationVariants(student.course) },
        qualificationYear: student.year,
      };
    } else if (role === 'invigilator') {
      filter = { cancelledAt: null };
    } else if (role === 'admin') {
      filter = {};
    } else {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const assessments = await Assessment.find(filter)
      .sort({ startsAt: 1 })
      .populate('moduleId', 'code name')
      .populate('venueId', 'name');

    return NextResponse.json(assessments);
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : err.code === 11000 ? 409 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}

export async function POST(request) {
  try {
    await connectDB();
    const { userId, role } = requireAuth(request);

    if (role !== 'admin') {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const {
      moduleId,
      moduleCode,
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
      typeof name !== 'string'
      || !name.trim()
      || !ASSESSMENT_TYPES.includes(type)
      || typeof startsAt !== 'string'
      || typeof endsAt !== 'string'
      || typeof venueId !== 'string'
      || (moduleId !== undefined && typeof moduleId !== 'string')
      || (moduleCode !== undefined && typeof moduleCode !== 'string')
      || (moduleName !== undefined && typeof moduleName !== 'string')
      || (qualification !== undefined && typeof qualification !== 'string')
      || (instructions !== undefined && typeof instructions !== 'string')
    ) {
      return NextResponse.json(
        { message: 'A module name, name, startsAt, endsAt, and venueId are required' },
        { status: 400 }
      );
    }

    const requestedModuleName = (moduleName || name).trim();
    if (!requestedModuleName || requestedModuleName.length > 120 || name.trim().length > 120) {
      return NextResponse.json({ message: 'Module and assessment names must be 120 characters or fewer' }, { status: 400 });
    }
    if (!mongoose.isValidObjectId(venueId)) {
      return NextResponse.json({ message: 'Venue ID is invalid' }, { status: 400 });
    }

    const shouldCreateModule = !moduleId && !moduleCode;
    let selectedModule = null;
    if (moduleId) {
      if (!mongoose.isValidObjectId(moduleId)) {
        return NextResponse.json({ message: 'Module ID is invalid' }, { status: 400 });
      }
      selectedModule = await Module.findOne({ _id: moduleId, isActive: true });
    } else if (moduleCode) {
      selectedModule = await Module.findOne({
        code: moduleCode.trim().toUpperCase(),
        isActive: true,
      });
    }

    if (!selectedModule && !shouldCreateModule) {
      return NextResponse.json({ message: 'Active module not found' }, { status: 404 });
    }

    const resolvedQualification = typeof qualification === 'string' && qualification.trim()
      ? qualification.trim()
      : selectedModule?.course || '';
    const resolvedQualificationYear = qualificationYear !== undefined
      ? Number(qualificationYear)
      : selectedModule?.year;
    if (!isValidQualificationYear(resolvedQualification, resolvedQualificationYear)) {
      return NextResponse.json({ message: 'A valid qualification and year are required' }, { status: 400 });
    }

    if (shouldCreateModule) {
      selectedModule = await Module.findOne({
        course: resolvedQualification,
        year: resolvedQualificationYear,
        name: requestedModuleName,
        isActive: true,
      });
    }
    const startDate = new Date(startsAt);
    const endDate = new Date(endsAt);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json({ message: 'Invalid startsAt or endsAt date format' }, { status: 400 });
    }

    if (endDate <= startDate) {
      return NextResponse.json({ message: 'The end time must be after the start time' }, { status: 400 });
    }

    const [moduleDetails, selectedVenue, workingSeatCount] = await Promise.all([
      selectedModule
        ? Module.findOne({ _id: selectedModule._id, isActive: true }).select('_id course year').lean()
        : Promise.resolve(null),
      Venue.findOne({ _id: venueId, isActive: true }).select('_id').lean(),
      Seat.countDocuments({ venueId, isActive: true, condition: 'working' }),
    ]);

    if (selectedModule && !moduleDetails) {
      return NextResponse.json({ message: 'Active module not found' }, { status: 404 });
    }
    if (moduleDetails && (resolvedQualification !== moduleDetails.course || resolvedQualificationYear !== moduleDetails.year)) {
      return NextResponse.json(
        { message: 'The selected module does not belong to the selected qualification and year' },
        { status: 400 }
      );
    }
    if (!selectedVenue) {
      return NextResponse.json({ message: 'Active venue not found' }, { status: 404 });
    }
    if (workingSeatCount === 0) {
      return NextResponse.json({ message: 'The selected venue has no working seats' }, { status: 409 });
    }

    const enrolledCount = await User.countDocuments({
      role: 'student',
      course: { $in: qualificationVariants(resolvedQualification) },
      year: resolvedQualificationYear,
      eligibility: 'eligible',
      isActive: true,
    });
    if (enrolledCount > workingSeatCount) {
      return NextResponse.json(
        {
          message: `The selected venue has ${workingSeatCount} working seat(s), but ${enrolledCount} eligible student(s) are in this qualification and year.`,
        },
        { status: 409 }
      );
    }

    if (!selectedModule) {
      const generatedCode = `USR-${crypto
        .createHash('sha256')
        .update(`${resolvedQualification.toLowerCase()}|${resolvedQualificationYear}|${requestedModuleName.toLowerCase()}`)
        .digest('hex')
        .slice(0, 12)
        .toUpperCase()}`;
      selectedModule = await Module.create({
        code: generatedCode,
        name: requestedModuleName,
        course: resolvedQualification,
        year: resolvedQualificationYear,
      });
    }

    const assessment = await Assessment.create({
      moduleId: selectedModule._id,
      qualification: resolvedQualification,
      qualificationYear: resolvedQualificationYear,
      name: name.trim(),
      type,
      startsAt: startDate,
      endsAt: endDate,
      venueId,
      invigilatorIds: [],
      instructions: instructions ? instructions.trim() : undefined,
      createdBy: userId,
    });

    await AuditLog.create({
      actorId: userId,
      action: 'assessment_created',
      entityType: 'Assessment',
      entityId: assessment._id,
      details: { name: assessment.name, venueId, startsAt: startDate, endsAt: endDate },
    });

    const populated = await Assessment.findById(assessment._id)
      .populate('moduleId', 'code name')
      .populate('venueId', 'name');

    return NextResponse.json(populated, { status: 201 });
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}
