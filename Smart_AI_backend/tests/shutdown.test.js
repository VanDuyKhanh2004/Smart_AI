const path = require('path');

jest.mock('pino', () => {
  const mockInstance = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn(() => mockInstance),
    flush: jest.fn(),
  };
  return jest.fn(() => mockInstance);
});

const mockPino = () => require('pino')();

function* walkJsFiles(dir) {
  const fs = require('fs');
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
      yield* walkJsFiles(full);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      yield full;
    }
  }
}

describe('shutdownStep', () => {
  beforeEach(() => {
    jest.resetModules();
    mockPino().info.mockClear();
    mockPino().warn.mockClear();
  });

  it('calls the function and awaits it', async () => {
    const { shutdownStep } = require('../utils/shutdown');
    const fn = jest.fn().mockResolvedValue(undefined);
    await shutdownStep('test', fn);
    expect(fn).toHaveBeenCalled();
  });

  it('logs start and close messages', async () => {
    const pinoInfo = mockPino().info;
    const { shutdownStep } = require('../utils/shutdown');
    await shutdownStep('test', () => Promise.resolve());
    expect(pinoInfo).toHaveBeenCalledWith(
      { resource: 'test' },
      'Shutdown: closing test',
    );
    expect(pinoInfo).toHaveBeenCalledWith(
      { resource: 'test' },
      'Shutdown: test closed',
    );
  });

  it('handles function rejection without throwing', async () => {
    const { shutdownStep } = require('../utils/shutdown');
    const fn = jest.fn().mockRejectedValue(new Error('boom'));
    await expect(shutdownStep('test', fn)).resolves.toBeUndefined();
  });

  it('logs error on function rejection', async () => {
    const pinoError = mockPino().error;
    const { shutdownStep } = require('../utils/shutdown');
    await shutdownStep('test', () => Promise.reject(new Error('boom')));
    expect(pinoError).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), resource: 'test' }),
      'Shutdown error: test',
    );
  });

  it('times out and continues after timeoutMs', async () => {
    const pinoWarn = mockPino().warn;
    const { shutdownStep } = require('../utils/shutdown');
    // Promise that never resolves (no timer) — timeout fires instead
    const never = () => new Promise(() => {});
    await shutdownStep('slow', never, 100);
    expect(pinoWarn).toHaveBeenCalledWith(
      expect.objectContaining({ resource: 'slow', timeoutMs: 100 }),
      'Shutdown timeout: slow',
    );
  });
});

describe('shutdownSocketIO', () => {
  beforeEach(() => {
    jest.resetModules();
    mockPino().info.mockClear();
    mockPino().warn.mockClear();
    mockPino().error.mockClear();
  });

  it('returns a Promise', () => {
    const socketHandler = require('../socket/socketHandler');
    const result = socketHandler.shutdownSocketIO();
    expect(result).toBeInstanceOf(Promise);
  });

  it('resolves when io.close callback fires', async () => {
    const EventEmitter = require('events');

    const io = new EventEmitter();
    io.sockets = { sockets: new Map() };
    io.emit = jest.fn();
    let closeCalled = false;
    io.close = jest.fn((cb) => {
      closeCalled = true;
      setImmediate(cb);
    });

    const socketHandler = require('../socket/socketHandler');
    socketHandler.initializeSocketHandlers(io);

    const start = Date.now();
    await socketHandler.shutdownSocketIO();
    expect(Date.now() - start).toBeLessThan(100);
    expect(closeCalled).toBe(true);
  });

  it('does not register any process signal listeners', () => {
    const EventEmitter = require('events');
    const socketHandler = require('../socket/socketHandler');
    const sigintCount = process.listeners('SIGINT').length;
    const sigtermCount = process.listeners('SIGTERM').length;

    socketHandler.initializeSocketHandlers(new EventEmitter());

    expect(process.listeners('SIGINT').length).toBe(sigintCount);
    expect(process.listeners('SIGTERM').length).toBe(sigtermCount);
  });

  it('shutdownSocketIO does not call process.exit', () => {
    const socketHandler = require('../socket/socketHandler');
    // Read the source to verify
    const fs = require('fs');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../socket/socketHandler.js'),
      'utf-8',
    );
    // The shutdownSocketIO function body should not contain process.exit
    const fnStart = source.indexOf('const shutdownSocketIO');
    expect(fnStart).not.toBe(-1);
    // Find the function body
    const bodyStart = source.indexOf('=>', fnStart);
    const body = source.slice(bodyStart);
    expect(body).not.toContain('process.exit');
  });

  it('shutdownSocketIO uses logger, not console', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../socket/socketHandler.js'),
      'utf-8',
    );
    const fnStart = source.indexOf('const shutdownSocketIO');
    const bodyStart = source.indexOf('=>', fnStart);
    const body = source.slice(bodyStart, bodyStart + 600);
    expect(body).not.toContain('console.log');
  });
});

