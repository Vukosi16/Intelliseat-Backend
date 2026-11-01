import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/db';
import { User, AuditLog } from '../../../../models';

const { comparePassword, signLoginToken } = require('../../../../lib/auth');
const { normalizeEmail } = require('../../../../lib/validate');

const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.5Qv8G8j8d0KqQ0C9w4p4n0q3vJ7Kq6';

export async function POST(request) {
  try {
    await connectDB();
    const body = await request.json();
    const rawIdentifier = typeof body?.identifier === 'string' ? body.identifier : body?.email;
    if (typeof rawIdentifier !== 'string' || typeof body?.password !== 'string') {
      return NextResponse.json({ message: 'Incorrect email or password' }, { status: 401 });
    }

    const identifier = rawIdentifier.trim();
    const email = normalizeEmail(identifier);
    const lookup = email
      ? { email }
      : { $or: [{ studentNumber: identifier }, { staffNumber: identifier.toUpperCase() }] };
    const user = await User.findOne(lookup).select('+passwordHash');
    const recentFailures = await AuditLog.countDocuments({
      action: 'login_failed',
      $or: [
        { 'details.identifier': identifier.toLowerCase() },
        ...(email ? [{ 'details.email': email }] : []),
      ],
      createdAt: { $gte: new Date(Date.now() - 15 * 60 * 1000) },
    });
    if (recentFailures >= 10) {
      return NextResponse.json({ message: 'Too many attempts. Try again in 15 minutes.' }, { status: 429 });
    }

    const passwordMatches = await comparePassword(body.password, user?.passwordHash || DUMMY_HASH);
    if (!user || !passwordMatches || user.accountStatus !== 'active' || !user.isActive) {
      await AuditLog.create({
        action: 'login_failed',
        actorId: user?._id,
        entityType: 'User',
        entityId: user?._id,
        details: { identifier: identifier.toLowerCase(), ...(email ? { email } : {}) },
      });
      return NextResponse.json({ message: 'Incorrect email or password' }, { status: 401 });
    }

    user.lastLoginAt = new Date();
    await user.save();
    await AuditLog.create({
      actorId: user._id,
      action: 'login_success',
      entityType: 'User',
      entityId: user._id,
      details: { identifier: identifier.toLowerCase(), ...(email ? { email } : {}), role: user.role },
    });
    return NextResponse.json({ token: signLoginToken(user), user: user.toJSON() });
  } catch (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}
