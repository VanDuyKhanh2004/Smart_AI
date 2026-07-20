const { getBullMQConfig } = require('./queueConnection');

const getDefaultJobOptions = () => {
  const { defaultAttempts } = getBullMQConfig();

  return {
    attempts: defaultAttempts,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: {
      count: 100,
      age: 3600 * 24,
    },
    removeOnFail: {
      count: 50,
      age: 3600 * 24 * 7,
    },
  };
};

const mergeJobOptions = (overrides = {}) => {
  return { ...getDefaultJobOptions(), ...overrides };
};

module.exports = {
  getDefaultJobOptions,
  mergeJobOptions,
};
