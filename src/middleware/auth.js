const jwt    = require("jsonwebtoken");
const config = require("../config");
const R      = require("../utils/response");

// ── Verify access token ────────────────────────────────────────────────────────
const requireAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return R.unauthorized(res, "Access token required.");
    }
    const token = header.slice(7);
    const payload = jwt.verify(token, config.jwt.accessSecret);
    req.user = payload;

    // Attach full user from DB (cached via Redis if available)
    const cacheKey = `user:${payload.id}`;
    const cached = await global.redis.get(cacheKey).catch(() => null);
    if (cached) {
      req.userFull = JSON.parse(cached);
    } else {
      const user = await global.prisma.user.findUnique({ where: { id: payload.id }, include: { subscription: true } });
      if (!user || !user.verified) {
        return R.unauthorized(res, user ? "Email not verified." : "User not found.");
      }
      req.userFull = user;
      await global.redis.setex(cacheKey, 60, JSON.stringify(user)).catch(() => {});
    }
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") return R.unauthorized(res, "Access token expired.");
    if (err.name === "JsonWebTokenError")  return R.unauthorized(res, "Invalid access token.");
    next(err);
  }
};

// ── Admin only ─────────────────────────────────────────────────────────────────
const requireAdmin = async (req, res, next) => {
  await requireAuth(req, res, () => {
    if (req.userFull?.role !== "ADMIN") {
      return R.forbidden(res, "Admin access required.");
    }
    next();
  });
};

// ── Support agent or admin ─────────────────────────────────────────────────────
const requireAgent = async (req, res, next) => {
  await requireAuth(req, res, () => {
    const role = req.userFull?.role;
    if (role !== "ADMIN" && role !== "SUPPORT_AGENT") {
      return R.forbidden(res, "Support agent access required.");
    }
    next();
  });
};

// ── Pro plan required ──────────────────────────────────────────────────────────
const requirePro = (req, res, next) => {
  if (req.userFull?.plan !== "PRO" && req.userFull?.plan !== "ENTERPRISE") {
    return R.forbidden(res, "Pro plan required.", 403, { upgrade: true });
  }
  next();
};

module.exports = { requireAuth, requireAdmin, requireAgent, requirePro };
