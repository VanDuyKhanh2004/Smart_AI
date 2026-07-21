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
    ee.add = jest.fn().mockResolvedValue({ id: 'mock-embedding-job', name, finishedOn: null });
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

describe('embedding content utility', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('builds deterministic canonical content from product', () => {
    const { buildEmbeddingContent } = require('../utils/embeddingContent');
    const product = {
      name: 'iPhone 15',
      brand: 'Apple',
      price: 999,
      description: 'Latest iPhone',
      specs: {
        screen: { size: '6.1 inch', technology: 'OLED' },
        processor: { chipset: 'A16' },
        memory: { ram: '6 GB', storage: '128 GB' },
      },
      colors: ['Black', 'White'],
    };
    const text = buildEmbeddingContent(product);
    expect(text).toContain('iPhone 15');
    expect(text).toContain('Apple');
    expect(text).toContain('999');
    expect(text).toContain('Latest iPhone');
    expect(text).toContain('6.1 inch');
    expect(text).toContain('OLED');
    expect(text).toContain('A16');
    expect(text).toContain('6 GB');
    expect(text).toContain('128 GB');
    expect(text).toContain('Black, White');
  });

  it('produces identical output for same input', () => {
    const { buildEmbeddingContent } = require('../utils/embeddingContent');
    const product = { name: 'X', brand: 'Y', price: 100, description: 'D', specs: {} };
    const a = buildEmbeddingContent(product);
    const b = buildEmbeddingContent(product);
    expect(a).toBe(b);
  });

  it('content hash changes when embedding-relevant fields change', () => {
    const { buildEmbeddingContent, computeContentHash } = require('../utils/embeddingContent');
    const base = { name: 'X', brand: 'Y', price: 100, description: 'D', specs: {} };
    const hash1 = computeContentHash(buildEmbeddingContent(base));
    const hash2 = computeContentHash(buildEmbeddingContent({ ...base, name: 'Z' }));
    expect(hash1).not.toBe(hash2);
  });

  it('content hash does not change for irrelevant fields', () => {
    const { buildEmbeddingContent, computeContentHash } = require('../utils/embeddingContent');
    const base = { name: 'X', brand: 'Y', price: 100, description: 'D', specs: {} };
    const hash1 = computeContentHash(buildEmbeddingContent(base));
    const hash2 = computeContentHash(buildEmbeddingContent({ ...base, inStock: 50, isActive: false }));
    expect(hash1).toBe(hash2);
  });
});

