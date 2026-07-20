const mongoose = require('mongoose');
const { getRedisClient } = require('../configs/redis');

const SERVICE_NAME = 'smart-ai-backend';

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

  if (!client || !client.isOpen) {
    return { status: 'down', responseTimeMs: Date.now() - start };
  }

  try {
    await client.ping();
    return { status: 'up', responseTimeMs: Date.now() - start };
  } catch {
    return { status: 'down', responseTimeMs: Date.now() - start };
  }
};

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

  return {
    success: allUp,
    status: allUp ? 'healthy' : 'unhealthy',
    service: SERVICE_NAME,
    environment: process.env.NODE_ENV || 'development',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
    dependencies: { mongodb, redis, ai },
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
  const allUp = mongodb.status === 'up' && redis.status === 'up';

  return {
    success: allUp,
    status: allUp ? 'ready' : 'not_ready',
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
