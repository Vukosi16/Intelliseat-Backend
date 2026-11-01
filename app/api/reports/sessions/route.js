import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/db';
import { Assessment, SeatAllocation, User, qualificationVariants } from '../../../../models';

const { requireAuth } = require('../../../../lib/auth');

export async function GET(request) {
  try {
    await connectDB();
    const { role } = requireAuth(request);

    if (role !== 'admin') {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const startsAt = {};

    if (from) {
      const parsedFrom = new Date(`${from}T00:00:00.000Z`);
      if (Number.isNaN(parsedFrom.getTime())) {
        return NextResponse.json({ message: 'Invalid report start date' }, { status: 400 });
      }
      startsAt.$gte = parsedFrom;
    }
    if (to) {
      const parsedTo = new Date(`${to}T23:59:59.999Z`);
      if (Number.isNaN(parsedTo.getTime())) {
        return NextResponse.json({ message: 'Invalid report end date' }, { status: 400 });
      }
      startsAt.$lte = parsedTo;
    }

    const assessments = await Assessment.find(Object.keys(startsAt).length ? { startsAt } : {})
      .sort({ startsAt: -1 })
      .populate('moduleId', 'code name course year')
      .populate('venueId', 'name type building')
      .populate('invigilatorIds', 'firstName lastName email staffNumber');

    const reports = await Promise.all(
      assessments.map(async (assessment) => {
        const [
          eligibleStudentCount,
          verifiedCount,
          expelledCount,
          pendingCount,
          totalAllocated,
        ] =
          await Promise.all([
            User.countDocuments({
              role: 'student',
              course: { $in: qualificationVariants(assessment.qualification) },
              year: assessment.qualificationYear,
              eligibility: 'eligible',
              isActive: true,
            }),
            SeatAllocation.countDocuments({
              assessmentId: assessment._id,
              status: 'verified',
            }),
            SeatAllocation.countDocuments({
              assessmentId: assessment._id,
              status: 'expelled',
            }),
            SeatAllocation.countDocuments({
              assessmentId: assessment._id,
              status: 'pending',
            }),
            SeatAllocation.countDocuments({
              assessmentId: assessment._id,
            }),
          ]);
        const enrolledCount = eligibleStudentCount;

        return {
          assessment: {
            _id: assessment._id,
            name: assessment.name,
            type: assessment.type,
            startsAt: assessment.startsAt,
            endsAt: assessment.endsAt,
            status: assessment.status,
            module: assessment.moduleId,
            venue: assessment.venueId,
            invigilators: assessment.invigilatorIds,
            instructions: assessment.instructions,
            cancelledAt: assessment.cancelledAt,
            cancelReason: assessment.cancelReason,
            seatsAllocatedAt: assessment.seatsAllocatedAt,
            seatingNote: assessment.seatingNote,
          },
          counts: {
            enrolled: enrolledCount,
            allocated: totalAllocated,
            verified: verifiedCount,
            expelled: expelledCount,
            pending: pendingCount,
          },
        };
      })
    );

    return NextResponse.json(reports);
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}
