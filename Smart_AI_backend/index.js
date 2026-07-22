const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
require("dotenv").config();

const logger = require("./utils/logger");
const correlationId = require("./middlewares/correlationId");
const requestLogger = require("./middlewares/requestLogger");

const { connectDatabase } = require("./configs/database");
const { connectRedis } = require("./configs/redis");
const {
  initializeSocketHandlers,
  getSocketStats,
  shutdownSocketIO,
} = require("./socket/socketHandler");

// Import routes
const productRoutes = require("./routes/productRoutes");
const complaintRoutes = require("./routes/complaintRoutes");
const authRoutes = require("./routes/authRoutes");
const cartRoutes = require("./routes/cartRoutes");
const orderRoutes = require("./routes/orderRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const wishlistRoutes = require("./routes/wishlistRoutes");
const compareRoutes = require("./routes/compareRoutes");
const qaRoutes = require("./routes/qaRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const addressRoutes = require("./routes/addressRoutes");
const profileRoutes = require("./routes/profileRoutes");
const promotionRoutes = require("./routes/promotionRoutes");
const storeRoutes = require("./routes/storeRoutes");
const appointmentRoutes = require("./routes/appointmentRoutes");
const path = require("path");

const { startBullMQ, stopBullMQ } = require("./bullmq/bootstrap");
const { shutdownStep } = require("./utils/shutdown");
const sanitizeUrl = require("./utils/sanitizeUrl");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;

const io = socketIo(server, {
  cors: {
    origin:
      process.env.NODE_ENV === "production"
        ? process.env.FRONTEND_URL || "http://localhost:3000"
        : "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// Correlation ID must run first so all downstream middleware/routes have req.requestId
app.use(correlationId);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? process.env.FRONTEND_URL || "http://localhost:3000"
        : "*",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID", "Idempotency-Key"],
  }),
);

// Request logger captures every response after parsers have run
app.use(requestLogger);

/* ============================================================
   Basic Routes
============================================================ */

const healthRoutes = require("./routes/healthRoutes");
const { live } = require("./controllers/healthController");

// Home
app.get("/", (req, res) => {
  res.json({
    project: "Smart AI Backend",
    status: "Running",
    version: "1.0.0",
    documentation: "/api/info",
    health: "/health",
    timestamp: new Date().toISOString(),
  });
});

// Liveness
app.get("/health", live);

// API Information
app.get("/api/info", (req, res) => {
  res.json({
    project: "Smart AI",
    version: "1.0.0",
    author: "VanDuyKhanh2004",
    environment: process.env.NODE_ENV || "development",
    socket: "Enabled",
    database: "MongoDB",
    routes: [
      "/api/auth",
      "/api/products",
      "/api/cart",
      "/api/orders",
      "/api/reviews",
      "/api/wishlist",
      "/api/compare",
      "/api/questions",
      "/api/dashboard",
      "/api/addresses",
      "/api/profile",
      "/api/promotions",
      "/api/stores",
      "/api/appointments",
    ],
  });
});

// Development Socket Test Page
app.get("/test-chat", (req, res) => {
  res.sendFile(__dirname + "/test-chat.html");
});

/* ============================================================
   API Routes
============================================================ */

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/complaints", complaintRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/compare", compareRoutes);
app.use("/api/questions", qaRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/promotions", promotionRoutes);
app.use("/api/stores", storeRoutes);
app.use("/api/appointments", appointmentRoutes);

// Static Files
app.use(
  "/uploads/avatars",
  express.static(path.join(__dirname, "uploads/avatars")),
);

/* ============================================================
   Error Handling
============================================================ */

app.use((err, req, res, next) => {
  const log = req.logger || logger;
  const sanitized = sanitizeUrl(req.originalUrl);
  log.error({ err }, 'Unhandled error on %s %s', req.method, sanitized);

  res.status(err.status || 500).json({
    error: {
      message: err.message || "Internal Server Error",
      status: err.status || 500,
      timestamp: new Date().toISOString(),
    },
  });
});

  app.use("*", (req, res) => {
    const log = req.logger || logger;
    const sanitized = sanitizeUrl(req.originalUrl);
    log.warn({ requestId: req.requestId }, 'Route not found: %s %s', req.method, sanitized);
    const qIndex = req.originalUrl.indexOf('?');
    const pathname = qIndex === -1 ? req.originalUrl : req.originalUrl.slice(0, qIndex);
    res.status(404).json({
      error: {
        message: `Route ${pathname} not found`,
        status: 404,
        timestamp: new Date().toISOString(),
      },
    });
  });

let shuttingDown = false;

const gracefulShutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Graceful shutdown initiated');

  // 1. BullMQ: workers first, queues second
  await shutdownStep('BullMQ', () => stopBullMQ());

  // 2. Socket.IO
  await shutdownStep('Socket.IO', () => {
    return typeof shutdownSocketIO === 'function'
      ? shutdownSocketIO()
      : Promise.resolve();
  });

  // 3. HTTP server
  await shutdownStep('HTTP server', () => {
    return new Promise((resolve) => server.close(resolve));
  });

  // 4. Redis cache
  await shutdownStep('Redis', async () => {
    const { disconnectRedis } = require('./configs/redis');
    await disconnectRedis();
  });

  // 5. MongoDB
  await shutdownStep('MongoDB', async () => {
    const { disconnectDatabase } = require('./configs/database');
    await disconnectDatabase();
  });

  // 6. Flush logger before exit
  await shutdownStep('Logger flush', async () => {
    if (typeof logger.flush === 'function') {
      logger.flush();
    }
  });

  logger.info({ signal }, 'Graceful shutdown complete');
  process.exit(0);
};

const initializeServer = async () => {
  try {
    const env = process.env.NODE_ENV || 'development';
    logger.info({ env }, 'Starting Smart AI Backend');

    logger.info('Connecting to MongoDB...');
    await connectDatabase();

    logger.info('Connecting to Redis...');
    await connectRedis();

    await startBullMQ();

    initializeSocketHandlers(io);

    server.listen(PORT, () => {
      const BASE_URL =
        process.env.NODE_ENV === "production"
          ? process.env.RENDER_EXTERNAL_URL || `PORT ${PORT}`
          : `http://localhost:${PORT}`;

      logger.info(
        { port: PORT, env, url: BASE_URL },
        'Smart AI Backend started',
      );
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server');
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled rejection');
});

initializeServer();

module.exports = {
  app,
  server,
  io,
};
