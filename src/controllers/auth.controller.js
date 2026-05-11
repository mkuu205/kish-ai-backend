
// src/controllers/auth.controller.js
const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const config = require("../../config");
const R       = require("../utils/response");
const logger  = require("../utils/logger");
const otpSvc  = require("../services/otp.service");
const emailSvc = require("../services/email.service");
const { addEmailJob } = require("../jobs");

// ── Token helpers ─────────────────────────────────────────────────────────────
function signAccessToken(payload) {
  return jwt.sign(payload, config.jwt.accessSecret, { expiresIn: config.jwt.accessExpiresIn });
}
function signRefreshToken(payload) {
  return jwt.sign(payload, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiresIn });
}
function parseRefreshExpiry() {
  const d = config.jwt.refreshExpiresIn;
  if (d.endsWith("d")) return parseInt(d) * 24 * 60 * 60 * 1000;
  if (d.endsWith("h")) return parseInt(d) * 60 * 60 * 1000;
  return 30 * 24 * 60 * 60 * 1000;
}

// ── POST /api/v1/auth/register ───────────────────────────────────────────────
const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    const existing = await global.prisma.user.findUnique({ where: { email } });
    if (existing && existing.verified) {
      return R.error(res, "An account with this email already exists.", 409);
    }

    const hashed = await bcrypt.hash(password, 12);

    const user = existing
      ? await global.prisma.user.update({ where: { email }, data: { name: name.trim(), password: hashed } })
      : await global.prisma.user.create({ data: { name: name.trim(), email, password: hashed, plan: "FREE", role: "USER", verified: false } });

    const code = await otpSvc.createOTP(email);

    // Queue email
    await addEmailJob({ type: "otp", to: email, name: name.trim(), code });

    await global.prisma.activityLog.create({
      data: { userId: user.id, type: "register", data: { email }, ipAddress: req.ip },
    });

    logger.info({ email }, "User registered");
    return R.created(res, { email, pendingVerification: true }, "Verification code sent to your email.");
  } catch (err) { next(err); }
};

// ── POST /api/v1/auth/verify-otp ────────────────────────────────────────────
const verifyOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    const result = await otpSvc.verifyOTP(email, otp);
    if (!result.valid) return R.badRequest(res, result.reason);

    const user = await global.prisma.user.update({
      where: { email },
      data: { verified: true, lastActiveAt: new Date() },
    });

    const family = uuidv4();
    const accessToken  = signAccessToken({ id: user.id, email: user.email, role: user.role });
    const refreshToken = signRefreshToken({ id: user.id, family });

    await global.prisma.refreshToken.create({
      data: { token: refreshToken, userId: user.id, family, expiresAt: new Date(Date.now() + parseRefreshExpiry()) },
    });

    await addEmailJob({ type: "welcome", to: email, name: user.name });

    await global.prisma.activityLog.create({
      data: { userId: user.id, type: "email_verified", data: { email }, ipAddress: req.ip },
    });

    // Invalidate user cache
    await global.redis.del(`user:${user.id}`).catch(() => {});

    logger.info({ email }, "Email verified");
    return R.success(res, {
      accessToken, refreshToken,
      user: { id: user.id, name: user.name, email: user.email, plan: user.plan, role: user.role, verified: user.verified },
    }, "Email verified successfully.");
  } catch (err) { next(err); }
};

// ── POST /api/v1/auth/resend-otp ─────────────────────────────────────────────
const resendOtp = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await global.prisma.user.findUnique({ where: { email } });
    if (!user) return R.notFound(res, "Account not found.");
    if (user.verified) return R.badRequest(res, "Account already verified.");

    const code = await otpSvc.createOTP(email);
    await addEmailJob({ type: "otp", to: email, name: user.name, code });

    return R.success(res, {}, "New verification code sent.");
  } catch (err) { next(err); }
};

