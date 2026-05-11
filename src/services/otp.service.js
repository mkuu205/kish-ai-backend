// src/services/otp.service.js
const crypto = require("crypto");
const config = require("../../config");
const logger = require("../utils/logger");

const OTP_PREFIX = "otp:";
const TTL = config.otp.expiryMinutes * 60;

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function createOTP(email) {
  const code = generateCode();
  const key  = `${OTP_PREFIX}${email.toLowerCase()}`;
  const data = JSON.stringify({ code, attempts: 0, createdAt: Date.now() });
  await global.redis.setex(key, TTL, data);
  logger.debug({ email }, "OTP created");
  return code;
}

async function verifyOTP(email, inputCode) {
  const key  = `${OTP_PREFIX}${email.toLowerCase()}`;
  const raw  = await global.redis.get(key);

  if (!raw) return { valid: false, reason: "OTP expired or not found. Request a new code." };

  const entry = JSON.parse(raw);
  entry.attempts = (entry.attempts || 0) + 1;

  if (entry.attempts > config.otp.maxAttempts) {
    await global.redis.del(key);
    return { valid: false, reason: "Too many attempts. Request a new code." };
  }

  if (entry.code !== inputCode.trim()) {
    // Save updated attempt count
    const remaining = TTL - Math.floor((Date.now() - entry.createdAt) / 1000);
    if (remaining > 0) await global.redis.setex(key, remaining, JSON.stringify(entry));
    return { valid: false, reason: `Invalid code. ${config.otp.maxAttempts - entry.attempts} attempts remaining.` };
  }

  await global.redis.del(key);
  return { valid: true };
}

async function invalidateOTP(email) {
  await global.redis.del(`${OTP_PREFIX}${email.toLowerCase()}`);
}

module.exports = { createOTP, verifyOTP, invalidateOTP };
