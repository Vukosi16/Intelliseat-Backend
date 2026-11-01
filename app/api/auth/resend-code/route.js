import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/db';
import { User, AuthCode } from '../../../../models';

const { createCode } = require('../../../../lib/authCodes');
const { sendEmail } = require('../../../../lib/email');
const { inviteEmail } = require('../../../../lib/emailTemplates');
const { normalizeEmail } = require('../../../../lib/validate');

const MESSAGE = 'If that email is waiting for a code, a new one has been sent.';

export async function POST(request) {
  try {
    await connectDB();
    const body = await request.json();
    const email = normalizeEmail(body?.email);
    const user = email ? await User.findOne({ email, accountStatus: 'invited', isActive: true }) : null;
    if (user) {
      const recent = await AuthCode.findOne({
        userId: user._id,
        purpose: 'invite',
        createdAt: { $gte: new Date(Date.now() - 60000) },
      });
      if (!recent) {
        const { code } = await createCode(user._id, 'invite');
        const emailResult = inviteEmail({ firstName: user.firstName, code });
        await sendEmail({ to: user.email, ...emailResult });
      }
    }
    return NextResponse.json({ message: MESSAGE });
  } catch {
    return NextResponse.json({ message: MESSAGE });
  }
}
