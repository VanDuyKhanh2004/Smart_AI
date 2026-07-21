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

jest.mock('../services/emailService', () => ({
  sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendUnlockAccountEmail: jest.fn().mockResolvedValue(undefined),
  sendOrderConfirmationEmail: jest.fn().mockResolvedValue(undefined),
}));

const mockEmailService = () => require('../services/emailService');
const mockPino = () => require('pino')();

describe('Email job processor', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('processes welcome email and calls email service', async () => {
    const { processJob } = require('../jobs/emailJobs');
    const job = {
      id: 'e1',
      name: 'email.welcome',
      data: { jobType: 'email.welcome', to: 'test@test.com', name: 'Test', correlationId: 'cid-1' },
      attemptsMade: 0,
      timestamp: Date.now(),
    };
    const result = await processJob(job);
    expect(result.sent).toBe(true);
    expect(result.emailType).toBe('email.welcome');
    expect(mockEmailService().sendWelcomeEmail).toHaveBeenCalledWith({ name: 'Test', email: 'test@test.com' });
  });

  it('processes verification email and calls email service', async () => {
    const { processJob } = require('../jobs/emailJobs');
    const job = {
      id: 'e2',
      name: 'email.verification',
      data: { jobType: 'email.verification', to: 'a@b.com', name: 'A', verifyUrl: 'http://verify/abc', correlationId: 'cid-2' },
      attemptsMade: 0,
      timestamp: Date.now(),
    };
    const result = await processJob(job);
    expect(result.sent).toBe(true);
    expect(mockEmailService().sendVerificationEmail).toHaveBeenCalledWith(
      { name: 'A', email: 'a@b.com' },
      'http://verify/abc',
    );
  });

  it('processes password reset email and calls email service', async () => {
    const { processJob } = require('../jobs/emailJobs');
    const job = {
      id: 'e3',
      name: 'email.password-reset',
      data: { jobType: 'email.password-reset', to: 'a@b.com', name: 'A', resetUrl: 'http://reset/xyz', correlationId: 'cid-3' },
      attemptsMade: 0,
      timestamp: Date.now(),
    };
    const result = await processJob(job);
    expect(result.sent).toBe(true);
    expect(mockEmailService().sendPasswordResetEmail).toHaveBeenCalledWith(
      { name: 'A', email: 'a@b.com' },
      'http://reset/xyz',
    );
  });

  it('processes unlock account email and calls email service', async () => {
    const { processJob } = require('../jobs/emailJobs');
    const job = {
      id: 'e4',
      name: 'email.unlock-account',
      data: { jobType: 'email.unlock-account', to: 'a@b.com', name: 'A', unlockUrl: 'http://unlock/123', correlationId: 'cid-4' },
      attemptsMade: 0,
      timestamp: Date.now(),
    };
    const result = await processJob(job);
    expect(result.sent).toBe(true);
    expect(mockEmailService().sendUnlockAccountEmail).toHaveBeenCalledWith(
      { name: 'A', email: 'a@b.com' },
      'http://unlock/123',
    );
  });

  it('processes order confirmation email and calls email service', async () => {
    const { processJob } = require('../jobs/emailJobs');
    const order = { _id: 'order-1', orderNumber: 'ORD-001' };
    const job = {
      id: 'e5',
      name: 'email.order-confirmation',
      data: { jobType: 'email.order-confirmation', to: 'a@b.com', name: 'A', order, correlationId: 'cid-5' },
      attemptsMade: 0,
      timestamp: Date.now(),
    };
    const result = await processJob(job);
    expect(result.sent).toBe(true);
    expect(mockEmailService().sendOrderConfirmationEmail).toHaveBeenCalledWith(
      { name: 'A', email: 'a@b.com' },
      order,
    );
  });

  it('throws on unknown job type', async () => {
    const { processJob } = require('../jobs/emailJobs');
    const job = {
      id: 'e6',
      name: 'email.unknown',
      data: { jobType: 'email.unknown', to: 'a@b.com' },
      attemptsMade: 0,
      timestamp: Date.now(),
    };
    await expect(processJob(job)).rejects.toThrow('Unknown email job type');
  });

  it('logs structured info on start and completion', async () => {
    const pinoInfo = mockPino().info;
    const { processJob } = require('../jobs/emailJobs');
    const job = {
      id: 'e7',
      name: 'email.welcome',
      data: { jobType: 'email.welcome', to: 'a@b.com', name: 'A', correlationId: 'cid-7' },
      attemptsMade: 0,
      timestamp: Date.now(),
    };
    await processJob(job);
    const startCall = pinoInfo.mock.calls.find(c => c[1] === 'Email job started');
    expect(startCall).toBeDefined();
    expect(startCall[0]).toMatchObject({ jobId: 'e7', emailType: 'email.welcome', correlationId: 'cid-7' });
    const completeCall = pinoInfo.mock.calls.find(c => c[1] === 'Email job completed');
    expect(completeCall).toBeDefined();
  });

  describe('processor timing', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('started log does not include durationMs', async () => {
      const pinoInfo = mockPino().info;
      const { processJob } = require('../jobs/emailJobs');

      let resolveProvider;
      mockEmailService().sendWelcomeEmail.mockReturnValue(new Promise(resolve => { resolveProvider = resolve; }));

      const job = {
        id: 'e-t1',
        name: 'email.welcome',
        data: { jobType: 'email.welcome', to: 'a@b.com', name: 'A', correlationId: 'cid-t1' },
        attemptsMade: 0,
      };

      const processPromise = processJob(job);

      const startCall = pinoInfo.mock.calls.find(c => c[1] === 'Email job started');
      expect(startCall).toBeDefined();
      expect(startCall[0]).not.toHaveProperty('durationMs');

      jest.advanceTimersByTime(800);
      resolveProvider();
      await processPromise;
    });

    it('completed duration includes awaited provider latency', async () => {
      const pinoInfo = mockPino().info;
      const { processJob } = require('../jobs/emailJobs');

      let resolveProvider;
      mockEmailService().sendWelcomeEmail.mockReturnValue(new Promise(resolve => { resolveProvider = resolve; }));

      const job = {
        id: 'e-t2',
        name: 'email.welcome',
        data: { jobType: 'email.welcome', to: 'a@b.com', name: 'A', correlationId: 'cid-t2' },
        attemptsMade: 0,
      };

      const processPromise = processJob(job);

      jest.advanceTimersByTime(500);
      resolveProvider();
      await processPromise;

      const completeCall = pinoInfo.mock.calls.find(c => c[1] === 'Email job completed');
      expect(completeCall).toBeDefined();
      expect(completeCall[0]).toHaveProperty('durationMs');
      expect(completeCall[0].durationMs).toBe(500);
    });

    it('failed duration includes elapsed processing time', async () => {
      const pinoError = mockPino().error;
      const { processJob } = require('../jobs/emailJobs');

      let rejectProvider;
      mockEmailService().sendWelcomeEmail.mockReturnValue(new Promise((_, reject) => { rejectProvider = reject; }));

      const job = {
        id: 'e-t3',
        name: 'email.welcome',
        data: { jobType: 'email.welcome', to: 'a@b.com', name: 'A', correlationId: 'cid-t3' },
        attemptsMade: 0,
      };

      const processPromise = processJob(job);

      jest.advanceTimersByTime(300);
      rejectProvider(new Error('Provider error'));

      await expect(processPromise).rejects.toThrow('Provider error');

      const failCall = pinoError.mock.calls.find(c => c[1] === 'Email job failed');
      expect(failCall).toBeDefined();
      expect(failCall[0]).toHaveProperty('durationMs');
      expect(failCall[0].durationMs).toBe(300);
    });

    it('provider promise is awaited before completion log', async () => {
      const pinoInfo = mockPino().info;
      const { processJob } = require('../jobs/emailJobs');

      let resolveProvider;
      mockEmailService().sendWelcomeEmail.mockReturnValue(new Promise(resolve => { resolveProvider = resolve; }));

      const job = {
        id: 'e-t4',
        name: 'email.welcome',
        data: { jobType: 'email.welcome', to: 'a@b.com', name: 'A', correlationId: 'cid-t4' },
        attemptsMade: 0,
      };

      const processPromise = processJob(job);

      let completeCall = pinoInfo.mock.calls.find(c => c[1] === 'Email job completed');
      expect(completeCall).toBeUndefined();

      resolveProvider();
      await processPromise;

      completeCall = pinoInfo.mock.calls.find(c => c[1] === 'Email job completed');
      expect(completeCall).toBeDefined();
    });
  });

  it('does not expose reset token or payload in logs', async () => {
    const pinoInfo = mockPino().info;
    const { processJob } = require('../jobs/emailJobs');
    const job = {
      id: 'e8',
      name: 'email.password-reset',
      data: { jobType: 'email.password-reset', to: 'a@b.com', name: 'A', resetUrl: 'http://reset/secret-token-123', correlationId: 'cid-8' },
      attemptsMade: 0,
      timestamp: Date.now(),
    };
    await processJob(job);
    const calls = pinoInfo.mock.calls;
    for (const args of calls) {
      if (args[0] && typeof args[0] === 'object') {
        expect(args[0]).not.toHaveProperty('data');
      }
    }
  });
});