describe('embedding processor', () => {
  let mockProduct;
  let mockSave;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    mockSave = jest.fn();

    jest.doMock('../models/Product', () => ({
      findById: jest.fn(),
    }));

    jest.doMock('../utils/openai', () => ({
      generateEmbedding: jest.fn(),
    }));
  });

  it('loads product from MongoDB and generates vector', async () => {
    const { processEmbeddingJob } = require('../jobs/embeddingJobs');
    const Product = require('../models/Product');
    const { generateEmbedding } = require('../utils/openai');

    const vector = new Array(1536).fill(0.1);
    generateEmbedding.mockResolvedValue(vector);

    const product = {
      _id: 'p1',
      name: 'Test Phone',
      brand: 'TestBrand',
      price: 500,
      description: 'A test phone',
      specs: {},
      colors: [],
      embeddingStatus: 'pending',
      embeddingError: null,
      embedding_vector: undefined,
      embeddingContentHash: null,
      embeddingUpdatedAt: null,
      save: mockSave.mockResolvedValue(true),
    };

    Product.findById.mockResolvedValue(product);

    const { buildEmbeddingContent, computeContentHash } = require('../utils/embeddingContent');
    const canonicalText = buildEmbeddingContent(product);
    const contentHash = computeContentHash(canonicalText);

    const job = {
      id: 'ej-1',
      name: 'create',
      data: { productId: 'p1', contentHash, action: 'create', correlationId: 'cid-1' },
      attemptsMade: 0,
      opts: { attempts: 3 },
      timestamp: Date.now(),
    };

    const result = await processEmbeddingJob(job);

    expect(Product.findById).toHaveBeenCalledWith('p1');
    expect(generateEmbedding).toHaveBeenCalled();
    expect(result).toEqual({ productId: 'p1', action: 'create' });
  });

  it('skips when product is not found', async () => {
    const { processEmbeddingJob } = require('../jobs/embeddingJobs');
    const Product = require('../models/Product');
    Product.findById.mockResolvedValue(null);

    const job = {
      id: 'ej-2',
      name: 'create',
      data: { productId: 'missing', contentHash: 'abc', action: 'create', correlationId: 'cid-2' },
      attemptsMade: 0,
      opts: { attempts: 3 },
    };

    const result = await processEmbeddingJob(job);
    expect(result).toEqual({ skipped: true, reason: 'product_not_found' });
  });

  it('skips stale job when content hash differs', async () => {
    const { processEmbeddingJob } = require('../jobs/embeddingJobs');
    const Product = require('../models/Product');
    const { generateEmbedding } = require('../utils/openai');

    const product = {
      _id: 'p2',
      name: 'Old Name',
      brand: 'Brand',
      price: 100,
      description: 'Desc',
      specs: {},
      colors: [],
      embeddingStatus: 'pending',
      embeddingError: null,
      save: mockSave.mockResolvedValue(true),
    };

    Product.findById.mockResolvedValue(product);

    const job = {
      id: 'ej-3',
      name: 'create',
      data: { productId: 'p2', contentHash: 'stalehash123', action: 'create', correlationId: 'cid-3' },
      attemptsMade: 0,
      opts: { attempts: 3 },
    };

    const result = await processEmbeddingJob(job);
    expect(result).toEqual({ skipped: true, reason: 'stale' });
    expect(generateEmbedding).not.toHaveBeenCalled();
  });

  it('validates vector dimension length', async () => {
    const { processEmbeddingJob } = require('../jobs/embeddingJobs');
    const Product = require('../models/Product');
    const { generateEmbedding } = require('../utils/openai');

    generateEmbedding.mockResolvedValue(new Array(100).fill(0.1));

    const product = {
      _id: 'p3',
      name: 'Test',
      brand: 'B',
      price: 1,
      description: 'D',
      specs: {},
      colors: [],
      embeddingStatus: 'pending',
      embeddingError: null,
      save: mockSave.mockResolvedValue(true),
    };

    Product.findById.mockResolvedValue(product);

    const { buildEmbeddingContent, computeContentHash } = require('../utils/embeddingContent');
    const hash = computeContentHash(buildEmbeddingContent(product));

    const job = {
      id: 'ej-4',
      name: 'create',
      data: { productId: 'p3', contentHash: hash, action: 'create', correlationId: 'cid-4' },
      attemptsMade: 0,
      opts: { attempts: 3 },
    };

    await expect(processEmbeddingJob(job)).rejects.toThrow('Invalid embedding dimensions');
  });

  it('transitions status to processing then ready', async () => {
    const { processEmbeddingJob } = require('../jobs/embeddingJobs');
    const Product = require('../models/Product');
    const { generateEmbedding } = require('../utils/openai');

    const vector = new Array(1536).fill(0.1);
    generateEmbedding.mockResolvedValue(vector);

    const product = {
      _id: 'p4',
      name: 'Test',
      brand: 'B',
      price: 1,
      description: 'D',
      specs: {},
      colors: [],
      embeddingStatus: 'pending',
      embeddingError: null,
      embedding_vector: undefined,
      embeddingContentHash: null,
      embeddingUpdatedAt: null,
      save: mockSave.mockResolvedValue(true),
    };

    Product.findById.mockResolvedValue(product);

    const { buildEmbeddingContent, computeContentHash } = require('../utils/embeddingContent');
    const hash = computeContentHash(buildEmbeddingContent(product));

    const job = {
      id: 'ej-5',
      name: 'create',
      data: { productId: 'p4', contentHash: hash, action: 'create', correlationId: 'cid-5' },
      attemptsMade: 0,
      opts: { attempts: 3 },
    };

    await processEmbeddingJob(job);

    expect(product.embeddingStatus).toBe('ready');
    expect(product.embedding_vector).toEqual(vector);
    expect(product.embeddingContentHash).toBe(hash);
    expect(product.embeddingUpdatedAt).toBeInstanceOf(Date);
    expect(product.embeddingError).toBeNull();
  });

  it('transitions status to failed on final retry exhaustion', async () => {
    const { processEmbeddingJob } = require('../jobs/embeddingJobs');
    const Product = require('../models/Product');
    const { generateEmbedding } = require('../utils/openai');

    generateEmbedding.mockRejectedValue(new Error('Gemini API error'));

    const product = {
      _id: 'p5',
      name: 'Test',
      brand: 'B',
      price: 1,
      description: 'D',
      specs: {},
      colors: [],
      embeddingStatus: 'processing',
      embeddingError: null,
      save: mockSave.mockResolvedValue(true),
    };

    Product.findById.mockResolvedValue(product);

    const { buildEmbeddingContent, computeContentHash } = require('../utils/embeddingContent');
    const hash = computeContentHash(buildEmbeddingContent(product));

    const job = {
      id: 'ej-6',
      name: 'create',
      data: { productId: 'p5', contentHash: hash, action: 'create', correlationId: 'cid-6' },
      attemptsMade: 2,
      opts: { attempts: 3 },
    };

    await expect(processEmbeddingJob(job)).rejects.toThrow('Gemini API error');
    expect(product.embeddingStatus).toBe('failed');
    expect(product.embeddingError).toBe('Gemini API error');
  });

  it('propagates correlationId in logs', async () => {
    const pinoInfo = mockPino().info;
    const { processEmbeddingJob } = require('../jobs/embeddingJobs');
    const Product = require('../models/Product');
    Product.findById.mockResolvedValue(null);

    const job = {
      id: 'ej-7',
      name: 'create',
      data: { productId: 'p6', contentHash: 'abc', action: 'create', correlationId: 'my-cid-007' },
      attemptsMade: 0,
      opts: { attempts: 3 },
    };

    await processEmbeddingJob(job);

    const startCall = pinoInfo.mock.calls.find(c => c[1] === 'Embedding job started');
    expect(startCall).toBeDefined();
    expect(startCall[0]).toMatchObject({ productId: 'p6', correlationId: 'my-cid-007' });
  });

  it('does not log canonical text or vectors', async () => {
    const pinoInfo = mockPino().info;
    const pinoWarn = mockPino().warn;
    const pinoError = mockPino().error;

    const { processEmbeddingJob } = require('../jobs/embeddingJobs');
    const Product = require('../models/Product');
    Product.findById.mockResolvedValue(null);

    const job = {
      id: 'ej-8',
      name: 'create',
      data: { productId: 'p7', contentHash: 'abc', action: 'create', correlationId: 'cid-8' },
      attemptsMade: 0,
      opts: { attempts: 3 },
    };

    await processEmbeddingJob(job);

    const allCalls = [...pinoInfo.mock.calls, ...pinoWarn.mock.calls, ...pinoError.mock.calls];
    for (const args of allCalls) {
      if (args[0] && typeof args[0] === 'object') {
        expect(args[0]).not.toHaveProperty('canonicalText');
        expect(args[0]).not.toHaveProperty('vector');
        expect(args[0]).not.toHaveProperty('embedding_vector');
      }
    }
  });
});

