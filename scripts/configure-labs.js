const mongoose = require('mongoose');
const connectDB = require('../lib/db');
const configureLabs = require('../lib/configureLabs');
const { Seat } = require('../models');

async function main() {
  await connectDB();
  const labs = await configureLabs();
  const summaries = await Promise.all(labs.map(async (lab) => ({
    name: lab.name,
    totalSeats: await Seat.countDocuments({ venueId: lab._id, isActive: true }),
    workingSeats: await Seat.countDocuments({ venueId: lab._id, isActive: true, condition: 'working' }),
  })));
  console.log('Active lab setup:', summaries);
  console.log('Other venues and their seats were deactivated; historical records were preserved.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
