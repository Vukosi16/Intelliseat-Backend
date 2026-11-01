const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set to at least 32 characters');
  }
  return secret;
}

function signToken(payload, options = {}) {
  return jwt.sign(payload, getSecret(), options);
}

function signLoginToken(user) {
  return signToken(
    { sub: String(user._id), userId: String(user._id), role: user.role },
    { expiresIn: '24h' }
  );
}

function signSetupToken({ userId, codeId, kind }) {
  return signToken(
    { sub: String(userId), purpose: 'set_password', codeId: String(codeId), kind },
    { expiresIn: '10m' }
  );
}

function verifyToken(token) {
  return jwt.verify(token, getSecret());
}

function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function getBearerToken(request) {
  const header = request?.headers?.get?.('authorization') || request?.headers?.authorization;
  return typeof header === 'string' && header.startsWith('Bearer ')
    ? header.slice(7).trim()
    : null;
}

function requireAuth(request, allowedRoles) {
  const token = getBearerToken(request);
  if (!token) throw new Error('Unauthorized');

  try {
    const decoded = verifyToken(token);
    if (!decoded || decoded.purpose === 'set_password' || (!decoded.sub && !decoded.userId)) {
      throw new Error('Unauthorized');
    }
    const userId = decoded.sub || decoded.userId;
    if (allowedRoles && (!decoded.role || !allowedRoles.includes(decoded.role))) {
      throw new Error('Forbidden');
    }
    return { userId, role: decoded.role, token: decoded };
  } catch (error) {
    if (error.message === 'Forbidden') throw error;
    throw new Error('Unauthorized');
  }
}

module.exports = {
  signToken,
  signLoginToken,
  signSetupToken,
  verifyToken,
  hashPassword,
  comparePassword,
  requireAuth,
};
