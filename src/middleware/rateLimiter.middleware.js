// src/middleware/rateLimiter.middleware.js
const rateLimit = require("express-rate-limit");
const config = require("../../config");

const makeRateLimiter = (options) =>
  rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many requests. Please slow down." },
    skip: (req) => req.userFull?.role === "ADMIN",
  });

const authLimiter    = makeRateLimiter(config.rateLimits.auth);
const chatLimiter    = makeRateLimiter(config.rateLimits.chat);
const paymentLimiter = makeRateLimiter(config.rateLimits.payment);
const supportLimiter = makeRateLimiter(config.rateLimits.support);
const generalLimiter = makeRateLimiter(config.rateLimits.general);

module.exports = { authLimiter, chatLimiter, paymentLimiter, supportLimiter, generalLimiter };
