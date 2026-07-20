const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

jest.mock('pino', () => {
  const mockInstance = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn(() => mockInstance),
  };
  return jest.fn(() => mockInstance);
});

jest.mock('bullmq', () => {
  const EventEmitter = require('events').EventEmitter;
  const instances = [];

  const createMockQueue = jest.fn().mockImplementation((name, opts) => {
    const ee = new EventEmitter();
    ee.name = name;
    ee.opts = opts;
    ee.close = jest.fn().mockResolvedValue(undefined);
    ee.add = jest.fn().mockResolvedValue({ id: 'mock-job-1', name: 'system.ping' });
    instances.push(ee);
    return ee;
  });
  createMockQueue.prototype = EventEmitter.prototype;

  const createMockWorker = jest.fn().mockImplementation((name, processor, opts) => {
    const ee = new EventEmitter();
    ee.name = name;
    ee.processor = processor;
    ee.opts = opts;
    ee.close = jest.fn().mockResolvedValue(undefined);
    instances.push(ee);
    return ee;
  });
  createMockWorker.prototype = EventEmitter.prototype;

  return { Queue: createMockQueue, Worker: createMockWorker };
});

const mockPino = () => require('pino')();

describe('BullMQ queueConnection', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.REDIS_URL = 'redis://localhost:6379';
  });

  it('returns connection object with url from REDIS_URL', () => {
    const { getBullMQConnection } = require('../queues/queueConnection');
    const conn = getBullMQConnection();
    expect(conn).toEqual({ url: 'redis://localhost:6379' });
  });

  it('throws when REDIS_URL is missing', () => {
    delete process.env.REDIS_URL;
    const { getBullMQConnection } = require('../queues/queueConnection');
    expect(() => getBullMQConnection()).toThrow('REDIS_URL');
  });

  it('returns sanitized info without exposing credentials', () => {
    const { getSanitizedInfo } = require('../queues/queueConnection');
    const info = getSanitizedInfo();
    expect(info).toHaveProperty('enabled');
    expect(info).toHaveProperty('prefix', 'smart-ai');
    expect(info).toHaveProperty('host', '[REDACTED]');
    expect(info).not.toHaveProperty('url');
    expect(info).not.toHaveProperty('password');
  });

  it('respects BULLMQ_ENABLED=false', () => {
    process.env.BULLMQ_ENABLED = 'false';
    const { getBullMQConfig } = require('../queues/queueConnection');
    expect(getBullMQConfig().enabled).toBe(false);
  });

  it('allows custom prefix via BULLMQ_PREFIX', () => {
    process.env.BULLMQ_PREFIX = 'custom-prefix';
    const { getBullMQConfig } = require('../queues/queueConnection');
    expect(getBullMQConfig().prefix).toBe('custom-prefix');
  });

  it('reads BULLMQ_DEFAULT_ATTEMPTS and BULLMQ_DEFAULT_CONCURRENCY', () => {
    process.env.BULLMQ_DEFAULT_ATTEMPTS = '5';
    process.env.BULLMQ_DEFAULT_CONCURRENCY = '10';
    const { getBullMQConfig } = require('../queues/queueConnection');
    const config = getBullMQConfig();
    expect(config.defaultAttempts).toBe(5);
    expect(config.defaultConcurrency).toBe(10);
  });
});

describe('BullMQ jobOptions', () => {
  beforeEach(() => {
    jest.resetModules();
    delete process.env.BULLMQ_DEFAULT_ATTEMPTS;
    delete process.env.BULLMQ_PREFIX;
  });

  it('returns default job options with attempts, backoff, removeOnComplete, removeOnFail', () => {
    const { getDefaultJobOptions } = require('../queues/jobOptions');
    const opts = getDefaultJobOptions();
    expect(opts.attempts).toBe(3);
    expect(opts.backoff).toEqual({ type: 'exponential', delay: 1000 });
    expect(opts.removeOnComplete).toEqual({ count: 100, age: 3600 * 24 });
    expect(opts.removeOnFail).toEqual({ count: 50, age: 3600 * 24 * 7 });
  });

  it('mergeJobOptions overrides individual fields', () => {
    const { mergeJobOptions } = require('../queues/jobOptions');
    const opts = mergeJobOptions({ attempts: 5 });
    expect(opts.attempts).toBe(5);
    expect(opts.backoff.type).toBe('exponential');
  });
});

