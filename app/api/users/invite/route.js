import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/db';
import { User, AuditLog } from '../../../../models';

const { requireAuth } = require('../../../../lib/auth');
const { createCode } = require('../../../../lib/authCodes');
const { sendEmail } = require('../../../../lib/email');
const { inviteEmail } = require('../../../../lib/emailTemplates');
const { normalizeEmail, isStudentNumber, isStaffNumber } = require('../../../../lib/validate');
const { isValidQualificationYear } = require('../../../../models/constants');

export async function POST(request) {
  try {
    await connectDB();
    const { userId, role: callerRole } = requireAuth(request, ['admin']);

    if (callerRole !== 'admin') {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const {
      role,
      email,
      firstName,
      lastName,
      studentNumber,
      course,
      year,
      staffNumber,
      department,
      phone,
    } = body || {};

    if (
      typeof role !== 'string'
      || typeof email !== 'string'
      || typeof firstName !== 'string'
      || typeof lastName !== 'string'
    ) {
      return NextResponse.json(
        { message: 'Role, email, firstName, and lastName are required' },
        { status: 400 }
      );
    }

    const normalizedEmail = normalizeEmail(email);
    const allowsExternalInvigilatorEmail = role === 'invigilator'
      && process.env.ALLOW_NON_INSTITUTIONAL_INVIGILATOR_EMAILS === 'true';
    if (
      !normalizedEmail
      || (!normalizedEmail.endsWith('@my.richfield.ac.za') && !allowsExternalInvigilatorEmail)
    ) {
      return NextResponse.json(
        { message: 'Use an institutional @my.richfield.ac.za email address' },
        { status: 400 }
      );
    }
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return NextResponse.json(
        { message: 'A user with this email already exists' },
        { status: 409 }
      );
    }

    const userData = {
      role,
      email: normalizedEmail,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      accountStatus: 'invited',
    };

    if (role === 'student') {
      if (!isStudentNumber(studentNumber) || typeof course !== 'string' || !isValidQualificationYear(course, year)) {
        return NextResponse.json(
          { message: 'studentNumber, course, and year are required for student' },
          { status: 400 }
        );
      }
      userData.studentNumber = studentNumber.trim();
      userData.course = course;
      userData.year = Number(year);
    } else if (role === 'invigilator') {
      if (!isStaffNumber(staffNumber) || typeof department !== 'string' || typeof phone !== 'string') {
        return NextResponse.json(
          { message: 'staffNumber, department, and phone are required for invigilator' },
          { status: 400 }
        );
      }
      userData.staffNumber = staffNumber.trim().toUpperCase();
      userData.department = department.trim();
      userData.phone = phone.trim();
    }

    const user = await User.create(userData);

    const { code } = await createCode(user._id, 'invite');
    const emailResult = await sendEmail({
      to: user.email,
      ...inviteEmail({ firstName: user.firstName, code }),
    });

    await AuditLog.create({
      actorId: userId,
      action: 'user_created',
      entityType: 'User',
      entityId: user._id,
      details: { role, email: normalizedEmail },
    });

    return NextResponse.json({
      user,
      inviteEmail: emailResult.ok ? 'sent' : 'failed',
    }, { status: 201 });
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : err.message === 'Forbidden' ? 403 : err.code === 11000 ? 409 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}
