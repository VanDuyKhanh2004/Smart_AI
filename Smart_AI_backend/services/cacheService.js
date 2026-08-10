const { getRedisClient } = require('../configs/redis');

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
    console.error('Cache get error:', error.message);
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
    console.error('Cache set error:', error.message);
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
    console.error('Cache del error:', error.message);
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
    console.error('Cache exists error:', error.message);
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
    console.error('Cache invalidatePattern error:', error.message);
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