describe('embedding queue service', () => {
  const mockAdd = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockAdd.mockReset().mockResolvedValue({ id: 'embedding-job-1' });

    const queueRegistry = require('../queues/queueRegistry');
    queueRegistry.register('embeddingQueue', { add: mockAdd });
  });

  afterEach(() => {
    const queueRegistry = require('../queues/queueRegistry');
    const q = queueRegistry.get('embeddingQueue');
    if (q && typeof q.safeClose === 'function') q.safeClose();
    queueRegistry.closeAll();
  });

  it('uses deterministic jobId: embedding-<productId>-<contentHash>', async () => {
    const { enqueueProductEmbedding } = require('../services/embeddingQueueService');

    await enqueueProductEmbedding('prod-1', 'canonical text for product', 'create', 'cid-1');

    const call = mockAdd.mock.calls[0];
    expect(call[0]).toBe('create');
    expect(call[1]).toMatchObject({ productId: 'prod-1', action: 'create', correlationId: 'cid-1' });
    expect(call[1]).toHaveProperty('contentHash');
    expect(call[2].jobId).toMatch(/^embedding-prod-1-[a-f0-9]{64}$/);
  });

  it('duplicate identical content produces same jobId', async () => {
    const { enqueueProductEmbedding } = require('../services/embeddingQueueService');

    await enqueueProductEmbedding('prod-2', 'same text', 'create', 'cid');
    const jobId1 = mockAdd.mock.calls[0][2].jobId;

    mockAdd.mockReset().mockResolvedValue({ id: 'embedding-job-2' });
    await enqueueProductEmbedding('prod-2', 'same text', 'create', 'cid');
    const jobId2 = mockAdd.mock.calls[0][2].jobId;

    expect(jobId1).toBe(jobId2);
  });

  it('changed content produces different jobId', async () => {
    const { enqueueProductEmbedding } = require('../services/embeddingQueueService');

    await enqueueProductEmbedding('prod-3', 'original text', 'create', 'cid');
    const jobId1 = mockAdd.mock.calls[0][2].jobId;

    mockAdd.mockReset().mockResolvedValue({ id: 'embedding-job-3' });
    await enqueueProductEmbedding('prod-3', 'changed text', 'create', 'cid');
    const jobId2 = mockAdd.mock.calls[0][2].jobId;

    expect(jobId1).not.toBe(jobId2);
  });

  it('sets retry options (attempts: 3, exponential backoff)', async () => {
    const { enqueueProductEmbedding } = require('../services/embeddingQueueService');

    await enqueueProductEmbedding('prod-4', 'text', 'create', 'cid');

    expect(mockAdd).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      }),
    );
  });

  it('falls back to direct processing when queue not registered', async () => {
    const queueRegistry = require('../queues/queueRegistry');
    queueRegistry.closeAll();

    const Product = require('../models/Product');
    const mockProductSave = jest.fn().mockResolvedValue(true);
    Product.findById = jest.fn().mockResolvedValue({
      _id: 'fallback-1',
      name: 'Test',
      brand: 'B',
      price: 100,
      description: 'D',
      specs: {},
      colors: [],
      embeddingStatus: 'pending',
      embeddingError: null,
      save: mockProductSave,
    });

    const { generateEmbedding } = require('../utils/openai');
    generateEmbedding.mockResolvedValue(new Array(1536).fill(0.1));

    const { enqueueProductEmbedding } = require('../services/embeddingQueueService');

    await enqueueProductEmbedding('fallback-1', 'some text', 'create', 'cid');

    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('fallback to direct processing is non-blocking', async () => {
    const queueRegistry = require('../queues/queueRegistry');
    queueRegistry.closeAll();

    const { enqueueProductEmbedding } = require('../services/embeddingQueueService');

    const result = await enqueueProductEmbedding('some-id', 'text', 'create', 'cid');

    expect(result).toBeUndefined();
  });

  it('fallback to direct is logged as warning', async () => {
    const pinoWarn = mockPino().warn;

    const queueRegistry = require('../queues/queueRegistry');
    queueRegistry.closeAll();

    const { enqueueProductEmbedding } = require('../services/embeddingQueueService');

    await enqueueProductEmbedding('prod-log', 'text', 'create', 'cid');

    expect(pinoWarn).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 'prod-log', action: 'create' }),
      'Embedding queue not available, processing directly',
    );
  });

  it('fallback on queue.add throw is logged as error', async () => {
    const pinoError = mockPino().error;
    mockAdd.mockRejectedValue(new Error('Redis down'));

    const { enqueueProductEmbedding } = require('../services/embeddingQueueService');

    await enqueueProductEmbedding('prod-err', 'text', 'create', 'cid');

    expect(pinoError).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'prod-err',
        err: { message: 'Redis down' },
      }),
      'Failed to enqueue embedding job, processing directly',
    );
  });

  it('enqueues with correlationId', async () => {
    const { enqueueProductEmbedding } = require('../services/embeddingQueueService');

    await enqueueProductEmbedding('prod-cid', 'text', 'create', 'my-correlation-id');

    expect(mockAdd).toHaveBeenCalledWith(
      'create',
      expect.objectContaining({ correlationId: 'my-correlation-id' }),
      expect.any(Object),
    );
  });

  it('does not log enqueued for already completed job', async () => {
    const pinoInfo = mockPino().info;
    mockAdd.mockResolvedValue({ id: 'existing-job', name: 'create', finishedOn: Date.now() });

    const { enqueueProductEmbedding } = require('../services/embeddingQueueService');

    await enqueueProductEmbedding('prod-existing', 'text', 'create', 'cid');

    const skipCall = pinoInfo.mock.calls.find(c => c[1] === 'Embedding job already completed, skipping');
    expect(skipCall).toBeDefined();

    const enqueueCall = pinoInfo.mock.calls.find(c => c[1] === 'Embedding job enqueued');
    expect(enqueueCall).toBeUndefined();
  });
});

