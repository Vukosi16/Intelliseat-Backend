// Helpers for working with Africa/Johannesburg (SAST, UTC+2) dates.
// All dates are stored in MongoDB as UTC. These helpers convert to/from
// the local Johannesburg representation that the admin forms and seed use.

const TZ = 'Africa/Johannesburg';

/**
 * Returns the current date (or the given date) as a YYYY-MM-DD string in
 * Johannesburg local time.
 *
 * @param {Date}   [base=new Date()]  The moment to format.
 * @param {number} [offsetDays=0]     Add this many days before formatting.
 */
function johannesburgDateString(base = new Date(), offsetDays = 0) {
  const d = new Date(base.getTime() + offsetDays * 24 * 60 * 60 * 1000);
  return d.toLocaleDateString('en-CA', { timeZone: TZ }); // gives YYYY-MM-DD
}

/**
 * Returns the four-digit year of the given date in Johannesburg local time.
 *
 * @param {Date} [d=new Date()]
 */
function johannesburgYear(d = new Date()) {
  return Number(
    d.toLocaleDateString('en-CA', { timeZone: TZ }).slice(0, 4)
  );
}

/**
 * Builds a UTC Date from a YYYY-MM-DD date string and an "HH:MM" time string,
 * interpreting both as Johannesburg local time.
 *
 * Example:
 *   johannesburgDate('2026-10-26', '09:00')
 *   // → a Date that represents 07:00 UTC on 26 Oct 2026
 *
 * @param {string} dateStr   e.g. '2026-10-26'
 * @param {string} timeStr   e.g. '09:00'
 * @returns {Date}
 */
function johannesburgDate(dateStr, timeStr) {
  // Build an ISO string that the Intl machinery can resolve.
  // We rely on the fact that Temporal-style zone-aware parsing isn't available
  // in all Node versions, so we use a trick: format the target moment in UTC
  // by subtracting the offset.
  const naive = new Date(`${dateStr}T${timeStr}:00`); // treated as local (UTC in Node)

  // Find the UTC offset for that moment in Johannesburg.
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    timeZoneName: 'shortOffset',
  });
  const parts = formatter.formatToParts(naive);
  const offsetPart = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+2';
  const match = offsetPart.match(/GMT([+-])(\d+)(?::(\d+))?/);
  const sign = match ? (match[1] === '+' ? 1 : -1) : 1;
  const hours = match ? Number(match[2]) : 2;
  const minutes = match ? Number(match[3] ?? 0) : 0;
  const offsetMs = sign * (hours * 60 + minutes) * 60 * 1000;

  // Parse the date+time as UTC, then subtract the JHB offset to get the real UTC value.
  const utcMs = Date.parse(`${dateStr}T${timeStr}:00Z`) - offsetMs;
  return new Date(utcMs);
}

/**
 * Parses an assessment schedule value, treating timezone-less values as Johannesburg local time.
 */
function parseScheduleDate(value) {
  if (typeof value !== 'string') return new Date(NaN);
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) return new Date(value);
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  return match ? johannesburgDate(match[1], match[2]) : new Date(value);
}

/**
 * Returns UTC Date objects for the start and end of today in Johannesburg time.
 * Used by the cron route to query: startsAt >= start && startsAt < end
 *
 * @param {Date} [base=new Date()]
 * @returns {{ start: Date, end: Date }}
 */
function johannesburgDayRange(base = new Date()) {
  const dateStr = johannesburgDateString(base);
  const start = johannesburgDate(dateStr, '00:00');
  const end = johannesburgDate(dateStr, '23:59');
  // Snap end to the very last second of the day
  end.setSeconds(59);
  end.setMilliseconds(999);
  return { start, end };
}

module.exports = {
  johannesburgDateString,
  johannesburgYear,
  johannesburgDate,
  johannesburgDayRange,
  parseScheduleDate,
};
