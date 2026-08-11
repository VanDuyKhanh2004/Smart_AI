const { getRedisClient } = require('../configs/redis');
const logger = require('../utils/logger');

// node-redis keeps isOpen true across reconnects and (without disableOfflineQueue)
// buffers commands while not ready. Fail-open consumers must not wait forever on
// a Redis that is momentarily unready, so treat non-ready clients as absent.
const getReadyClient = () => {
  const client = getRedisClient();
  if (!client || client.isOpen !== true || client.isReady !== true) {
    return null;
  }
  return client;
};

const get = async (key) => {
  try {
    const client = getReadyClient();
    if (!client) {
      return null;
    }

    const value = await client.get(key);
    if (value === null) {
      return null;
    }

    return JSON.parse(value);
  } catch (error) {
    logger.warn({ err: { message: error.message }, key, scope: 'cache:get' }, 'Cache get error');
    return null;
  }
};

const set = async (key, value, ttlSeconds = 300) => {
  try {
    const client = getReadyClient();
    if (!client) {
      return;
    }

    await client.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    logger.warn({ err: { message: error.message }, key, scope: 'cache:set' }, 'Cache set error');
  }
};

const del = async (key) => {
  try {
    const client = getReadyClient();
    if (!client) {
      return;
    }

    await client.del(key);
  } catch (error) {
    logger.warn({ err: { message: error.message }, key, scope: 'cache:del' }, 'Cache del error');
  }
};

const exists = async (key) => {
  try {
    const client = getReadyClient();
    if (!client) {
      return false;
    }

    const result = await client.exists(key);
    return result === 1;
  } catch (error) {
    logger.warn({ err: { message: error.message }, key, scope: 'cache:exists' }, 'Cache exists error');
    return false;
  }
};

const invalidatePattern = async (pattern) => {
  try {
    const client = getReadyClient();
    if (!client) {
      return 0;
    }

    let cursor = '0';
    let deletedCount = 0;

    do {
      const result = await client.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = result.cursor;
      const keys = result.keys;

      if (keys.length > 0) {
        await client.del(keys);
        deletedCount += keys.length;
      }
    } while (cursor !== '0');

    return deletedCount;
  } catch (error) {
    logger.warn({ err: { message: error.message }, pattern, scope: 'cache:invalidatePattern' }, 'Cache invalidatePattern error');
    return 0;
  }
};

module.exports = {
  get,
  set,
  del,
  exists,
  invalidatePattern,
};
