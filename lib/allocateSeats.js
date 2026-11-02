const {
  Assessment,
  Module,
  User,
  Seat,
  SeatAllocation,
  Alert,
  AuditLog,
  qualificationVariants,
} = require('../models');

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Gives a random working seat to each eligible student in the assessment's qualification and year.
 *
 * Safe to run more than once: it only seats students without a seat, so it can be used for
 *  - the 03:00 daily job,
 *  - the admin's "Re-run seating" button,
 *  - a student made eligible after 03:00 (call it again to seat them).
 *
 * If there are more students than working seats it seats as many as it can, writes who is
 * left over into assessment.seatingNote and sends an alert to all admins.
 */
async function allocateSeatsForAssessment(assessmentId, { now = new Date() } = {}) {
  const assessment = await Assessment.findById(assessmentId);
  if (!assessment) throw new Error('Assessment not found');
  if (assessment.cancelledAt) return { assessmentId, skipped: 'cancelled' };

  const students = await User.find({
    role: 'student',
    course: { $in: qualificationVariants(assessment.qualification) },
    year: assessment.qualificationYear,
    eligibility: 'eligible',
    isActive: true,
  }).select('_id').lean();

  const existing = await SeatAllocation.find({ assessmentId }).select('studentId seatId holdsSeat').lean();
  const alreadySeated = new Set(existing.map((row) => String(row.studentId)));
  const takenSeatIds = existing.filter((row) => row.holdsSeat).map((row) => row.seatId);

  const needSeat = students.map((student) => student._id).filter((id) => !alreadySeated.has(String(id)));

  const overlappingAssessments = await Assessment.find({
    venueId: assessment.venueId,
    cancelledAt: null,
    startsAt: { $lt: assessment.endsAt },
    endsAt: { $gt: assessment.startsAt },
    _id: { $ne: assessment._id },
  }).select('_id').lean();
  const seatsHeldByOverlappingAssessments = overlappingAssessments.length
    ? await SeatAllocation.distinct('seatId', {
      assessmentId: { $in: overlappingAssessments.map((row) => row._id) },
      holdsSeat: true,
    })
    : [];

  const freeSeats = shuffle(
    await Seat.find({
      venueId: assessment.venueId,
      isActive: true,
      condition: 'working',
      _id: { $nin: [...takenSeatIds, ...seatsHeldByOverlappingAssessments] },
    })
      .select('_id')
      .lean()
  );

  const toSeat = needSeat.slice(0, freeSeats.length);
  if (toSeat.length > 0) {
    const rows = toSeat.map((studentId, i) => ({ assessmentId, studentId, seatId: freeSeats[i]._id }));
    try {
      await SeatAllocation.insertMany(rows, { ordered: false });
    } catch (err) {
      // 11000 = duplicate key: another run seated someone at the same moment. Count what really landed.
      if (err.code !== 11000 && !err.writeErrors) throw err;
    }
  }

  const nowSeated = await SeatAllocation.countDocuments({ assessmentId, holdsSeat: true });
  const existingSeated = existing.filter((row) => row.holdsSeat).length;
  const seatedNow = nowSeated - existingSeated;
  const leftOut = needSeat.length - seatedNow;

  assessment.seatsAllocatedAt = assessment.seatsAllocatedAt || now;
  assessment.seatingNote =
    leftOut > 0 ? `${leftOut} student(s) have no seat: not enough working seats in the venue.` : undefined;
  await assessment.save();

  await AuditLog.create({
    action: 'seats_allocated',
    entityType: 'Assessment',
    entityId: assessment._id,
    details: { enrolled: students.length, alreadySeated: existing.length, seated: seatedNow, leftOut },
  });

  if (leftOut > 0) {
    const mod = await Module.findById(assessment.moduleId).select('code').lean();
    await Alert.create({
      kind: 'system',
      audienceType: 'all_admins',
      assessmentId: assessment._id,
      message: `${mod ? mod.code : 'Assessment'}: ${leftOut} student(s) could not be seated. Not enough working seats in the venue.`,
    });
  }

  return {
    assessmentId: String(assessment._id),
    enrolled: students.length,
    alreadySeated: existing.length,
    seated: seatedNow,
    leftOut,
  };
}

module.exports = { allocateSeatsForAssessment };
