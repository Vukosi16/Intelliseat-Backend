import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/db';
import { AuthCode, User } from '../../../../models';

const { verifyToken, hashPassword, signLoginToken } = require('../../../../lib/auth');
const { consumeCode } = require('../../../../lib/authCodes');
const { validatePassword } = require('../../../../lib/validate');

export async function POST(request) {
  try {
    await connectDB();
    const body = await request.json();
    if (typeof body?.setupToken !== 'string' || typeof body?.password !== 'string') {
      return NextResponse.json({ message: 'Invalid or expired setup token' }, { status: 401 });
    }
    if (!validatePassword(body.password)) {
      return NextResponse.json({ message: 'Password must be at least 8 characters and contain a letter and a number' }, { status: 400 });
    }

    let token;
    try {
      token = verifyToken(body.setupToken);
    } catch {
      return NextResponse.json({ message: 'Invalid or expired setup token' }, { status: 401 });
    }
    if (token.purpose !== 'set_password' || !token.sub || !token.codeId || !token.kind) {
      return NextResponse.json({ message: 'Invalid or expired setup token' }, { status: 401 });
    }
    const user = await User.findById(token.sub).select('+passwordHash');
    if (!user || user.accountStatus === 'disabled') {
      return NextResponse.json({ message: 'Invalid or expired setup token' }, { status: 401 });
    }
    const code = await AuthCode.findOne({
      _id: token.codeId,
      userId: user._id,
      purpose: token.kind,
      usedAt: null,
      expiresAt: { $gt: new Date() },
    });
    if (!code || !(await consumeCode(code._id))) {
      return NextResponse.json({ message: 'Invalid or expired setup token' }, { status: 401 });
    }

    user.passwordHash = await hashPassword(body.password);
    user.accountStatus = 'active';
    await user.save();
    await AuthCode.deleteMany({ userId: user._id, usedAt: null });
    return NextResponse.json({ token: signLoginToken(user), user: user.toJSON() });
  } catch (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}
