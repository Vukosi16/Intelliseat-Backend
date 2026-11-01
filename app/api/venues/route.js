import { NextResponse } from 'next/server';
import connectDB from '../../../lib/db';
import { Venue, LAB_NAMES } from '../../../models';

const { requireAuth } = require('../../../lib/auth');

export async function GET(request) {
  try {
    await connectDB();
    const { role } = requireAuth(request);

    if (role !== 'admin') {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const venues = await Venue.find({ name: { $in: LAB_NAMES }, isActive: true }).sort({ name: 1 });
    return NextResponse.json(venues);
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}