describe('Email queue service', () => {
  const mockAdd = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockAdd.mockReset().mockResolvedValue({ id: 'job-1' });
    // Register a controlled mock queue directly into the real queueRegistry
    const queueRegistry = require('../queues/queueRegistry');
    queueRegistry.register('emailQueue', { add: mockAdd });
  });

  afterEach(() => {
    // Clean up registered queue after each test
    const queueRegistry = require('../queues/queueRegistry');
    // closeAll clears the registry
    const q = queueRegistry.get('emailQueue');
    if (q && typeof q.safeClose === 'function') q.safeClose();
    queueRegistry.closeAll();
  });

  it('enqueues welcome email with deterministic jobId', async () => {
    const { enqueueWelcomeEmail } = require('../services/emailQueueService');
    const user = { _id: 'user-1', email: 'a@b.com', name: 'Test' };
    await enqueueWelcomeEmail(user, 'cid-1');
    expect(mockAdd).toHaveBeenCalledWith(
      'email.welcome',
      expect.objectContaining({ jobType: 'email.welcome', to: 'a@b.com', correlationId: 'cid-1' }),
      expect.objectContaining({ jobId: 'welcome-user-1' }),
    );
  });

  it('enqueues verification email with token-based jobId', async () => {
    const { enqueueVerificationEmail } = require('../services/emailQueueService');
    const user = { _id: 'u1', email: 'a@b.com', name: 'A' };
    await enqueueVerificationEmail(user, 'http://verify/token123', 'cid-2');
    expect(mockAdd).toHaveBeenCalledWith(
      'email.verification',
      expect.objectContaining({ jobType: 'email.verification', verifyUrl: 'http://verify/token123' }),
      expect.objectContaining({ jobId: expect.stringMatching(/^verification-/) }),
    );
  });

  it('enqueues order confirmation with order-based jobId', async () => {
    const { enqueueOrderConfirmationEmail } = require('../services/emailQueueService');
    const user = { name: 'A', email: 'a@b.com' };
    const order = { _id: 'order-1', orderNumber: 'ORD-001' };
    await enqueueOrderConfirmationEmail(user, order, 'cid-3');
    expect(mockAdd).toHaveBeenCalledWith(
      'email.order-confirmation',
      expect.objectContaining({ jobType: 'email.order-confirmation', order }),
      expect.objectContaining({ jobId: 'order-confirmation-order-1' }),
    );
  });

  it('enqueue sets retry options (attempts: 3, exponential backoff)', async () => {
    const { enqueueWelcomeEmail } = require('../services/emailQueueService');
    const user = { _id: 'u2', email: 'a@b.com', name: 'B' };
    await enqueueWelcomeEmail(user, 'cid');
    expect(mockAdd).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      }),
    );
  });

  it('falls back to direct send when queue is not registered', async () => {
    // Unregister the queue
    const queueRegistry = require('../queues/queueRegistry');
    queueRegistry.closeAll();

    const emailService = require('../services/emailService');
    const { enqueueWelcomeEmail } = require('../services/emailQueueService');
    const user = { _id: 'u3', email: 'a@b.com', name: 'C' };
    await enqueueWelcomeEmail(user, 'cid');
    expect(mockAdd).not.toHaveBeenCalled();
    expect(emailService.sendWelcomeEmail).toHaveBeenCalledWith({ name: 'C', email: 'a@b.com' });
  });

  it('falls back to direct send when queue.add throws', async () => {
    mockAdd.mockRejectedValue(new Error('Redis down'));
    const emailService = require('../services/emailService');
    const { enqueueWelcomeEmail } = require('../services/emailQueueService');
    const user = { _id: 'u4', email: 'a@b.com', name: 'D' };
    await enqueueWelcomeEmail(user, 'cid');
    expect(emailService.sendWelcomeEmail).toHaveBeenCalledWith({ name: 'D', email: 'a@b.com' });
  });

  it('fallback to direct send is logged as warning', async () => {
    const queueRegistry = require('../queues/queueRegistry');
    queueRegistry.closeAll();

    const pinoWarn = mockPino().warn;
    const { enqueueWelcomeEmail } = require('../services/emailQueueService');
    const user = { _id: 'u5', email: 'a@b.com', name: 'E' };
    await enqueueWelcomeEmail(user, 'cid');
    expect(pinoWarn).toHaveBeenCalledWith(
      expect.objectContaining({ jobType: 'email.welcome' }),
      'Email queue not available, sending directly',
    );
  });

  it('enqueue failure logs structured error', async () => {
    mockAdd.mockRejectedValue(new Error('Connection refused'));
    const pinoError = mockPino().error;
    const { enqueueWelcomeEmail } = require('../services/emailQueueService');
    const user = { _id: 'u6', email: 'a@b.com', name: 'F' };
    await enqueueWelcomeEmail(user, 'cid');
    expect(pinoError).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: 'email.welcome',
        err: { message: 'Connection refused' },
      }),
      'Failed to enqueue email job, sending directly',
    );
  });
});

