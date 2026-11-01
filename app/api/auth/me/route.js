import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/db';
import { User } from '../../../../models';

const { requireAuth } = require('../../../../lib/auth');

export async function GET(request) {
  try {
    await connectDB();
    const { userId } = requireAuth(request);
    const user = await User.findOne({ _id: userId, accountStatus: 'active', isActive: true });
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json({ message: error.message }, { status: error.message === 'Forbidden' ? 403 : 401 });
  }
}
