import { NextResponse } from 'next/server';
import connectDB from '../../../../../lib/db';
import { User } from '../../../../../models';

const { requireAuth } = require('../../../../../lib/auth');
const { createCode } = require('../../../../../lib/authCodes');
const { sendEmail } = require('../../../../../lib/email');
const { inviteEmail } = require('../../../../../lib/emailTemplates');

export async function POST(request, { params }) {
  try {
    await connectDB();
    requireAuth(request, ['admin']);
    const { id } = await params;
    const user = await User.findById(id);
    if (!user) return NextResponse.json({ message: 'User not found' }, { status: 404 });
    if (user.accountStatus !== 'invited') {
      return NextResponse.json({ message: 'This account is already active' }, { status: 409 });
    }

    const { code } = await createCode(user._id, 'invite');
    const result = await sendEmail({
      to: user.email,
      ...inviteEmail({ firstName: user.firstName, code }),
    });
    return NextResponse.json({ inviteEmail: result.ok ? 'sent' : 'failed' });
  } catch (error) {
    const status = error.message === 'Unauthorized' ? 401 : error.message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ message: error.message }, { status });
  }
}
