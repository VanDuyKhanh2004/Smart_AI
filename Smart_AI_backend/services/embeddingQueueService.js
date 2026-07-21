const logger = require('../utils/logger');
const queueRegistry = require('../queues/queueRegistry');
const Product = require('../models/Product');
const { generateEmbedding } = require('../utils/openai');
const { buildEmbeddingContent, computeContentHash } = require('../utils/embeddingContent');

const QUEUE_NAME = 'embeddingQueue';

function getQueue() {
  return queueRegistry.get(QUEUE_NAME);
}

async function enqueue(action, payload, jobId) {
  const cid = payload.correlationId || null;
  const logMeta = { action, productId: payload.productId, correlationId: cid };

  const queue = getQueue();

  if (!queue) {
    logger.warn(logMeta, 'Embedding queue not available, processing directly');
    fireForgetDirect(payload);
    return;
  }

  try {
    const job = await queue.add(action, payload, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 100, age: 3600 * 24 },
      removeOnFail: { count: 50, age: 3600 * 24 * 7 },
    });

    if (job.finishedOn) {
      logger.info({ ...logMeta, jobId: job.id }, 'Embedding job already completed, skipping');
      return;
    }

    logger.info({ ...logMeta, jobId: job.id }, 'Embedding job enqueued');
  } catch (err) {
    logger.error({ ...logMeta, err: { message: err.message } }, 'Failed to enqueue embedding job, processing directly');
    fireForgetDirect(payload);
  }
}

function fireForgetDirect(payload) {
  const promise = processDirect(payload);
  promise.catch((err) => {
    logger.error({ productId: payload.productId, action: payload.action, err: { message: err.message } }, 'Direct embedding fallback failed');
  });
}

async function processDirect(payload) {
  const { productId, contentHash, action, correlationId } = payload;
  const logMeta = { productId, action, correlationId: correlationId || null };

  const product = await Product.findById(productId);
  if (!product) {
    logger.warn(logMeta, 'Direct embedding skipped — product not found');
    return;
  }

  logger.info({ ...logMeta }, 'Direct embedding fallback started');

  const canonicalText = buildEmbeddingContent(product);
  const currentHash = computeContentHash(canonicalText);

  if (currentHash !== contentHash) {
    logger.info(logMeta, 'Direct embedding skipped as stale');
    return;
  }

  try {
    product.embeddingStatus = 'processing';
    product.embeddingError = null;
    await product.save();

    const vector = await generateEmbedding(canonicalText);

    if (!Array.isArray(vector) || vector.length !== 1536) {
      throw new Error(`Invalid embedding dimensions: ${vector ? vector.length : 'undefined'}, expected 1536`);
    }

    product.embedding_vector = vector;
    product.embeddingStatus = 'ready';
    product.embeddingContentHash = currentHash;
    product.embeddingUpdatedAt = new Date();
    product.embeddingError = null;
    await product.save();

    logger.info(logMeta, 'Direct embedding fallback completed');
  } catch (err) {
    product.embeddingStatus = 'failed';
    product.embeddingError = err.message;
    await product.save();

    logger.error({ ...logMeta, err: { message: err.message } }, 'Direct embedding fallback failed');
  }
}

function enqueueProductEmbedding(productId, text, action, correlationId) {
  const contentHash = computeContentHash(text);
  const payload = { productId, contentHash, action, correlationId };
  const jobId = `embedding-${productId}-${contentHash}`;
  return enqueue(action, payload, jobId);
}

module.exports = {
  enqueueProductEmbedding,
  QUEUE_NAME,
};
