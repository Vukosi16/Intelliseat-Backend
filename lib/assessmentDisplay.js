const QUALIFICATION_ABBREVIATIONS = {
  'Diploma in Information Technology (DIT)': 'DIT',
  'Diploma in IT': 'DIT',
  'Diploma in Information Technology': 'DIT',
};

function ordinalYear(year) {
  const number = Number(year);
  if (!Number.isInteger(number)) return '';
  const suffix = number % 100 >= 11 && number % 100 <= 13
    ? 'th'
    : ({ 1: 'st', 2: 'nd', 3: 'rd' }[number % 10] || 'th');
  return `${number}${suffix} year`;
}

function formatAssessmentName(assessment) {
  const qualification = String(assessment?.qualification || '').trim();
  const shortQualification = QUALIFICATION_ABBREVIATIONS[qualification]
    || qualification.match(/\(([^)]+)\)$/)?.[1]
    || qualification;
  const year = ordinalYear(assessment?.qualificationYear);
  const moduleName = assessment?.moduleId?.name || assessment?.name || 'Assessment';
  const qualificationYear = [shortQualification, year].filter(Boolean).join(' ');
  return [moduleName, qualificationYear].filter(Boolean).join(' ');
}

function formatAssessmentResponse(assessment, { role = 'student', now = new Date() } = {}) {
  if (!assessment) return assessment;
  const response = typeof assessment.toJSON === 'function'
    ? assessment.toJSON()
    : { ...assessment };
  const revealAt = new Date(response.startsAt).getTime() - (5 * 60 * 1000);
  const canSeePassword = role === 'admin'
    || (role === 'invigilator' && Number.isFinite(revealAt) && now.getTime() >= revealAt);
  response.examPassword = canSeePassword ? response.examPassword || null : null;
  response.displayName = formatAssessmentName(response);
  return response;
}

module.exports = { formatAssessmentName, formatAssessmentResponse };
