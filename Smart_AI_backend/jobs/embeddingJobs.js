const logger = require('../utils/logger');
const Product = require('../models/Product');
const { generateEmbedding } = require('../utils/openai');
const { buildEmbeddingContent, computeContentHash } = require('../utils/embeddingContent');

async function processEmbeddingJob(job) {
  const startedAt = Date.now();
  const { productId, contentHash, action, correlationId } = job.data || {};

  if (!productId || !contentHash || !action) {
    throw new Error('Invalid embedding job payload: missing productId, contentHash, or action');
  }

  const logContext = {
    jobId: job.id,
    jobName: job.name,
    action,
    productId,
    correlationId: correlationId || null,
    attemptsMade: job.attemptsMade,
  };

  logger.info(logContext, 'Embedding job started');

  const product = await Product.findById(productId);
  if (!product) {
    logger.warn({ ...logContext }, 'Embedding job skipped — product not found');
    return { skipped: true, reason: 'product_not_found' };
  }

  const canonicalText = buildEmbeddingContent(product);
  const currentHash = computeContentHash(canonicalText);

  if (currentHash !== contentHash) {
    logger.info({ ...logContext, contentHashPrefix: contentHash.slice(0, 8) }, 'Embedding job skipped as stale');
    return { skipped: true, reason: 'stale' };
  }

  product.embeddingStatus = 'processing';
  product.embeddingError = null;
  await product.save();

  try {
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

    const durationMs = Date.now() - startedAt;
    logger.info({ ...logContext, durationMs }, 'Embedding job completed');
    return { productId, action };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const isFinalAttempt = job.attemptsMade + 1 >= (job.opts && job.opts.attempts ? job.opts.attempts : 3);

    if (isFinalAttempt) {
      product.embeddingStatus = 'failed';
      product.embeddingError = err.message;
      await product.save();
    }

    logger.error({ ...logContext, durationMs, err: { message: err.message } }, 'Embedding job failed');
    throw err;
  }
}

module.exports = { processEmbeddingJob };
