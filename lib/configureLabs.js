const { Venue, Seat, LAB_NAMES } = require('../models');

async function configureLabs() {
  const labs = await Promise.all(LAB_NAMES.map((name) =>
    Venue.findOneAndUpdate(
      { name },
      { $set: { type: 'lab', building: 'Main Block', isActive: true } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    )
  ));
  const seatLabels = Array.from({ length: 50 }, (_, index) => `PC ${index + 1}`);

  for (const lab of labs) {
    await Seat.bulkWrite(seatLabels.map((label, index) => ({
      updateOne: {
        filter: { venueId: lab._id, label },
        update: {
          $set: { number: index + 1, isActive: true, condition: 'working' },
          $setOnInsert: { venueId: lab._id, label },
          $unset: { faultyReason: 1, faultySince: 1 },
        },
        upsert: true,
      },
    })));
    await Seat.updateMany(
      { venueId: lab._id, label: { $nin: seatLabels } },
      { $set: { isActive: false } }
    );
  }

  const activeVenueIds = labs.map((lab) => lab._id);
  await Venue.updateMany({ name: { $nin: LAB_NAMES } }, { $set: { isActive: false } });
  await Seat.updateMany({ venueId: { $nin: activeVenueIds } }, { $set: { isActive: false } });

  return labs;
}

module.exports = configureLabs;
