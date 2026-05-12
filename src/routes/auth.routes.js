const express = require("express");
const router = express.Router();

const {
  register,
  login,
  verifyOtp,
  refreshToken,
  getMe,
} = require("../controllers/auth.controller");

const {
  validateRegister,
  validateLogin,
  validateVerifyOTP,
} = require("../validators/auth.validator");

const {
  authLimiter,
} = require("../middleware/rateLimiter.middleware");

const {
  auth,
} = require("../middleware/auth.middleware");

// Register
router.post(
  "/register",
  authLimiter,
  validateRegister,
  register
);

// Login
router.post(
  "/login",
  authLimiter,
  validateLogin,
  login
);

// Verify OTP
router.post(
  "/verify-otp",
  authLimiter,
  validateVerifyOTP,
  verifyOtp
);

// Refresh token
router.post(
  "/refresh",
  refreshToken
);

// Current user
router.get(
  "/me",
  auth,
  getMe
);

module.exports = router;
