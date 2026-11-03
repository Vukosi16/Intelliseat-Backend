import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '../../../../../lib/db';
import { User, AuthCode, AuditLog } from '../../../../../models';

const { requireAuth, hashPassword } = require('../../../../../lib/auth');
const { validatePassword } = require('../../../../../lib/validate');

async function requireActiveAdmin(userId) {
  const admin = await User.findById(userId).select('role accountStatus isActive').lean();
  if (!admin || admin.role !== 'admin' || admin.accountStatus !== 'active' || !admin.isActive) {
    throw new Error('Forbidden');
  }
}

function errorResponse(error) {
  const status = error.message === 'Unauthorized' ? 401
    : error.message === 'Forbidden' ? 403
      : 500;
  return NextResponse.json({ message: error.message }, { status });
}

export async function POST(request, { params }) {
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
      return NextResponse.json({ message: 'Admin passwords cannot be changed here' }, { status: 403 });
    }

    const body = await request.json();
    if (!validatePassword(body?.password)) {
      return NextResponse.json({ message: 'Password must be 8-72 characters and contain a letter and a number' }, { status: 400 });
    }

    user.passwordHash = await hashPassword(body.password);
    await user.save();
    await AuthCode.deleteMany({ userId: user._id, purpose: 'password_reset' });
    await AuditLog.create({
      actorId: userId,
      action: 'user_updated',
      entityType: 'User',
      entityId: user._id,
      details: { action: 'admin_password_reset' },
    });

    return NextResponse.json({ message: 'Password updated successfully' });
  } catch (error) {
    return errorResponse(error);
  }
}
