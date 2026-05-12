const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const pinoHttp = require("pino-http");

const logger = require("./src/utils/logger");
const config = require("./config");

const authRoutes    = require("./src/routes/auth.routes");
const chatRoutes    = require("./src/routes/chat.routes");
const paymentRoutes = require("./src/routes/payment.routes");
const userRoutes    = require("./src/routes/user.routes");

const {
  errorHandler,
  notFoundHandler,
} = require("./src/middleware/error.middleware");

const app = express();
app.set("trust proxy", 1);

// ─────────────────────────────────────────────────────────────
// Security
// ─────────────────────────────────────────────────────────────

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// ─────────────────────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────────────────────

app.use(
  cors({
    origin: [
      config.server.frontendUrl,
      "http://localhost:3000",
      "http://localhost:3001",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
    ],
  })
);

// ─────────────────────────────────────────────────────────────
// Stripe Webhook Raw Body
// ─────────────────────────────────────────────────────────────

app.use(
  "/api/v1/payments/stripe/webhook",
  express.raw({ type: "application/json" })
);

app.use(
  "/api/v1/payments/mpesa/callback",
  express.json()
);

// ─────────────────────────────────────────────────────────────
// Body Parsing
// ─────────────────────────────────────────────────────────────

app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

app.use(compression());

// ─────────────────────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────────────────────

if (config.isDev) {
  app.use(
    pinoHttp({
      logger,
      useLevel: "debug",
      quietReqLogger: true,
    })
  );
}

// ─────────────────────────────────────────────────────────────
// Health Check
// ─────────────────────────────────────────────────────────────

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    version: "3.0.0",
    env: config.env,
    ts: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────────────────────────

app.use("/api/v1/auth",     authRoutes);
app.use("/api/v1/chat",     chatRoutes);
app.use("/api/v1/payment",  paymentRoutes);
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/user",     userRoutes);

// ─────────────────────────────────────────────────────────────
// Error Handlers
// ─────────────────────────────────────────────────────────────

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
