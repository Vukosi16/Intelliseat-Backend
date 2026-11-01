import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/db';
import { User, AuthCode } from '../../../../models';

const { createCode } = require('../../../../lib/authCodes');
const { sendEmail } = require('../../../../lib/email');
const { resetEmail } = require('../../../../lib/emailTemplates');
const { normalizeEmail } = require('../../../../lib/validate');

const MESSAGE = 'If that email belongs to an account, a reset code has been sent.';

export async function POST(request) {
  try {
    await connectDB();
    const body = await request.json();
    const email = normalizeEmail(body?.email);
    if (!email) return NextResponse.json({ message: MESSAGE });
    const user = await User.findOne({ email, accountStatus: 'active', isActive: true });
    if (!user) return NextResponse.json({ message: MESSAGE });

    const recent = await AuthCode.findOne({
      userId: user._id,
      purpose: 'password_reset',
      createdAt: { $gte: new Date(Date.now() - 60000) },
    });
    if (!recent) {
      const { code } = await createCode(user._id, 'password_reset');
      const emailResult = resetEmail({ firstName: user.firstName, code });
      await sendEmail({ to: user.email, ...emailResult });
    }
    return NextResponse.json({ message: MESSAGE });
  } catch (error) {
    return NextResponse.json({ message: MESSAGE }, { status: 200 });
  }
}
