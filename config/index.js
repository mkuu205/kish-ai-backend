require("dotenv").config();

const redis = require("./redis");

module.exports = {
  env: process.env.NODE_ENV || "development",

  isDev: process.env.NODE_ENV !== "production",

  server: {
    port: process.env.PORT || 5000,
    frontendUrl: process.env.FRONTEND_URL || "https://kish-ai.vercel.app/",
  },

  redis,

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
  },

  otp: {
    expiryMinutes: 10,
  },

  rateLimits: {
    auth: {
      windowMs: 15 * 60 * 1000,
      max: 20,
    },

    api: {
      windowMs: 15 * 60 * 1000,
      max: 100,
    },
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  },

  payhero: {
    username: process.env.PAYHERO_USERNAME || "",
    password: process.env.PAYHERO_PASSWORD || "",
  },

  email: {
    service: process.env.EMAIL_SERVICE || "gmail",
    user: process.env.EMAIL_USER || "",
    pass: process.env.EMAIL_PASS || "",
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER || "",
  },

  jwt: {
  accessSecret: process.env.JWT_ACCESS_SECRET || "super-secret-access-key",
  refreshSecret: process.env.JWT_REFRESH_SECRET || "super-secret-refresh-key",
  accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
},

  plans: {
    free: {
      messagesPerDay: 10,
      maxTokens: 1024,
      webSearch: false,
      imageUpload: false,
      customPersona: false,
      modes: ["general"],
    },
    pro: {
      messagesPerDay: Infinity,
      maxTokens: 4096,
      webSearch: true,
      imageUpload: true,
      customPersona: true,
      modes: ["general", "code", "research", "creative", "tutor"],
    },
    enterprise: {
      messagesPerDay: Infinity,
      maxTokens: 8192,
      webSearch: true,
      imageUpload: true,
      customPersona: true,
      modes: ["general", "code", "research", "creative", "tutor"],
    },
  },
  
  database: {
    url: process.env.DATABASE_URL || "",
  },
};
