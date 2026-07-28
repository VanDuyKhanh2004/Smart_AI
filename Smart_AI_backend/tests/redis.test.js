let mockRedisHandlers = {};
const mockRedisClient = {
  isOpen: false,
  connect: jest.fn().mockResolvedValue(undefined),
  quit: jest.fn().mockResolvedValue('OK'),
  on: jest.fn((event, handler) => {
    mockRedisHandlers[event] = handler;
    return mockRedisClient;
  }),
};

jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClient),
}));

jest.mock('pino', () => {
  const mockInstance = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn(() => mockInstance),
  };
  return jest.fn(() => mockInstance);
});

jest.mock('../bullmq/bootstrap', () => ({
  getBullMQHealth: jest.fn(() => ({})),
}));

const getMockLogger = () => require('pino')();

describe('calculateReconnectDelay', () => {
  let redis;

  beforeEach(() => {
    jest.resetModules();
    mockRedisHandlers = {};
    mockRedisClient.connect.mockClear();
    mockRedisClient.quit.mockClear();
    redis = require('../configs/redis');
  });

  it('attempt 0 returns 500 (base delay)', () => {
    expect(redis.calculateReconnectDelay(0)).toBe(500);
  });

  it('attempt 1 returns 1000', () => {
    expect(redis.calculateReconnectDelay(1)).toBe(1000);
  });

  it('attempt 2 returns 2000', () => {
    expect(redis.calculateReconnectDelay(2)).toBe(2000);
  });

  it('attempt 5 returns 16000', () => {
    expect(redis.calculateReconnectDelay(5)).toBe(16000);
  });

  it('attempt 6 returns 30000 (capped)', () => {
    expect(redis.calculateReconnectDelay(6)).toBe(30000);
  });

  it('does not exceed 30000 for high attempts', () => {
    expect(redis.calculateReconnectDelay(20)).toBe(30000);
  });
});

describe('Node Redis reconnectStrategy', () => {
  let redis;

  beforeEach(() => {
    jest.resetModules();
    mockRedisHandlers = {};
    mockRedisClient.connect.mockClear();
    mockRedisClient.quit.mockClear();
    redis = require('../configs/redis');
  });

  it('retries 0 returns 500', () => {
    expect(redis.reconnectStrategy(0)).toBe(500);
  });

  it('retries 1 returns 1000', () => {
    expect(redis.reconnectStrategy(1)).toBe(1000);
  });

  it('retries 2 returns 2000', () => {
    expect(redis.reconnectStrategy(2)).toBe(2000);
  });

  it('retries 6 returns 30000 (capped)', () => {
    expect(redis.reconnectStrategy(6)).toBe(30000);
  });

  it('high retries cap at 30000', () => {
    expect(redis.reconnectStrategy(20)).toBe(30000);
  });

  it('shutdown returns Error with SHUTTING_DOWN', () => {
    redis.setShuttingDown();
    const result = redis.reconnectStrategy(0);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('SHUTTING_DOWN');
  });

  it('logs attempt and delayMs on reconnect', () => {
    const logger = getMockLogger();
    redis.reconnectStrategy(0);
    expect(logger.info).toHaveBeenCalledWith(
      { attempt: 1, delayMs: 500 },
      'Redis reconnect scheduled',
    );
  });

  it('logs shutdown stop', () => {
    const logger = getMockLogger();
    redis.setShuttingDown();
    redis.reconnectStrategy(0);
    expect(logger.warn).toHaveBeenCalledWith(
      'Redis reconnect stopped — shutting down',
    );
  });

  it('does not log REDIS_URL or credentials', () => {
    const logger = getMockLogger();
    redis.reconnectStrategy(0);
    const calls = JSON.stringify(logger.info.mock.calls);
    expect(calls).not.toContain('redis://');
    expect(calls).not.toContain('password');
    expect(calls).not.toContain('REDIS_URL');
  });
});

