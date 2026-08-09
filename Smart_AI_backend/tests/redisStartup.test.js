let mockConnectImpl;
let mockRedisClient;
let mockRedisHandlers = {};

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

const getMockLogger = () => require('pino')();

describe('Redis non-blocking startup (degraded mode)', () => {
  let redis;
  let createClient;

  beforeEach(() => {
    jest.resetModules();
    mockRedisHandlers = {};
    mockConnectImpl = jest.fn();
    mockRedisClient = {
      isOpen: false,
      isReady: false,
      connect: mockConnectImpl,
      quit: jest.fn().mockResolvedValue('OK'),
      on: jest.fn((event, handler) => {
        mockRedisHandlers[event] = handler;
        return mockRedisClient;
      }),
    };
    process.env.REDIS_URL = 'redis://localhost:6379';
    redis = require('../configs/redis');
    createClient = require('redis').createClient;
  });

  afterEach(() => {
    delete process.env.REDIS_URL;
  });

  it('returns immediately instead of awaiting connect() while Redis is down', async () => {
    mockConnectImpl.mockReturnValue(new Promise(() => {}));
    const start = Date.now();
    await redis.connectRedis();
    expect(Date.now() - start).toBeLessThan(100);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(redis.getRedisStatus()).toBe('connecting');
  });

  it('does not create a duplicate client when connectRedis is called while a connect is pending', async () => {
    mockConnectImpl.mockReturnValue(new Promise(() => {}));
    await redis.connectRedis();
    await redis.connectRedis();
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it('does not throw or leak an unhandled rejection when initial connect() rejects', async () => {
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    mockConnectImpl.mockRejectedValue(new Error('ECONNREFUSED redis connect'));
    await expect(redis.connectRedis()).resolves.toBeUndefined();
    await new Promise((resolve) => setImmediate(resolve));
    expect(unhandled).not.toHaveBeenCalled();
    process.removeListener('unhandledRejection', unhandled);
  });

  it('kicks off background connect and transitions to connected on ready event on the same client', async () => {
    let connectCalls = 0;
    mockConnectImpl.mockImplementation(() => {
      connectCalls += 1;
      return Promise.resolve(undefined);
    });
    await redis.connectRedis();
    expect(connectCalls).toBe(1);
    mockRedisHandlers.ready();
    expect(redis.getRedisStatus()).toBe('connected');
  });

  it('keeps the same shared client after recovery', async () => {
    mockConnectImpl.mockReturnValue(new Promise(() => {}));
    await redis.connectRedis();
    const firstClient = redis.getRedisClient();
    expect(getMockLogger().info).toHaveBeenCalled();
    mockRedisHandlers.ready();
    expect(redis.getRedisStatus()).toBe('connected');
    expect(redis.getRedisClient()).toBe(firstClient);
  });

  it('degraded mode still reports non-ready client so resend fails closed', async () => {
    mockConnectImpl.mockReturnValue(new Promise(() => {}));
    await redis.connectRedis();
    const client = redis.getRedisClient();
    expect(client.isOpen).toBe(false);
    expect(client.isReady).toBe(false);
  });
});