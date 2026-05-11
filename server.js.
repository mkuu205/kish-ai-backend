const express = require("express");
const cors    = require("cors");
const helmet  = require("helmet");
const compression = require("compression");
const pinoHttp = require("pino-http");
const logger  = require("./utils/logger");
const config  = require("./config");
const routes  = require("./routes");
const { errorHandler, notFoundHandler } = require("./middleware/error.middleware");

const app = express();

// ── Security ─────────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: [config.server.frontendUrl, "http://localhost:3000", "http://localhost:3001"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
}));

// ── Stripe webhook needs raw body — mount BEFORE express.json() ───────────────
app.use("/api/v1/payments/stripe/webhook", express.raw({ type: "application/json" }));
app.use("/api/v1/payments/mpesa/callback", express.json());

// ── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));
app.use(compression());

// ── Request logging ───────────────────────────────────────────────────────────
if (config.isDev) {
  app.use(pinoHttp({ logger, useLevel: "debug", quietReqLogger: true }));
}

// ── Health check (public) ────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", version: "3.0.0", ts: new Date().toISOString(), env: config.env });
});

// ── API Routes ───────────────────────────────────────────────────────────────
app.use("/api/v1", routes);

// ── 404 + Error handlers ─────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
