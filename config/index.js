require("dotenv").config();

const redis = require("./redis");

module.exports = {
  env: process.env.NODE_ENV || "development",

  isDev: process.env.NODE_ENV !== "production",

  server: {
    port: process.env.PORT || 5000,
    frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
  },

  redis,

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || "",
  },

  payhero: {
    username: process.env.PAYHERO_USERNAME || "",
  },

  email: {
    user: process.env.EMAIL_USER || "",
  },
};
