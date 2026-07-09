const { getRedisClient } = require('../configs/redis');

const get = async (key) => {
  try {
    const client = getRedisClient();
    if (!client?.isOpen) {
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
    const client = getRedisClient();
    if (!client?.isOpen) {
      return;
    }

    await client.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    console.error('Cache set error:', error.message);
  }
};

const del = async (key) => {
  try {
    const client = getRedisClient();
    if (!client?.isOpen) {
      return;
    }

    await client.del(key);
  } catch (error) {
    console.error('Cache del error:', error.message);
  }
};

const exists = async (key) => {
  try {
    const client = getRedisClient();
    if (!client?.isOpen) {
      return false;
    }

    const result = await client.exists(key);
    return result === 1;
  } catch (error) {
    console.error('Cache exists error:', error.message);
    return false;
  }
};

module.exports = {
  get,
  set,
  del,
  exists,
};
