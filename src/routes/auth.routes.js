// src/routes/auth.routes.js
const router = require("express").Router();
const ctrl   = require("../controllers/auth.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { validate }    = require("../middleware/validation.middleware");
const { authLimiter } = require("../middleware/rateLimiter.middleware");
const { registerSchema, loginSchema, verifyOtpSchema, refreshTokenSchema } = require("../validators/auth.validator");

router.post("/register",    authLimiter, validate(registerSchema),    ctrl.register);
router.post("/verify-otp",  authLimiter, validate(verifyOtpSchema),   ctrl.verifyOtp);
router.post("/resend-otp",  authLimiter, ctrl.resendOtp);
router.post("/login",       authLimiter, validate(loginSchema),       ctrl.login);
router.post("/refresh",     validate(refreshTokenSchema),             ctrl.refreshToken);
router.post("/logout",      requireAuth, ctrl.logout);
router.get("/me",           requireAuth, ctrl.getMe);
router.patch("/profile",    requireAuth, ctrl.updateProfile);

module.exports = router;
