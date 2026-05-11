const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const pinoHttp = require("pino-http");

const logger = require("./src/utils/logger");
const config = require("./config");

const routes = require("./src/routes");

const {
  errorHandler,
  notFoundHandler,
} = require("./src/middleware/error.middleware");

const app = express();

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

app.use("/api/v1", routes);

// ─────────────────────────────────────────────────────────────
// Error Handlers
// ─────────────────────────────────────────────────────────────

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
