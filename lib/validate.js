function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function validatePassword(value) {
  return typeof value === 'string'
    && value.length >= 8
    && value.length <= 72
    && /[A-Za-z]/.test(value)
    && /\d/.test(value);
}

module.exports = {
  normalizeEmail,
  validatePassword,
  isStudentNumber: (value) => typeof value === 'string' && /^\d{9}$/.test(value),
  isStaffNumber: (value) => typeof value === 'string' && /^INV-\d+$/.test(value.toUpperCase()),
};
