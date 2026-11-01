// One place for every fixed list of values.
// The admin web and the mobile app should use the same values (they are sent to the API as-is,
// and the screens turn them into labels).

const ROLES = ['student', 'invigilator', 'admin'];
const LAB_NAMES = Array.from({ length: 5 }, (_, index) => `Lab ${index + 1}`);

const QUALIFICATIONS = [
  { name: 'Bachelor of Commerce (BCom)', years: 3 },
  { name: 'Bachelor of Commerce - Associate General Accountant (AGA)', years: 3 },
  { name: 'Bachelor of Commerce - Associate General Accountant (AGA IT)', years: 3 },
  { name: 'Bachelor of Business Administration (BBA)', years: 3 },
  { name: 'Bachelor of Public Management (BPM)', years: 3 },
  { name: 'Diploma in Local Government Management (DLGM)', years: 3 },
  { name: 'Diploma in Business Administration (DBA)', years: 3 },
  { name: 'Higher Certificate in Office Administration (HCOA)', years: 1 },
  { name: 'Higher Certificate in Business Administration (HCBA)', years: 1 },
  { name: 'Higher Certificate in Local Government Management', years: 1 },
  { name: 'Postgraduate Diploma in Management (PGDM)', years: 1 },
  { name: 'Master of Business Administration (MBA)', years: 2 },
  { name: 'Diploma in Information Technology (DIT)', years: 3 },
  { name: 'Higher Certificate in Information Technology', years: 1 },
  { name: 'Bachelor of Science in Information Technology (BSc IT)', years: 3 },
  { name: 'Higher Certificate in Computer Forensics', years: 1 },
  { name: 'Bachelor of Science Honours in Information Technology', years: 1 },
];

const LEGACY_COURSES = ['Diploma in IT', 'Diploma in Networking', 'Higher Certificate in IT', 'Bachelor of IT'];
const COURSES = [...QUALIFICATIONS.map(({ name }) => name), ...LEGACY_COURSES];
const QUALIFICATION_ALIAS_ENTRIES = [
  { alias: 'Diploma in IT', canonical: 'Diploma in Information Technology (DIT)' },
  { alias: 'Diploma in Information Technology', canonical: 'Diploma in Information Technology (DIT)' },
  { alias: 'Higher Certificate in IT', canonical: 'Higher Certificate in Information Technology' },
  { alias: 'Bachelor of IT', canonical: 'Bachelor of Science in Information Technology (BSc IT)' },
];

function canonicalQualification(course) {
  if (typeof course !== 'string') return '';
  const normalized = course.trim();
  const alias = QUALIFICATION_ALIAS_ENTRIES.find((entry) => entry.alias.toLowerCase() === normalized.toLowerCase());
  return alias?.canonical || normalized;
}

function qualificationVariants(course) {
  const canonical = canonicalQualification(course);
  if (!canonical) return [];
  return [...new Set([
    canonical,
    ...QUALIFICATION_ALIAS_ENTRIES
      .filter((entry) => entry.canonical === canonical)
      .map((entry) => entry.alias),
  ])];
}

function qualificationsMatch(first, second) {
  return Boolean(canonicalQualification(first))
    && canonicalQualification(first) === canonicalQualification(second);
}

function qualificationYears(course) {
  return QUALIFICATIONS.find((qualification) => qualification.name === canonicalQualification(course))?.years
    || (LEGACY_COURSES.includes(course) ? 4 : 0);
}

function isValidQualificationYear(course, year) {
  const maximumYear = qualificationYears(course);
  return Number.isInteger(Number(year)) && Number(year) >= 1 && Number(year) <= maximumYear;
}

const CLEARANCE_STATUSES = ['cleared', 'outstanding_fees', 'documents_pending'];
const ELIGIBILITY = ['eligible', 'needs_review'];
const ACCOUNT_STATUSES = ['invited', 'active', 'disabled'];

const AUTH_CODE_PURPOSES = ['invite', 'password_reset'];

const VENUE_TYPES = ['lab', 'hall'];
const SEAT_CONDITIONS = ['working', 'faulty'];

const ENROLLMENT_STATUSES = ['enrolled', 'withdrawn'];
const ASSESSMENT_TYPES = ['CA Test', 'Exam', 'Mock Assessment', 'Class Exercise'];

const ALLOCATION_STATUSES = ['pending', 'verified', 'expelled'];
const SWAP_REASONS = ['random_generator', 'faulty_pc', 'manual', 'admin'];

const ISSUE_CATEGORIES = ['hardware', 'login_access', 'qr_code', 'seating', 'other'];
const ISSUE_STATUSES = ['open', 'in_progress', 'resolved'];

const PC_STATUSES = ['verified', 'faulty'];

const ALERT_KINDS = ['manual', 'system'];
const ALERT_AUDIENCES = [
  'all_students',
  'all_invigilators',
  'all_admins',
  'year_students',
  'assessment',
  'user',
];

const AUDIT_ACTIONS = [
  'login_success',
  'login_failed',
  'user_created',
  'user_updated',
  'eligibility_changed',
  'enrollment_created',
  'assessment_created',
  'assessment_updated',
  'assessment_cancelled',
  'assessment_deleted',
  'seats_allocated',
  'student_verified',
  'student_expelled',
  'seat_swapped',
  'pc_marked',
  'issue_created',
  'issue_status_changed',
  'alert_sent',
  'scan_failed',
];

// Rules agreed in planning
const RULES = {
  TIME_ZONE: 'Africa/Johannesburg',
  QR_TTL_SECONDS: 120, // a QR code is valid for 2 minutes (the app refreshes it)
  QR_OPENS_MINUTES_BEFORE_START: 60, // students can get a QR code from 60 minutes before the start
  INVITE_TTL_DAYS: 7,
  RESET_TTL_MINUTES: 15,
  MAX_CODE_ATTEMPTS: 5,
  ALERT_MAX_LENGTH: 280,
  SEATING_HOUR: 3, // seats are allocated at 03:00 on the day of the assessment
};

module.exports = {
  ROLES,
  LAB_NAMES,
  QUALIFICATIONS,
  LEGACY_COURSES,
  COURSES,
  canonicalQualification,
  qualificationVariants,
  qualificationsMatch,
  qualificationYears,
  isValidQualificationYear,
  CLEARANCE_STATUSES,
  ELIGIBILITY,
  ACCOUNT_STATUSES,
  AUTH_CODE_PURPOSES,
  VENUE_TYPES,
  SEAT_CONDITIONS,
  ENROLLMENT_STATUSES,
  ASSESSMENT_TYPES,
  ALLOCATION_STATUSES,
  SWAP_REASONS,
  ISSUE_CATEGORIES,
  ISSUE_STATUSES,
  PC_STATUSES,
  ALERT_KINDS,
  ALERT_AUDIENCES,
  AUDIT_ACTIONS,
  RULES,
};
