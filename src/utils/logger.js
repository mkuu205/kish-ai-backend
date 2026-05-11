const pino = require('pino');
const path = require('path');
const redisConfig = require('../config/redis');
// Create logs directory if it doesn't exist
const fs = require('fs');
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Configure logger based on environment
const isProduction = config.env === 'production';

// Create logger instance
const logger = pino({
  level: isProduction ? 'info' : 'debug',
  transport: !isProduction
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: {
    env: config.env,
    service: 'kish-ai-backend',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Create a child logger for specific modules
const createChildLogger = (module) => {
  return logger.child({ module });
};

module.exports = {
  logger,
  createChildLogger,
};
