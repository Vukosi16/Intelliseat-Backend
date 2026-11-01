// Loads demo data so the apps have something to show.
//
//   node --env-file=.env.local scripts/seed.js            (only runs on an empty database)
//   node --env-file=.env.local scripts/seed.js --reset    (deletes EVERYTHING first)
//
// Demo logins (development only, change or delete before going live):
//   admin@intelliseat.co.za        Password123!
//   naledi.mokoena@my.richfield.ac.za Password123!   (invigilator)
//   402410233@... is "Dineo Mudanabula": dineo.mudanabula@my.richfield.ac.za  Password123!  (student)
// Every other student is "invited" and has no password yet.

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const connectDB = require('../lib/db');
const {
  User, Venue, Seat, Module, Enrollment, Assessment, Issue, IssueMessage, Alert,
} = require('../models');
const { johannesburgDateString } = require('../lib/time');
const configureLabs = require('../lib/configureLabs');

const DEV_PASSWORD = 'Password123!';

async function main() {
  await connectDB();

  const existingUsers = await User.countDocuments();
  if (existingUsers > 0) {
    if (!process.argv.includes('--reset')) {
      console.log('The database already has data. Run with --reset to delete everything and reseed.');
      return;
    }
    await Promise.all(Object.values(mongoose.connection.models).map((m) => m.deleteMany({})));
    console.log('Existing data deleted.');
  }

  // Build the indexes first so the uniqueness rules are active while seeding
  await Promise.all(Object.values(mongoose.connection.models).map((m) => m.init()));

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);

  // --- People ---
  const admin = await User.create({
    role: 'admin',
    email: 'admin@intelliseat.co.za',
    firstName: 'IntelliSeat',
    lastName: 'Admin',
    passwordHash,
    accountStatus: 'active',
  });

  const [naledi, james] = await User.create([
    {
      role: 'invigilator', email: 'naledi.mokoena@my.richfield.ac.za', firstName: 'Naledi', lastName: 'Mokoena',
      staffNumber: 'INV-00101', department: 'Information Technology', phone: '+27 82 000 0101',
      passwordHash, accountStatus: 'active',
    },
    {
      role: 'invigilator', email: 'james.peters@my.richfield.ac.za', firstName: 'James', lastName: 'Peters',
      staffNumber: 'INV-00102', department: 'Information Technology', phone: '+27 82 000 0102',
    },
  ]);

  // studentNumber, first, last, clearance
  const studentRows = [
    ['402410482', 'Lindiwe', 'Khosa', 'cleared'],
    ['402410917', 'Sipho', 'Mokoena', 'outstanding_fees'],
    ['402410138', 'Amara', 'Dlamini', 'cleared'],
    ['402411204', 'Thabo', 'Nkosi', 'documents_pending'],
    ['402410233', 'Dineo', 'Mudanabula', 'cleared'],
    ['402410301', 'Nomvula', 'Bukenya', 'cleared'],
    ['402410302', 'Ethan', 'Dauds', 'cleared'],
    ['402410303', 'Karabo', 'Mabena', 'cleared'],
    ['402410304', 'Lerato', 'Mabaso', 'cleared'],
    ['402410305', 'Musa', 'Ndaba', 'cleared'],
    ['402410306', 'Jabu', 'Thabo', 'cleared'],
    ['402410307', 'Olwethu', 'Koloti', 'cleared'],
    ['402410308', 'Emma', 'Mlambo', 'cleared'],
    ['402410309', 'Kagiso', 'Mokoena', 'cleared'],
    ['402410310', 'Sinazo', 'Nkonwana', 'cleared'],
    ['402410311', 'Zanele', 'Maseko', 'cleared'],
  ];
  const students = await User.create(
    studentRows.map(([studentNumber, firstName, lastName, clearanceStatus]) => {
      const demoLogin = studentNumber === '402410233';
      return {
        role: 'student',
        email: `${firstName}.${lastName}@my.richfield.ac.za`,
        firstName,
        lastName,
        studentNumber,
        course: 'Diploma in IT',
        year: 2,
        clearanceStatus,
        ...(demoLogin ? { passwordHash, accountStatus: 'active' } : {}),
      };
    })
  );

  // --- Venues and seats ---
  const labs = await configureLabs();

  // Sample issue for the Lab Map and support workflow.
  const lab2 = labs[1];

  // --- Modules and enrollments ---
  const [itsd200, net150, dbs210] = await Module.create([
    { code: 'ITSD200', name: 'Systems Design', course: 'Diploma in IT', year: 2 },
    { code: 'NET150', name: 'Networking Fundamentals', course: 'Diploma in Networking', year: 1 },
    { code: 'DBS210', name: 'Database Systems', course: 'Diploma in IT', year: 2 },
  ]);

  const academicYear = Number(johannesburgDateString().slice(0, 4));
  await Enrollment.insertMany(
    students.flatMap((s) => [
      { studentId: s._id, moduleId: itsd200._id, academicYear },
      { studentId: s._id, moduleId: dbs210._id, academicYear },
    ])
  );

  // --- A sample issue with a reply, and a sample alert ---
  const sipho = students.find((s) => s.studentNumber === '402410917');
  const faultySeat = await Seat.findOne({ venueId: lab2._id, label: 'PC 14' });
  const issue = await Issue.create({
    reporterId: sipho._id,
    venueId: lab2._id,
    seatId: faultySeat._id,
    category: 'hardware',
    description: 'Workstation will not start',
  });
  await IssueMessage.create({
    issueId: issue._id,
    senderId: admin._id,
    body: 'Thanks, we are looking at it now.',
  });
  await Alert.create({
    senderId: admin._id,
    kind: 'manual',
    audienceType: 'all_students',
    message: 'Please arrive 30 minutes before your assessment and bring your student card.',
  });

  console.log('Seed finished.');
  console.log(`  users: ${await User.countDocuments()}  venues: ${await Venue.countDocuments()}  seats: ${await Seat.countDocuments()}`);
  console.log('  assessments: 0 (create these from the admin portal)');
  console.log(`  dev password for demo logins: ${DEV_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
