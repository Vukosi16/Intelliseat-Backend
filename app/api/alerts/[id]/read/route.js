import { NextResponse } from 'next/server';
import connectDB from '../../../../../lib/db';
import { Alert, AlertRead } from '../../../../../models';

const { requireAuth } = require('../../../../../lib/auth');

export async function POST(request, { params }) {
  try {
    await connectDB();
    const { userId } = requireAuth(request);
    const { id } = await params;
    if (!await Alert.exists({ _id: id })) return NextResponse.json({ message: 'Alert not found' }, { status: 404 });
    await AlertRead.updateOne({ alertId: id, userId }, { $set: { readAt: new Date() } }, { upsert: true });
    return NextResponse.json({ alertId: id, read: true });
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}