describe('Email queue and worker registration in bootstrap', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.REDIS_URL = 'redis://localhost:6379';
  });

  it('registers emailQueue and emailWorker in bootstrap', async () => {
    const queueRegistry = require('../queues/queueRegistry');
    const workerRegistry = require('../workers/workerRegistry');
    const { startBullMQ, stopBullMQ } = require('../bullmq/bootstrap');

    await startBullMQ();

    expect(queueRegistry.get('emailQueue')).toBeDefined();
    expect(workerRegistry.get('emailQueue')).toBeDefined();
    expect(queueRegistry.get('systemQueue')).toBeDefined();
    expect(workerRegistry.get('systemQueue')).toBeDefined();

    await stopBullMQ();
  });

  it('email queue and worker close during shutdown', async () => {
    const { startBullMQ, stopBullMQ } = require('../bullmq/bootstrap');
    const queueRegistry = require('../queues/queueRegistry');
    const workerRegistry = require('../workers/workerRegistry');

    await startBullMQ();

    const emailQueue = queueRegistry.get('emailQueue');
    const emailWorker = workerRegistry.get('emailQueue');

    expect(emailQueue.safeClose).toBeDefined();
    expect(emailWorker.safeClose).toBeDefined();

    await stopBullMQ();
  });

  it('getBullMQHealth includes email queue fields', async () => {
    const { startBullMQ, stopBullMQ, getBullMQHealth } = require('../bullmq/bootstrap');

    await startBullMQ();
    const health = getBullMQHealth();
    expect(health).toHaveProperty('emailQueueEnabled');
    expect(health).toHaveProperty('emailQueueInitialized');
    expect(health.emailQueueInitialized).toBe(true);

    await stopBullMQ();
  });

  it('disabled mode skips email queue registration', () => {
    process.env.BULLMQ_ENABLED = 'false';
    const queueRegistry = require('../queues/queueRegistry');
    const { startBullMQ } = require('../bullmq/bootstrap');
    startBullMQ();
    expect(queueRegistry.isInitialized()).toBe(false);
  });
});
