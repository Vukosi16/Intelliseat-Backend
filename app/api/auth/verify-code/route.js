import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/db';
import { findCode } from '../../../../lib/authCodes';

const { signSetupToken } = require('../../../../lib/auth');

export async function POST(request) {
  try {
    await connectDB();
    const body = await request.json();
    if (
      typeof body?.email !== 'string'
      || typeof body?.code !== 'string'
      || !['invite', 'password_reset'].includes(body?.purpose)
    ) {
      return NextResponse.json({ message: 'Invalid or expired code' }, { status: 400 });
    }
    const result = await findCode(body.email, body.code, body.purpose);
    if (!result) return NextResponse.json({ message: 'Invalid or expired code' }, { status: 400 });
    return NextResponse.json({
      setupToken: signSetupToken({
        userId: result.user._id,
        codeId: result.authCode._id,
        kind: body.purpose,
      }),
    });
  } catch (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}
