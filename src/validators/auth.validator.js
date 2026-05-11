const { z } = require("zod");

// ─────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────

const registerSchema = z.object({
  name: z.string().min(2).max(50).trim(),
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(8).max(100),
});

const loginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1),
});

const verifyOtpSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  otp: z.string().length(6).regex(/^\d{6}$/),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

// ─────────────────────────────────────────────
// Validator Middleware
// ─────────────────────────────────────────────

function validate(schema) {
  return (req, res, next) => {
    try {
      schema.parse(req.body);
      next();
    } catch (err) {
      return res.status(400).json({
        success: false,
        errors: err.errors || err.message,
      });
    }
  };
}

const validateRegister = validate(registerSchema);
const validateLogin = validate(loginSchema);
const validateVerifyOTP = validate(verifyOtpSchema);

// ─────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────

module.exports = {
  registerSchema,
  loginSchema,
  verifyOtpSchema,
  refreshTokenSchema,

  validateRegister,
  validateLogin,
  validateVerifyOTP,
};