describe('BullMQ queueFactory', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.REDIS_URL = 'redis://localhost:6379';
    delete process.env.BULLMQ_DEFAULT_ATTEMPTS;
    delete process.env.BULLMQ_DEFAULT_CONCURRENCY;
    delete process.env.BULLMQ_PREFIX;
    mockPino().info.mockClear();
    mockPino().warn.mockClear();
    mockPino().error.mockClear();
  });

  it('creates a queue with expected defaults', () => {
    const { Queue } = require('bullmq');
    const { createQueue } = require('../queues/queueFactory');
    const queue = createQueue('testQueue');
    expect(queue.name).toBe('testQueue');
    expect(Queue).toHaveBeenCalledWith('testQueue', expect.objectContaining({
      prefix: 'smart-ai',
    }));
  });

  it('queue has a safeClose method', () => {
    const { createQueue } = require('../queues/queueFactory');
    const queue = createQueue('testQueue');
    expect(typeof queue.safeClose).toBe('function');
  });

  it('safeClose closes the queue', async () => {
    const { createQueue } = require('../queues/queueFactory');
    const queue = createQueue('testQueue');
    await queue.safeClose();
    expect(queue.close).toHaveBeenCalled();
  });
});

describe('BullMQ workerFactory', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.REDIS_URL = 'redis://localhost:6379';
    delete process.env.BULLMQ_DEFAULT_CONCURRENCY;
    mockPino().info.mockClear();
    mockPino().warn.mockClear();
    mockPino().error.mockClear();
  });

  it('creates a worker with expected concurrency', () => {
    const { Worker } = require('bullmq');
    const { createWorker } = require('../workers/workerFactory');
    const processor = jest.fn();
    const worker = createWorker('testQueue', processor);
    expect(worker.name).toBe('testQueue');
    expect(Worker).toHaveBeenCalledWith('testQueue', processor, expect.objectContaining({
      concurrency: 2,
    }));
  });

  it('worker has a safeClose method', () => {
    const { createWorker } = require('../workers/workerFactory');
    const worker = createWorker('testQueue', jest.fn());
    expect(typeof worker.safeClose).toBe('function');
  });

  it('safeClose closes the worker', async () => {
    const { createWorker } = require('../workers/workerFactory');
    const worker = createWorker('testQueue', jest.fn());
    await worker.safeClose();
    expect(worker.close).toHaveBeenCalled();
  });

  it('completed event logs structured metadata', () => {
    const { createWorker } = require('../workers/workerFactory');
    const pinoInfo = mockPino();
    const worker = createWorker('testQueue', jest.fn());

    const job = {
      id: 'job-1',
      name: 'system.ping',
      attemptsMade: 1,
      timestamp: Date.now() - 100,
    };

    // Trigger the completed event listener
    expect(worker.listeners).toBeDefined();
    // Manually emit 'completed' on the worker
    worker.emit('completed', job);

    expect(pinoInfo.info).toHaveBeenCalledWith(
      expect.objectContaining({
        queueName: 'testQueue',
        jobId: 'job-1',
        jobName: 'system.ping',
        attemptsMade: 1,
        durationMs: expect.any(Number),
      }),
      'BullMQ job completed',
    );
  });

  it('failed event logs without exposing payload', () => {
    const { createWorker } = require('../workers/workerFactory');
    const pinoWarn = mockPino().warn;
    const worker = createWorker('testQueue', jest.fn());

    const job = { id: 'job-2', name: 'system.ping', attemptsMade: 2 };
    const err = new Error('test failure');

    worker.emit('failed', job, err);

    expect(pinoWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        queueName: 'testQueue',
        jobId: 'job-2',
        err: { message: 'test failure' },
      }),
      'BullMQ job failed',
    );

    // Ensure full payload is NOT in log
    const callArgs = pinoWarn.mock.calls.find(c => c[0] && c[0].jobId === 'job-2');
    expect(callArgs[0]).not.toHaveProperty('data');
    expect(callArgs[0].err).not.toHaveProperty('stack');
  });

  it('error event logs worker errors', () => {
    const { createWorker } = require('../workers/workerFactory');
    const pinoError = mockPino().error;
    const worker = createWorker('testQueue', jest.fn());

    worker.emit('error', new Error('connection lost'));

    expect(pinoError).toHaveBeenCalledWith(
      expect.objectContaining({
        queueName: 'testQueue',
        err: { message: 'connection lost' },
      }),
      'BullMQ worker error',
    );
  });

  it('stalled event logs job id', () => {
    const { createWorker } = require('../workers/workerFactory');
    const pinoWarn = mockPino().warn;
    const worker = createWorker('testQueue', jest.fn());

    worker.emit('stalled', 'stalled-job-1');

    expect(pinoWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        queueName: 'testQueue',
        jobId: 'stalled-job-1',
      }),
      'BullMQ job stalled',
    );
  });
});