describe('BullMQ retryStrategy', () => {
  let queueConnection;

  beforeEach(() => {
    jest.resetModules();
    mockRedisHandlers = {};
    queueConnection = require('../queues/queueConnection');
  });

  it('times 1 returns 500 (first retry)', () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    const conn = queueConnection.getBullMQConnection();
    expect(conn.retryStrategy(1)).toBe(500);
  });

  it('times 2 returns 1000', () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    const conn = queueConnection.getBullMQConnection();
    expect(conn.retryStrategy(2)).toBe(1000);
  });

  it('times 3 returns 2000', () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    const conn = queueConnection.getBullMQConnection();
    expect(conn.retryStrategy(3)).toBe(2000);
  });

  it('times 7 returns 30000 (capped)', () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    const conn = queueConnection.getBullMQConnection();
    expect(conn.retryStrategy(7)).toBe(30000);
  });

  it('shutdown returns null', () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    const { setShuttingDown } = require('../configs/redis');
    setShuttingDown();
    const conn = queueConnection.getBullMQConnection();
    expect(conn.retryStrategy(1)).toBeNull();
  });

  it('logs attempt and delayMs on reconnect', () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    const logger = getMockLogger();
    const conn = queueConnection.getBullMQConnection();
    conn.retryStrategy(1);
    expect(logger.info).toHaveBeenCalledWith(
      { attempt: 1, delayMs: 500 },
      'BullMQ Redis reconnect scheduled',
    );
  });

  it('logs shutdown stop', () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    const logger = getMockLogger();
    const { setShuttingDown } = require('../configs/redis');
    setShuttingDown();
    const conn = queueConnection.getBullMQConnection();
    conn.retryStrategy(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'BullMQ Redis reconnect stopped — shutting down',
    );
  });

  it('does not log REDIS_URL or credentials in reconnect logs', () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    const logger = getMockLogger();
    const conn = queueConnection.getBullMQConnection();
    conn.retryStrategy(1);
    const calls = JSON.stringify(logger.info.mock.calls);
    expect(calls).not.toContain('redis://');
    expect(calls).not.toContain('password');
    expect(calls).not.toContain('REDIS_URL');
  });

  it('getBullMQConnection includes retryStrategy', () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    const conn = queueConnection.getBullMQConnection();
    expect(conn).toHaveProperty('url', 'redis://localhost:6379');
    expect(conn).toHaveProperty('retryStrategy');
    expect(typeof conn.retryStrategy).toBe('function');
  });

  it('getBullMQConnection throws without REDIS_URL', () => {
    delete process.env.REDIS_URL;
    expect(() => queueConnection.getBullMQConnection()).toThrow();
  });
});

describe('Status transitions', () => {
  let redis;

  beforeEach(() => {
    jest.resetModules();
    mockRedisHandlers = {};
    mockRedisClient.connect.mockClear();
    mockRedisClient.quit.mockClear();
    process.env.REDIS_URL = 'redis://localhost:6379';
    redis = require('../configs/redis');
  });

  it('initial status is disconnected', () => {
    expect(redis.getRedisStatus()).toBe('disconnected');
  });

  it('ready event sets status to connected', async () => {
    await redis.connectRedis();
    mockRedisHandlers.ready();
    expect(redis.getRedisStatus()).toBe('connected');
  });

  it('reconnecting event sets status to reconnecting', async () => {
    await redis.connectRedis();
    mockRedisHandlers.reconnecting();
    expect(redis.getRedisStatus()).toBe('reconnecting');
  });

  it('end event sets status to disconnected', async () => {
    await redis.connectRedis();
    mockRedisHandlers.ready();
    mockRedisHandlers.end();
    expect(redis.getRedisStatus()).toBe('disconnected');
  });

  it('shutdown resets status to disconnected even if reconnecting', async () => {
    await redis.connectRedis();
    mockRedisHandlers.reconnecting();
    expect(redis.getRedisStatus()).toBe('reconnecting');
    redis.setShuttingDown();
    expect(redis.getRedisStatus()).toBe('disconnected');
  });

  it('shutdown resets status to disconnected even if connected', async () => {
    await redis.connectRedis();
    mockRedisHandlers.ready();
    expect(redis.getRedisStatus()).toBe('connected');
    redis.setShuttingDown();
    expect(redis.getRedisStatus()).toBe('disconnected');
  });

  it('isShuttingDown returns true after setShuttingDown', () => {
    redis.setShuttingDown();
    expect(redis.isShuttingDown()).toBe(true);
  });

  it('setShuttingDown is idempotent', () => {
    redis.setShuttingDown();
    redis.setShuttingDown();
    expect(redis.isShuttingDown()).toBe(true);
  });
});

describe('Health service — reconnecting status', () => {
  let healthService;
  let mockGetRedisClient;
  let mockGetRedisStatus;

  beforeEach(() => {
    jest.resetModules();
    mockGetRedisClient = jest.fn();
    mockGetRedisStatus = jest.fn();
    jest.mock('../configs/redis', () => ({
      getRedisClient: mockGetRedisClient,
      getRedisStatus: mockGetRedisStatus,
    }));
    healthService = require('../services/healthService');
  });

  it('checkRedis returns reconnecting when status is reconnecting and client exists', async () => {
    mockGetRedisClient.mockReturnValue({ isOpen: false });
    mockGetRedisStatus.mockReturnValue('reconnecting');
    const result = await healthService.getReadinessData({ requestId: 'test-id' });
    expect(result.dependencies.redis.status).toBe('reconnecting');
  });

  it('checkRedis returns down when client is null even if status reconnecting', async () => {
    mockGetRedisClient.mockReturnValue(null);
    mockGetRedisStatus.mockReturnValue('reconnecting');
    const result = await healthService.getReadinessData({ requestId: 'test-id' });
    expect(result.dependencies.redis.status).toBe('down');
  });

  it('checkRedis returns up when ping succeeds', async () => {
    const client = { isOpen: true, ping: jest.fn().mockResolvedValue('PONG') };
    mockGetRedisClient.mockReturnValue(client);
    mockGetRedisStatus.mockReturnValue('connected');
    const result = await healthService.getReadinessData({ requestId: 'test-id' });
    expect(result.dependencies.redis.status).toBe('up');
  });
});
