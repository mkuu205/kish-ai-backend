// src/middleware/error.middleware.js
const logger = require("../utils/logger");

const notFoundHandler = (req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found.` });
};

const errorHandler = (err, req, res, next) => {
  logger.error({ err, req: { method: req.method, url: req.url, body: req.body } }, "Unhandled error");

  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ success: false, message: "Invalid JSON body." });
  }
  if (err.code === "P2002") {
    return res.status(409).json({ success: false, message: "Resource already exists." });
  }
  if (err.code === "P2025") {
    return res.status(404).json({ success: false, message: "Resource not found." });
  }

  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({
    success: false,
    message: statusCode < 500 ? err.message : "Internal server error.",
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
};

module.exports = { notFoundHandler, errorHandler };