describe('BullMQ queueRegistry', () => {
  beforeEach(() => {
    jest.resetModules();
    mockPino().info.mockClear();
  });

  it('register and get a queue', () => {
    const queueRegistry = require('../queues/queueRegistry');
    const mockQueue = { name: 'test', safeClose: jest.fn() };
    queueRegistry.register('test', mockQueue);
    expect(queueRegistry.get('test')).toBe(mockQueue);
  });

  it('isInitialized returns false when no queues registered', () => {
    const queueRegistry = require('../queues/queueRegistry');
    expect(queueRegistry.isInitialized()).toBe(false);
  });

  it('isInitialized returns true after registering', () => {
    const queueRegistry = require('../queues/queueRegistry');
    queueRegistry.register('test', { name: 'test' });
    expect(queueRegistry.isInitialized()).toBe(true);
  });

  it('closeAll calls safeClose on each queue', async () => {
    const queueRegistry = require('../queues/queueRegistry');
    const closeFn = jest.fn().mockResolvedValue(undefined);
    queueRegistry.register('q1', { safeClose: closeFn });
    queueRegistry.register('q2', { safeClose: closeFn });

    await queueRegistry.closeAll();

    expect(closeFn).toHaveBeenCalledTimes(2);
    expect(queueRegistry.isInitialized()).toBe(false);
  });

  it('closeAll does nothing when empty', async () => {
    const queueRegistry = require('../queues/queueRegistry');
    await expect(queueRegistry.closeAll()).resolves.toBeUndefined();
  });
});

describe('BullMQ workerRegistry', () => {
  beforeEach(() => {
    jest.resetModules();
    mockPino().info.mockClear();
  });

  it('register and get a worker', () => {
    const workerRegistry = require('../workers/workerRegistry');
    const mockWorker = { name: 'w1', safeClose: jest.fn() };
    workerRegistry.register('w1', mockWorker);
    expect(workerRegistry.get('w1')).toBe(mockWorker);
  });

  it('closeAll calls safeClose on each worker', async () => {
    const workerRegistry = require('../workers/workerRegistry');
    const closeFn = jest.fn().mockResolvedValue(undefined);
    workerRegistry.register('w1', { safeClose: closeFn });
    workerRegistry.register('w2', { safeClose: closeFn });

    await workerRegistry.closeAll();

    expect(closeFn).toHaveBeenCalledTimes(2);
    expect(workerRegistry.isInitialized()).toBe(false);
  });

  it('closeAll closes workers before clearing', async () => {
    const workerRegistry = require('../workers/workerRegistry');
    let closed = false;
    workerRegistry.register('w1', {
      safeClose: jest.fn().mockImplementation(async () => { closed = true; }),
    });

    await workerRegistry.closeAll();
    expect(closed).toBe(true);
    expect(workerRegistry.isInitialized()).toBe(false);
  });
});

describe('BullMQ system.ping job', () => {
  beforeEach(() => {
    jest.resetModules();
    mockPino().info.mockClear();
  });

  it('processes successfully with required fields', async () => {
    const { systemPing } = require('../jobs/systemJob');
    const job = {
      id: 'ping-1',
      name: 'system.ping',
      data: {},
    };
    const result = await systemPing(job);
    expect(result.pong).toBe(true);
    expect(result.processedAt).toBeDefined();
    expect(new Date(result.processedAt).toISOString()).toBe(result.processedAt);
    expect(result.correlationId).toBeNull();
  });

  it('propagates correlationId from job data', async () => {
    const { systemPing } = require('../jobs/systemJob');
    const job = {
      id: 'ping-2',
      name: 'system.ping',
      data: { correlationId: 'abc-123' },
    };
    const result = await systemPing(job);
    expect(result.correlationId).toBe('abc-123');
  });

  it('falls back to requestId when correlationId is absent', async () => {
    const { systemPing } = require('../jobs/systemJob');
    const job = {
      id: 'ping-3',
      name: 'system.ping',
      data: { requestId: 'req-456' },
    };
    const result = await systemPing(job);
    expect(result.correlationId).toBe('req-456');
  });

  it('logs structured info with jobId and correlationId', async () => {
    const pinoInfo = mockPino().info;
    const { systemPing } = require('../jobs/systemJob');
    const job = { id: 'ping-4', name: 'system.ping', data: { correlationId: 'corr-789' } };

    await systemPing(job);

    expect(pinoInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'ping-4',
        jobName: 'system.ping',
        correlationId: 'corr-789',
      }),
      'Processing system.ping',
    );
  });

  it('does not expose full job data payload in log', async () => {
    const pinoInfo = mockPino().info;
    const { systemPing } = require('../jobs/systemJob');
    const job = { id: 'ping-5', name: 'system.ping', data: { secret: 'abc' } };

    await systemPing(job);

    const call = pinoInfo.mock.calls.find(c => c[0] && c[0].jobId === 'ping-5');
    expect(call[0]).not.toHaveProperty('data');
  });
});

describe('BullMQ disabled mode', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('getBullMQConfig returns enabled=false when BULLMQ_ENABLED=false', () => {
    process.env.BULLMQ_ENABLED = 'false';
    const { getBullMQConfig } = require('../queues/queueConnection');
    expect(getBullMQConfig().enabled).toBe(false);
  });
});
