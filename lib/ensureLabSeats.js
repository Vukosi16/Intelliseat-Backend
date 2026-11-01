const { LAB_NAMES } = require('../models/constants');
const { Venue, Seat } = require('../models');

async function ensureLabSeats(venueId) {
  const venue = await Venue.findById(venueId).select('name').lean();
  if (!venue || !LAB_NAMES.includes(venue.name)) return;

  const labels = Array.from({ length: 50 }, (_, index) => `PC ${index + 1}`);
  const existingSeats = await Seat.find({ venueId, label: { $in: labels } })
    .select('label number isActive')
    .lean();
  const seatsByLabel = new Map(existingSeats.map((seat) => [seat.label, seat]));
  const operations = labels.flatMap((label, index) => {
    const seat = seatsByLabel.get(label);
    if (seat?.number === index + 1 && seat.isActive) return [];

    return [{
      updateOne: {
        filter: { venueId, label },
        update: {
          $set: { number: index + 1, isActive: true },
          $setOnInsert: { venueId, label, condition: 'working' },
        },
        upsert: true,
      },
    }];
  });
  if (operations.length) await Seat.bulkWrite(operations);
}

module.exports = ensureLabSeats;
