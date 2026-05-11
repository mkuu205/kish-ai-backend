require("dotenv").config();

const config = {
  env: process.env.NODE_ENV || "development",
  isDev: process.env.NODE_ENV !== "production",
  isProd: process.env.NODE_ENV === "production",

  server: {
    port: parseInt(process.env.PORT || "3001"),
    frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
    backendUrl: process.env.BACKEND_URL || "http://localhost:3001",
  },

  db: {
    url: process.env.DATABASE_URL,
  },

  redis: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || "change_this_access_secret",
    refreshSecret: process.env.JWT_REFRESH_SECRET || "change_this_refresh_secret",
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES || "15m",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES || "30d",
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    proPriceId: process.env.STRIPE_PRO_PRICE_ID,
  },

  payhero: {
    username: process.env.PAYHERO_USERNAME,
    password: process.env.PAYHERO_PASSWORD,
    channelId: parseInt(process.env.PAYHERO_CHANNEL_ID || "0"),
    baseUrl: "https://backend.payhero.co.ke/api/v2",
    mpesaAmount: parseInt(process.env.MPESA_PRO_AMOUNT || "1200"),
  },

  email: {
    service: process.env.EMAIL_SERVICE || "gmail",
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
    from: process.env.EMAIL_FROM || `"Kish AI" <${process.env.EMAIL_USER}>`,
  },

  admin: {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  },

  otp: {
    expiryMinutes: 10,
    maxAttempts: 5,
  },

  plans: {
    free: {
      messagesPerDay: 10,
      maxTokens: 500,
      webSearch: false,
      imageUpload: false,
      modes: ["general"],
      customPersona: false,
      maxConversations: 10,
    },
    pro: {
      messagesPerDay: Infinity,
      maxTokens: 2000,
      webSearch: true,
      imageUpload: true,
      modes: ["general", "research", "creative", "coder", "vision"],
      customPersona: true,
      maxConversations: Infinity,
    },
  },

  rateLimits: {
    auth: { windowMs: 15 * 60 * 1000, max: 20 },
    chat: { windowMs: 60 * 1000, max: 30 },
    payment: { windowMs: 60 * 60 * 1000, max: 10 },
    support: { windowMs: 60 * 1000, max: 20 },
    general: { windowMs: 60 * 1000, max: 100 },
  },
};

// Validate critical config
const required = [
  ["ANTHROPIC_API_KEY", config.anthropic.apiKey],
  ["DATABASE_URL", config.db.url],
  ["JWT_ACCESS_SECRET", config.jwt.accessSecret],
];

if (config.isProd) {
  required.forEach(([name, val]) => {
    if (!val || val.includes("change_this")) {
      throw new Error(`Missing required env var: ${name}`);
    }
  });
}

module.exports = config;
