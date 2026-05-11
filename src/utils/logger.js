// src/utils/logger.js
const pino = require("pino");
const config = require("../config");

const logger = pino({
  level: config.isDev ? "debug" : "info",
  transport: config.isDev
    ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" } }
    : undefined,
  base: { service: "kish-ai-backend", env: config.env },
  redact: ["req.headers.authorization", "body.password", "body.otp"],
});

module.exports = logger;
