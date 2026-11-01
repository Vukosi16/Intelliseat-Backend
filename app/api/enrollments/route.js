import { NextResponse } from 'next/server';
import connectDB from '../../../lib/db';
import { Enrollment, User, Module, AuditLog } from '../../../models';

const { requireAuth } = require('../../../lib/auth');

export async function GET(request) {
  try {
    await connectDB();
    const { role } = requireAuth(request);
    if (role !== 'admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const moduleId = searchParams.get('moduleId');
    const academicYear = Number(searchParams.get('academicYear')) || new Date().getFullYear();
    const filter = { academicYear };
    if (moduleId) filter.moduleId = moduleId;

    const enrollments = await Enrollment.find(filter)
      .sort({ createdAt: -1 })
      .populate('studentId', 'firstName lastName email studentNumber eligibility clearanceStatus course year')
      .populate('moduleId', 'code name course year');
    return NextResponse.json(enrollments);
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}

export async function POST(request) {
  try {
    await connectDB();
    const { userId, role } = requireAuth(request);
    if (role !== 'admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

    const { studentId, moduleId, academicYear } = await request.json();
    if (!studentId || !moduleId || !academicYear) {
      return NextResponse.json({ message: 'studentId, moduleId and academicYear are required' }, { status: 400 });
    }

    const [student, module] = await Promise.all([
      User.findOne({ _id: studentId, role: 'student' }),
      Module.findOne({ _id: moduleId, isActive: true }),
    ]);
    if (!student) return NextResponse.json({ message: 'Student not found' }, { status: 404 });
    if (!module) return NextResponse.json({ message: 'Active module not found' }, { status: 404 });
    if (student.eligibility !== 'eligible') {
      return NextResponse.json({ message: 'Only eligible students can be enrolled' }, { status: 409 });
    }

    const enrollment = await Enrollment.create({ studentId, moduleId, academicYear: Number(academicYear) });
    await AuditLog.create({
      actorId: userId,
      action: 'enrollment_created',
      entityType: 'Enrollment',
      entityId: enrollment._id,
      details: { studentId, moduleId, academicYear: Number(academicYear) },
    });
    const populated = await Enrollment.findById(enrollment._id)
      .populate('studentId', 'firstName lastName email studentNumber eligibility')
      .populate('moduleId', 'code name');
    return NextResponse.json(populated, { status: 201 });
  } catch (err) {
    if (err.code === 11000) return NextResponse.json({ message: 'Student is already enrolled in this module for the selected year' }, { status: 409 });
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}