describe('embedding bootstrap registration', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.GEMINI_API_KEY = 'test-key';
  });

  it('registers embeddingQueue and embeddingWorker in bootstrap', async () => {
    const queueRegistry = require('../queues/queueRegistry');
    const workerRegistry = require('../workers/workerRegistry');
    const { startBullMQ, stopBullMQ } = require('../bullmq/bootstrap');

    await startBullMQ();

    expect(queueRegistry.get('embeddingQueue')).toBeDefined();
    expect(workerRegistry.get('embeddingQueue')).toBeDefined();
    expect(queueRegistry.get('embeddingQueue').add).toBeDefined();

    await stopBullMQ();
  });

  it('embedding queue and worker close during shutdown', async () => {
    const { startBullMQ, stopBullMQ } = require('../bullmq/bootstrap');
    const queueRegistry = require('../queues/queueRegistry');
    const workerRegistry = require('../workers/workerRegistry');

    await startBullMQ();

    const embeddingQueue = queueRegistry.get('embeddingQueue');
    const embeddingWorker = workerRegistry.get('embeddingQueue');

    expect(embeddingQueue.safeClose).toBeDefined();
    expect(embeddingWorker.safeClose).toBeDefined();

    await stopBullMQ();
  });

  it('getBullMQHealth includes embedding queue fields', async () => {
    const { startBullMQ, stopBullMQ, getBullMQHealth } = require('../bullmq/bootstrap');

    await startBullMQ();
    const health = getBullMQHealth();
    expect(health).toHaveProperty('embeddingQueueEnabled');
    expect(health).toHaveProperty('embeddingQueueInitialized');
    expect(health.embeddingQueueInitialized).toBe(true);

    await stopBullMQ();
  });

  it('additive health fields do not break existing email health', async () => {
    const { startBullMQ, stopBullMQ, getBullMQHealth } = require('../bullmq/bootstrap');

    await startBullMQ();
    const health = getBullMQHealth();
    expect(health).toHaveProperty('emailQueueEnabled');
    expect(health).toHaveProperty('emailQueueInitialized');
    expect(health).toHaveProperty('embeddingQueueEnabled');
    expect(health).toHaveProperty('embeddingQueueInitialized');

    await stopBullMQ();
  });
});


