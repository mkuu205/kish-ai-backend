const http    = require("http");
const app     = require("./app");
const config  = require("./config");
const logger  = require("./utils/logger");
const { initSockets } = require("./sockets");
const { initQueues }  = require("./jobs");
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
    // Connect to PostgreSQL
    await prisma.$connect();
    logger.info("✅ PostgreSQL connected");

    // Connect to Redis
    await redis.connect().catch(() => {}); // ioredis auto-connects
    logger.info("✅ Redis connected");

    // Init Socket.IO
    initSockets(server);
    logger.info("✅ Socket.IO initialized");

    // Init BullMQ job queues
    await initQueues();
    logger.info("✅ Job queues initialized");

    // Start HTTP server
    server.listen(config.server.port, () => {
      logger.info(`🚀 Kish AI Backend v3.0 running on port ${config.server.port}`);
      logger.info(`   Env      : ${config.env}`);
      logger.info(`   Frontend : ${config.server.frontendUrl}`);
      logger.info(`   Claude   : ${config.anthropic.apiKey ? "✅" : "❌ missing"}`);
      logger.info(`   Stripe   : ${config.stripe.secretKey ? "✅" : "❌ missing"}`);
      logger.info(`   PayHero  : ${config.payhero.username ? "✅" : "❌ missing"}`);
      logger.info(`   Email    : ${config.email.user ? "✅" : "❌ missing"}`);
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`${signal} received — shutting down gracefully`);
      server.close(async () => {
        await prisma.$disconnect();
        redis.disconnect();
        logger.info("Server closed");
        process.exit(0);
      });
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT",  () => shutdown("SIGINT"));

  } catch (err) {
    logger.error({ err }, "Failed to start server");
    process.exit(1);
  }
}

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled Promise Rejection");
});
process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught Exception");
  process.exit(1);
});

start();
