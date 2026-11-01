const crypto = require('crypto');
const { AuthCode, User } = require('../models');
const { RULES } = require('../models/constants');

function getSecret() {
  const secret = process.env.AUTH_CODE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_CODE_SECRET must be set to at least 32 characters');
  }
  if (secret === process.env.JWT_SECRET) {
    throw new Error('AUTH_CODE_SECRET must differ from JWT_SECRET');
  }
  return secret;
}

function hashCode(code) {
  return crypto.createHmac('sha256', getSecret()).update(code).digest('hex');
}

function createPlainCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

async function createCode(userId, purpose) {
  await AuthCode.deleteMany({ userId, purpose, usedAt: null });
  const code = createPlainCode();
  const ttl = purpose === 'invite'
    ? RULES.INVITE_TTL_DAYS * 24 * 60 * 60 * 1000
    : RULES.RESET_TTL_MINUTES * 60 * 1000;
  const authCode = await AuthCode.create({
    userId,
    purpose,
    otpHash: hashCode(code),
    expiresAt: new Date(Date.now() + ttl),
    attempts: 0,
  });
  return { code, authCode };
}

async function findCode(email, code, purpose) {
  if (typeof email !== 'string' || typeof code !== 'string') return null;
  const user = await User.findOne({ email: email.trim().toLowerCase() });
  if (!user) return null;
  const authCode = await AuthCode.findOne({
    userId: user._id,
    purpose,
    usedAt: null,
    expiresAt: { $gt: new Date() },
    attempts: { $lt: RULES.MAX_CODE_ATTEMPTS },
  }).sort({ createdAt: -1 });
  if (!authCode) return null;

  const supplied = Buffer.from(hashCode(code.trim()), 'hex');
  const stored = Buffer.from(authCode.otpHash, 'hex');
  const matches = supplied.length === stored.length && crypto.timingSafeEqual(supplied, stored);
  if (!matches) {
    await AuthCode.updateOne({ _id: authCode._id }, { $inc: { attempts: 1 } });
    return null;
  }
  return { user, authCode };
}

async function consumeCode(codeId) {
  return AuthCode.findOneAndUpdate(
    { _id: codeId, usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { new: true }
  );
}

module.exports = { createCode, findCode, consumeCode };
