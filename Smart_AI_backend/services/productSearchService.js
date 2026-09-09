const Product = require('../models/Product');
const { generateEmbedding } = require('../utils/openai');
const logger = require('../utils/logger');

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 10;

/**
 * Minimum vector-search relevance score (vectorSearchScore from Atlas).
 * Results below this threshold are treated as weak/noise matches and filtered
 * out before the empty-result fallback decision.
 */
const MIN_VECTOR_SCORE = 0.45;

/**
 * Build a MongoDB $match object from the constraints filters.
 * Returns null if no filter applies.
 */
function buildMongoFilter(filters) {
  if (!filters) return null;

  const conditions = [];

  // Price
  const price = {};
  if (filters.minPrice != null) price.$gte = filters.minPrice;
  if (filters.maxPrice != null) price.$lte = filters.maxPrice;
  if (Object.keys(price).length > 0) conditions.push({ price });

  // Brand (inclusion)
  if (Array.isArray(filters.brands) && filters.brands.length > 0) {
    conditions.push({ brand: { $in: filters.brands } });
  }

  // Brand (exclusion)
  if (Array.isArray(filters.excludedBrands) && filters.excludedBrands.length > 0) {
    conditions.push({ brand: { $nin: filters.excludedBrands } });
  }

  // Stock
  if (filters.inStock === true) {
    conditions.push({ inStock: { $gt: 0 } });
  } else if (filters.inStock === false) {
    conditions.push({ inStock: { $lte: 0 } });
  }

  if (conditions.length === 0) return null;
  return conditions.length === 1 ? conditions[0] : { $and: conditions };
}

/**
 * Build the `$vectorSearch.filter` object from the supported hard constraints.
 *
 * Only fields verified as declared filter fields on the Atlas `vector_index`
 * are emitted: `isActive`, `brand` and `price` (the same set already used by
 * `productRecommendationService.buildConstraintMatch` against this index).
 * `inStock` is explicitly NOT a filter field there, so it is left for
 * `buildVectorPostFilter`. RAM/storage/color are string-parsed in JS
 * (`productValidator`) and never appear here.
 *
 * Returns null when no supported filter field applies, so an empty filter is
 * never emitted (mirrors `productRecommendationService.buildConstraintMatch`).
 * Brand uses the exact-equality form for a single brand (the proven shape used
 * by the recommendation service) and `$in` for multiple brands.
 */
function buildVectorPreFilter(filters) {
  if (!filters) return null;

  const filter = {};

  const price = {};
  if (filters.minPrice != null) price.$gte = filters.minPrice;
  if (filters.maxPrice != null) price.$lte = filters.maxPrice;
  if (Object.keys(price).length > 0) filter.price = price;

  if (Array.isArray(filters.brands) && filters.brands.length > 0) {
    filter.brand = filters.brands.length === 1
      ? filters.brands[0]
      : { $in: filters.brands };
  }

  if (Object.keys(filter).length === 0) return null;
  filter.isActive = true;
  return filter;
}

/**
 * Build the vector-tier post-retrieval $match from constraints that are NOT
 * supported as Atlas filter fields: `inStock` (explicitly documented as not a
 * filter field) and `excludedBrands`. Returns null when nothing applies.
 */
function buildVectorPostFilter(filters) {
  if (!filters) return null;

  const conditions = [];

  if (Array.isArray(filters.excludedBrands) && filters.excludedBrands.length > 0) {
    conditions.push({ brand: { $nin: filters.excludedBrands } });
  }

  if (filters.inStock === true) {
    conditions.push({ inStock: { $gt: 0 } });
  } else if (filters.inStock === false) {
    conditions.push({ inStock: { $lte: 0 } });
  }

  if (conditions.length === 0) return null;
  return conditions.length === 1 ? conditions[0] : { $and: conditions };
}

/**
 * Bounded, deterministic candidate window for a constrained vector search.
 *
 * W is the `$vectorSearch.limit` widened over the requested K so post-retrieval
 * filtering (inStock / excludedBrands) still has headroom to produce K final
 * results. numCandidates follows W so Atlas examines enough candidates to fill
 * the window. W is always >= K and capped at MAX_LIMIT; numCandidates is capped
 * at MAX_LIMIT * 10. Mirrors `productRecommendationService.candidateWindow`.
 */
const candidateWindow = (K) => {
  const W = Math.min(Math.max(3 * K, 12), MAX_LIMIT);
  return { W, numCandidates: Math.max(W * 10, 100) };
};

