// src/validators/auth.validator.js
const { z } = require("zod");

const registerSchema = z.object({
  name    : z.string().min(2).max(50).trim(),
  email   : z.string().email().toLowerCase().trim(),
  password: z.string().min(8).max(100),
});

const loginSchema = z.object({
  email   : z.string().email().toLowerCase().trim(),
  password: z.string().min(1),
});

const verifyOtpSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  otp  : z.string().length(6).regex(/^\d{6}$/),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

module.exports = { registerSchema, loginSchema, verifyOtpSchema, refreshTokenSchema };
