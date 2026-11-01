import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/db';
import { User } from '../../../../models';

const { requireAuth } = require('../../../../lib/auth');

export async function GET(request) {
  try {
    await connectDB();
    const { userId } = requireAuth(request);

    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}

export async function PATCH(request) {
  try {
    await connectDB();
    const { userId } = requireAuth(request);
    const { phone } = await request.json();
    if (phone !== undefined && String(phone).trim().length > 40) {
      return NextResponse.json({ message: 'Phone number is too long' }, { status: 400 });
    }
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { phone: phone ? String(phone).trim() : undefined } },
      { new: true, runValidators: true }
    ).select('-passwordHash');
    if (!user) return NextResponse.json({ message: 'User not found' }, { status: 404 });
    return NextResponse.json(user);
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}
