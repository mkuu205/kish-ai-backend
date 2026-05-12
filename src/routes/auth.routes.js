const express = require("express");

const router = express.Router();

const {
  register,
  login,
  verifyOtp,
  refreshToken,
} = require("../controllers/auth.controller");

const {
  validateRegister,
  validateLogin,
  validateVerifyOTP,
} = require("../validators/auth.validator");

const {
  authLimiter,
} = require("../middleware/rateLimiter.middleware");

const authMiddleware = require("../middleware/auth.middleware");

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

// Refresh Token
router.post(
  "/refresh",
  refreshToken
);

// CURRENT USER
router.get(
  "/me",
  authMiddleware,
  async (req, res) => {
    res.json({
      success: true,
      user: req.user,
    });
  }
);

module.exports = router;
