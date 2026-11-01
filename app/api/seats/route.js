import { NextResponse } from 'next/server';
import connectDB from '../../../lib/db';
import { Seat } from '../../../models';
import ensureLabSeats from '../../../lib/ensureLabSeats';

const { requireAuth } = require('../../../lib/auth');

export async function GET(request) {
  try {
    await connectDB();
    requireAuth(request);

    const { searchParams } = new URL(request.url);
    const venueId = searchParams.get('venueId');
    if (venueId) await ensureLabSeats(venueId);

    const filter = venueId ? { venueId, isActive: true } : { isActive: true };
    const seats = await Seat.find(filter).sort({ number: 1 });

    return NextResponse.json(seats);
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}
