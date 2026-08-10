const mongoose = require('mongoose');
const { getRedisClient, getRedisStatus } = require('../configs/redis');
const { getBullMQHealth } = require('../bullmq/bootstrap');

const SERVICE_NAME = 'smart-ai-backend';

/*
 * Health semantics:
 *
 * - liveness (`/live`): the process is up — no dependency checks.
 * - health (`/health`): 200 healthy only when MongoDB AND Redis are up; 503
 *   otherwise. Informational summary of all services.
 * - readiness (`/ready`): MongoDB is the critical dependency (persistent source
 *   of truth). Redis is treated as non-critical for serving: core HTTP flows,
 *   Mongo-backed CRUD, chat (with local dedup fallback) all continue while
 *   Redis is down. Therefore:
 *     MongoDB down -> not_ready (503)
 *     MongoDB up, Redis down -> degraded (200) — process keeps serving traffic
 *     MongoDB up, Redis up -> ready (200)
 */

const checkMongoDB = async () => {
  const start = Date.now();
  const state = mongoose.connection.readyState;
  const responseTimeMs = Date.now() - start;

  const stateMap = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };

  return {
    status: state === 1 ? 'up' : 'down',
    readyState: stateMap[state] || 'unknown',
    responseTimeMs,
  };
};

const checkRedis = async () => {
  const start = Date.now();
  const client = getRedisClient();

  if (!client) {
    return { status: 'down', responseTimeMs: Date.now() - start };
  }

  if (getRedisStatus() === 'reconnecting') {
    return { status: 'reconnecting', responseTimeMs: Date.now() - start };
  }

  if (!client.isOpen) {
    return { status: 'down', responseTimeMs: Date.now() - start };
  }

  // node-redis keeps isOpen true across reconnects and buffers ping() while not
  // ready; probing a not-ready connection would hang the health probe. Report
  // it as down instead so the probe returns promptly.
  if (client.isReady === false) {
    return { status: 'down', responseTimeMs: Date.now() - start };
  }

  try {
    await client.ping();
    return { status: 'up', responseTimeMs: Date.now() - start };
  } catch {
    return { status: 'down', responseTimeMs: Date.now() - start };
  }
};

const checkBullMQ = () => getBullMQHealth();

const checkAI = () => ({
  openaiConfigured: !!process.env.OPENAI_API_KEY,
  geminiConfigured: !!process.env.GEMINI_API_KEY,
});

const getLivenessData = (req) => ({
  success: true,
  status: 'OK',
  message: 'Smart AI Backend is running',
  service: SERVICE_NAME,
  environment: process.env.NODE_ENV || 'development',
  uptime: process.uptime(),
  uptimeSeconds: Math.floor(process.uptime()),
  timestamp: new Date().toISOString(),
  requestId: req.requestId,
});

const getHealthData = async (req) => {
  const totalStart = Date.now();

  const [mongodb, redis, ai] = await Promise.all([
    checkMongoDB(),
    checkRedis(),
    checkAI(),
  ]);

  const totalDurationMs = Date.now() - totalStart;
  const allUp = mongodb.status === 'up' && redis.status === 'up';

  const bullmq = checkBullMQ();

  return {
    success: allUp,
    status: allUp ? 'healthy' : 'unhealthy',
    service: SERVICE_NAME,
    environment: process.env.NODE_ENV || 'development',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
    dependencies: { mongodb, redis, ai, bullmq },
    totalDurationMs,
  };
};

const getReadinessData = async (req) => {
  const totalStart = Date.now();

  const [mongodb, redis] = await Promise.all([
    checkMongoDB(),
    checkRedis(),
  ]);

  const totalDurationMs = Date.now() - totalStart;

  // MongoDB is the only critical dependency for serving traffic. Redis down
  // degrades a subset of features (cache, dedup cross-instance guarantees,
  // resend throttling) but must not unroute the whole process.
  const mongoReady = mongodb.status === 'up';
  const redisUp = redis.status === 'up';
  const status = mongoReady && redisUp ? 'ready' : mongoReady ? 'degraded' : 'not_ready';

  return {
    success: mongoReady,
    status,
    service: SERVICE_NAME,
    environment: process.env.NODE_ENV || 'development',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
    dependencies: { mongodb, redis },
    totalDurationMs,
  };
};

module.exports = {
  getLivenessData,
  getHealthData,
  getReadinessData,
};