describe('Signal handler ownership', () => {
  const PROJECT_DIR = path.resolve(__dirname, '..');

  it('only index.js registers SIGINT and SIGTERM listeners', () => {
    const testFile = path.relative(PROJECT_DIR, __filename);
    let count = 0;
    for (const file of walkJsFiles(PROJECT_DIR)) {
      const rel = path.relative(PROJECT_DIR, file);
      if (rel === testFile) continue; // skip self
      if (rel.startsWith('node_modules')) continue;
      const fs = require('fs');
      const content = fs.readFileSync(file, 'utf-8');
      if (
        content.includes("process.on('SIGINT'") ||
        content.includes('process.on("SIGINT"') ||
        content.includes("process.on('SIGTERM'") ||
        content.includes('process.on("SIGTERM"') ||
        content.includes("process.once('SIGINT'") ||
        content.includes('process.once("SIGINT"') ||
        content.includes("process.once('SIGTERM'") ||
        content.includes('process.once("SIGTERM"')
      ) {
        expect(rel).toBe('index.js');
        count++;
      }
    }
    // Only index.js owns signal handlers
    expect(count).toBe(1);
  });

  it('no infrastructure file calls process.exit with the intent to terminate the app', () => {
    // configs/database.js calls process.exit(1) on connection failure — this is
    // acceptable startup behavior. No other non-script file should call process.exit.
    const testFile = path.relative(PROJECT_DIR, __filename);
    const fs = require('fs');
    const excluded = ['scripts', 'node_modules'];
    for (const file of walkJsFiles(PROJECT_DIR)) {
      const rel = path.relative(PROJECT_DIR, file);
      if (excluded.some((e) => rel.startsWith(e))) continue;
      if (rel === 'index.js') continue;
      if (rel === testFile) continue; // skip self
      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes('process.exit(')) {
        // Allow database.js config only
        expect(rel).toBe(path.join('configs', 'database.js'));
      }
    }
  });
});

describe('gracefulShutdown guard', () => {
  it('does not run shutdown twice when called sequentially', async () => {
    let shuttingDown = false;
    const runCount = [];

    const shutdown = async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      runCount.push(1);
      await Promise.resolve();
      runCount.push(2);
    };

    await shutdown();
    expect(runCount).toEqual([1, 2]);

    await shutdown();
    expect(runCount).toEqual([1, 2]);
  });

  it('ignores second SIGINT while shutdown is in progress', async () => {
    let shuttingDown = false;

    const handler = async () => {
      if (shuttingDown) return 'skipped';
      shuttingDown = true;
      return 'ran';
    };

    expect(await handler()).toBe('ran');
    expect(await handler()).toBe('skipped');
  });
});

describe('BullMQ close logs', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.REDIS_URL = 'redis://localhost:6379';
    delete process.env.BULLMQ_DEFAULT_CONCURRENCY;
    mockPino().info.mockClear();
    mockPino().warn.mockClear();
    mockPino().error.mockClear();
  });

  it('queue safeClose logs closing and closed', async () => {
    const { createQueue } = require('../queues/queueFactory');
    const queue = createQueue('testQueue');
    await queue.safeClose();

    const pinoInfo = mockPino().info;
    const closingCall = pinoInfo.mock.calls.find(
      (c) => c[0] && c[0].queueName === 'testQueue' && c[1] === 'Closing BullMQ queue',
    );
    expect(closingCall).toBeDefined();

    const closedCall = pinoInfo.mock.calls.find(
      (c) => c[0] && c[0].queueName === 'testQueue' && c[1] === 'BullMQ queue closed',
    );
    expect(closedCall).toBeDefined();
  });

  it('worker safeClose logs closing and closed', async () => {
    const { createWorker } = require('../workers/workerFactory');
    const worker = createWorker('testQueue', jest.fn());
    await worker.safeClose();

    const pinoInfo = mockPino().info;
    const closingCall = pinoInfo.mock.calls.find(
      (c) => c[0] && c[0].queueName === 'testQueue' && c[1] === 'Closing BullMQ worker',
    );
    expect(closingCall).toBeDefined();

    const closedCall = pinoInfo.mock.calls.find(
      (c) => c[0] && c[0].queueName === 'testQueue' && c[1] === 'BullMQ worker closed',
    );
    expect(closedCall).toBeDefined();
  });
});
