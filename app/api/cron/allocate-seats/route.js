// Runs every day at 03:00 Johannesburg time (01:00 UTC), see vercel.json.
// Seats every enrolled student for the assessments that take place today.
import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/db';
import { Assessment } from '../../../../models';
import { allocateSeatsForAssessment } from '../../../../lib/allocateSeats';
import { johannesburgDayRange } from '../../../../lib/time';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization');
  if (!secret || authorization !== 'Bearer ' + secret) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectDB();
    const { start, end } = johannesburgDayRange();
    const due = await Assessment.find({
      startsAt: { $gte: start, $lt: end },
      cancelledAt: null,
      seatsAllocatedAt: null,
    }).select('_id');

    const results = [];
    for (const assessment of due) {
      try {
        results.push(await allocateSeatsForAssessment(assessment._id));
      } catch (err) {
        results.push({ assessmentId: String(assessment._id), error: err.message });
      }
    }

    return NextResponse.json({ ran: results.length, results });
  } catch (err) {
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