const search = async (queryText, limit = DEFAULT_LIMIT, filters = null) => {
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), MAX_LIMIT);

  logger.debug({ queryLength: queryText?.length || 0 }, '[Semantic Search] Query received');
  if (filters) {
    const logSafe = { ...filters };
    logger.debug({ filters: logSafe }, '[Semantic Search] Filters');
  }

  const mongoFilter = buildMongoFilter(filters);
  const vectorPreFilter = buildVectorPreFilter(filters);
  const vectorPostFilter = buildVectorPostFilter(filters);

  try {
    const queryVector = await generateEmbedding(queryText);

    logger.debug({ dimensions: queryVector.length }, '[Semantic Search] Embedding generated');

    logger.debug('[Semantic Search] Executing $vectorSearch on index "vector_index"');

    const { W, numCandidates } = vectorPreFilter ? candidateWindow(safeLimit) : { W: safeLimit, numCandidates: 100 };

    const vectorSearch = {
      index: 'vector_index',
      path: 'embedding_vector',
      queryVector: queryVector,
      numCandidates: numCandidates,
      limit: W,
    };
    if (vectorPreFilter) {
      vectorSearch.filter = vectorPreFilter;
    }

    const pipeline = [
      { $vectorSearch: vectorSearch },
      {
        $project: {
          embedding_vector: 0,
          embeddingError: 0,
          score: { $meta: 'vectorSearchScore' },
        },
      },
      { $match: { isActive: true } },
    ];

    if (vectorPostFilter) {
      pipeline.push({ $match: vectorPostFilter });
    }

    // With a widened candidate window, cap the returned result at the requested K.
    if (W > safeLimit) {
      pipeline.push({ $limit: safeLimit });
    }

    let products = await Product.aggregate(pipeline);

    // Filter out weak semantic matches that fall below the relevance threshold.
    // $vectorSearch always returns K nearest neighbors even for near-random
    // similarity; without this gate, noise results enter search/RAG context.
    products = products.filter(
      (p) => typeof p.score === 'number' && isFinite(p.score) && p.score >= MIN_VECTOR_SCORE
    );

    logger.debug({ resultCount: products.length }, '[Semantic Search] Vector results');

    if (products.length > 0) {
      return { products, searchMode: 'vector' };
    }

    logger.debug('[Semantic Search] Vector Search EMPTY — switching to text fallback');

    const textFilter = { $text: { $search: queryText }, isActive: true };
    if (mongoFilter) Object.assign(textFilter, mongoFilter);

    products = await Product.find(
      textFilter,
      { score: { $meta: 'textScore' } }
    )
      .select('-embedding_vector')
      .sort({ score: { $meta: 'textScore' } })
      .limit(safeLimit)
      .lean();

    logger.debug({ resultCount: products.length }, '[Semantic Search] Text Search FALLBACK results');

    if (products.length > 0) {
      return { products, searchMode: 'text' };
    }

    logger.debug('[Semantic Search] Text also empty — using latest-products fallback');

    const latestFilter = { isActive: true, inStock: { $gt: 0 } };
    if (mongoFilter) Object.assign(latestFilter, mongoFilter);

    products = await Product.find(latestFilter)
      .sort({ createdAt: -1 })
      .select('-embedding_vector')
      .limit(safeLimit)
      .lean();

    logger.debug({ resultCount: products.length }, '[Semantic Search] Fallback results');

    return { products, searchMode: 'fallback' };
  } catch (error) {
    logger.debug('[Semantic Search] $vectorSearch THREW an error — switching to text fallback');
    logger.debug({
      message: error.message,
      code: error.code,
      codeName: error.codeName,
    }, '[Semantic Search] vector search error details');
    if (process.env.NODE_ENV === 'development') {
      logger.debug({ stack: error.stack }, '[Semantic Search] vector search stack');
    }

    try {
      const textFilter = { $text: { $search: queryText }, isActive: true };
      if (mongoFilter) Object.assign(textFilter, mongoFilter);

      const products = await Product.find(
        textFilter,
        { score: { $meta: 'textScore' } }
      )
        .select('-embedding_vector')
        .sort({ score: { $meta: 'textScore' } })
        .limit(safeLimit)
        .lean();

      logger.debug({ resultCount: products.length }, '[Semantic Search] Text Search FALLBACK results');

      if (products.length > 0) {
        return { products, searchMode: 'text' };
      }

      logger.debug('[Semantic Search] Text also empty — using latest-products fallback');

      const latestFilter = { isActive: true, inStock: { $gt: 0 } };
      if (mongoFilter) Object.assign(latestFilter, mongoFilter);

      const fallbackProducts = await Product.find(latestFilter)
        .sort({ createdAt: -1 })
        .select('-embedding_vector')
        .limit(safeLimit)
        .lean();

      logger.debug({ resultCount: fallbackProducts.length }, '[Semantic Search] Fallback results');

      return { products: fallbackProducts, searchMode: 'fallback' };
    } catch (fallbackError) {
      logger.warn({ err: { message: fallbackError.message } }, '[Semantic Search] Fallback also threw');
      return { products: [], searchMode: 'fallback' };
    }
  }
};

module.exports = { search, buildMongoFilter, buildVectorPreFilter, buildVectorPostFilter, candidateWindow };