// ── POST /api/v1/auth/login ──────────────────────────────────────────────────
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await global.prisma.user.findUnique({ where: { email }, include: { subscription: true } });
    if (!user) return R.unauthorized(res, "Invalid email or password.");

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return R.unauthorized(res, "Invalid email or password.");

    if (!user.verified) {
      const code = await otpSvc.createOTP(email);
      await addEmailJob({ type: "otp", to: email, name: user.name, code });
      return R.error(res, "Email not verified. A new code has been sent.", 403, { pendingVerification: true, email });
    }

    await global.prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });

    const family = uuidv4();
    const accessToken  = signAccessToken({ id: user.id, email: user.email, role: user.role });
    const refreshToken = signRefreshToken({ id: user.id, family });

    await global.prisma.refreshToken.create({
      data: { token: refreshToken, userId: user.id, family, expiresAt: new Date(Date.now() + parseRefreshExpiry()) },
    });

    await global.prisma.activityLog.create({
      data: { userId: user.id, type: "login", data: { email }, ipAddress: req.ip },
    });

    logger.info({ email }, "User logged in");
    return R.success(res, {
      accessToken, refreshToken,
      user: { id: user.id, name: user.name, email: user.email, plan: user.plan, role: user.role, verified: user.verified, avatarUrl: user.avatarUrl },
    }, "Logged in successfully.");
  } catch (err) { next(err); }
};

// ── POST /api/v1/auth/refresh ────────────────────────────────────────────────
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken: token } = req.body;
    if (!token) return R.unauthorized(res, "Refresh token required.");

    let payload;
    try { payload = jwt.verify(token, config.jwt.refreshSecret); }
    catch { return R.unauthorized(res, "Invalid or expired refresh token."); }

    const stored = await global.prisma.refreshToken.findUnique({ where: { token }, include: { user: true } });
    if (!stored || stored.revokedAt) return R.unauthorized(res, "Refresh token revoked.");
    if (new Date(stored.expiresAt) < new Date()) {
      await global.prisma.refreshToken.delete({ where: { token } });
      return R.unauthorized(res, "Refresh token expired.");
    }

    // Rotate token
    await global.prisma.refreshToken.update({ where: { token }, data: { revokedAt: new Date() } });

    const newAccess  = signAccessToken({ id: stored.user.id, email: stored.user.email, role: stored.user.role });
    const newRefresh = signRefreshToken({ id: stored.user.id, family: stored.family });

    await global.prisma.refreshToken.create({
      data: { token: newRefresh, userId: stored.user.id, family: stored.family, expiresAt: new Date(Date.now() + parseRefreshExpiry()) },
    });

    return R.success(res, { accessToken: newAccess, refreshToken: newRefresh });
  } catch (err) { next(err); }
};

// ── POST /api/v1/auth/logout ─────────────────────────────────────────────────
const logout = async (req, res, next) => {
  try {
    const { refreshToken: token } = req.body;
    if (token) {
      await global.prisma.refreshToken.updateMany({
        where: { token, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await global.redis.del(`user:${req.user.id}`).catch(() => {});
    return R.success(res, {}, "Logged out successfully.");
  } catch (err) { next(err); }
};

// ── GET /api/v1/auth/me ──────────────────────────────────────────────────────
const getMe = async (req, res, next) => {
  try {
    const user = await global.prisma.user.findUnique({
      where: { id: req.user.id },
      include: { subscription: true },
    });
    if (!user) return R.notFound(res, "User not found.");

    // Reset daily messages if needed
    const now = new Date();
    const reset = new Date(user.dailyResetAt);
    if (now.toDateString() !== reset.toDateString()) {
      await global.prisma.user.update({ where: { id: user.id }, data: { dailyMessages: 0, dailyResetAt: now } });
      user.dailyMessages = 0;
    }

    const limit = config.plans[user.plan.toLowerCase()]?.messagesPerDay;
    const remaining = limit === Infinity ? "unlimited" : Math.max(0, (limit ?? 10) - user.dailyMessages);

    return R.success(res, {
      id: user.id, name: user.name, email: user.email,
      plan: user.plan, role: user.role, verified: user.verified, avatarUrl: user.avatarUrl,
      totalMessages: user.totalMessages, dailyMessages: user.dailyMessages,
      messagesRemaining: remaining,
      subscription: user.subscription,
      planFeatures: config.plans[user.plan.toLowerCase()],
    });
  } catch (err) { next(err); }
};

// ── PATCH /api/v1/auth/profile ───────────────────────────────────────────────
const updateProfile = async (req, res, next) => {
  try {
    const { name, avatarUrl } = req.body;
    const data = {};
    if (name) data.name = name.trim();
    if (avatarUrl !== undefined) data.avatarUrl = avatarUrl;

    const user = await global.prisma.user.update({ where: { id: req.user.id }, data });
    await global.redis.del(`user:${user.id}`).catch(() => {});

    return R.success(res, { name: user.name, avatarUrl: user.avatarUrl }, "Profile updated.");
  } catch (err) { next(err); }
};

module.exports = { register, verifyOtp, resendOtp, login, refreshToken, logout, getMe, updateProfile };
