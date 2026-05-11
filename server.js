const http = require("http");
const app = require("./app");
const config = require("./config");
const logger = require("./src/utils/logger");
const { initSockets } = require("./src/sockets");
const { initQueues } = require("./src/jobs");
const { PrismaClient } = require("@prisma/client");
const Redis = require("ioredis");

const prisma = new PrismaClient();
global.prisma = prisma;

const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});

global.redis = redis;

const server = http.createServer(app);

async function start() {
  try {
    // PostgreSQL
    await prisma.$connect();
    logger.info("✅ PostgreSQL connected");

    // Redis
    try {
      await redis.connect();
      logger.info("✅ Redis connected");
    } catch (err) {
      logger.warn("⚠️ Redis connection failed");
    }

    // Socket.IO
    if (typeof initSockets === "function") {
      initSockets(server);
      logger.info("✅ Socket.IO initialized");
    }

    // Job Queues
    if (typeof initQueues === "function") {
      await initQueues();
      logger.info("✅ Job queues initialized");
    }

    // HTTP Server
    server.listen(config.server.port, () => {
      logger.info(`🚀 Kish AI Backend v3.0 running on port ${config.server.port}`);
      logger.info(`Environment: ${config.env}`);
      logger.info(`Frontend: ${config.server.frontendUrl}`);
    });

    // Graceful Shutdown
    const shutdown = async (signal) => {
      logger.info(`${signal} received — shutting down`);

      server.close(async () => {
        try {
          await prisma.$disconnect();
          redis.disconnect();

          logger.info("✅ Server closed");
          process.exit(0);
        } catch (err) {
          logger.error(err);
          process.exit(1);
        }
      });
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

process.on("unhandledRejection", (reason) => {
  logger.error(reason);
});

process.on("uncaughtException", (err) => {
  logger.error(err);
  process.exit(1);
});

start();
