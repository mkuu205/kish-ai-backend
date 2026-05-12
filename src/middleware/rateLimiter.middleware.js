const rateLimit = require("express-rate-limit");
const config = require("../../config");

function makeRateLimiter(options = {}) {
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000,
    max: options.max || 100,
    standardHeaders: true,
    legacyHeaders: false,

    message: {
      success: false,
      message: "Too many requests, please try again later.",
    },
  });
}

const authLimiter = makeRateLimiter(config.rateLimits?.auth);

const apiLimiter = makeRateLimiter(config.rateLimits?.api);

const chatLimiter = makeRateLimiter({ windowMs: 60 * 1000, max: 30 });

module.exports = {
  authLimiter,
  apiLimiter,
  chatLimiter,
  makeRateLimiter,
};
