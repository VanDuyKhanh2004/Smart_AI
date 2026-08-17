const Product = require("../models/Product");
const mongoose = require("mongoose");
const logger = require("../utils/logger");
const { rankProducts } = require("../utils/productRanking");

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

const sanitizeLimit = (limit) => {
  const n = Number(limit);
  if (isNaN(n) || !isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(n), 1), MAX_LIMIT);
};

/**
 * Widened candidate window for vector retrieval.
 *
 * W is used as the $vectorSearch limit so post-retrieval hard filtering,
 * preference ranking and diversity/deduplication still have headroom to
 * produce K final results. numCandidates follows W so Atlas examines
 * enough candidates to fill the window.
 */
const candidateWindow = (K) => {
  const W = Math.min(Math.max(3 * K, 12), 30);
  return { W, numCandidates: Math.max(W * 10, 50) };
};

/**
 * Map parsed priority keywords onto the rankProducts preference keys.
 *
 *   camera     -> camera
 *   battery    -> battery
 *   performance -> performance
 *   gaming     -> performance  (no separate gaming ranking dimension)
 *
 * Returns null when no priority maps to a known preference so callers can
 * skip ranking entirely.
 */
const mapPrioritiesToPreferences = (priorities) => {
  if (!Array.isArray(priorities) || priorities.length === 0) return null;
  const preferences = {
    camera: false,
    battery: false,
    performance: false,
    compact: false,
  };
  for (const priority of priorities) {
    const key = String(priority).toLowerCase();
    if (key === "camera") preferences.camera = true;
    else if (key === "battery") preferences.battery = true;
    else if (key === "performance" || key === "gaming") {
      preferences.performance = true;
    }
  }
  const hasAny =
    preferences.camera ||
    preferences.battery ||
    preferences.performance ||
    preferences.compact;
  return hasAny ? preferences : null;
};

/**
 * Enforce diversity on a ranked candidate list.
 *
 * 1. Deduplicate by normalized product name (name.toLowerCase().trim()).
 * 2. Cap the number of products per brand at Math.ceil(K / 2).
 * 3. Return at most K products.
 *
 * Preserves the incoming ranking order.
 */
const applyDiversity = (products, K) => {
  const maxPerBrand = Math.ceil(K / 2);
  const seenNames = new Set();
  const brandCounts = new Map();
  const diverse = [];

  for (const product of products) {
    if (!product) continue;

    const nameKey = String(product.name || "").toLowerCase().trim();
    if (seenNames.has(nameKey)) continue;
    seenNames.add(nameKey);

    const brand = product.brand;
    const count = brandCounts.get(brand) || 0;
    if (count >= maxPerBrand) continue;
    brandCounts.set(brand, count + 1);

    diverse.push(product);
    if (diverse.length >= K) break;
  }

  return diverse;
};

/**
 * Finalize a candidate list before it is returned to the client:
 * drop out-of-stock items (defense-in-depth on top of the Mongo $match),
 * apply preference ranking when priorities exist, then enforce diversity
 * and slice to K. Preserves the existing order when no priorities exist.
 */
const finalizeRecommendations = (products, safeLimit, priorities) => {
  const available = products.filter((p) => p && p.inStock > 0);
  const preferences = mapPrioritiesToPreferences(priorities);
  const ranked = preferences
    ? rankProducts(available, preferences).ranked
    : available;
  return applyDiversity(ranked, safeLimit);
};

const hasValidEmbedding = (product) => {
  return (
    product &&
    Array.isArray(product.embedding_vector) &&
    product.embedding_vector.length === 1536
  );
};

/* ------------------------------------------------------------------ */
/*  Constraint normalization and filtering                             */
/* ------------------------------------------------------------------ */

/**
 * Normalize an optional constraints object into a clean, safe shape.
 * Accepts the recommendationConstraintParser contract:
 *   { budgetMin, budgetMax, brand, priorities }
 * Returns null when no meaningful constraint is present (preserves the
 * legacy two-argument call path exactly).
 */
const sanitizeConstraints = (constraints) => {
  if (!constraints || typeof constraints !== "object") return null;

  const brand =
    typeof constraints.brand === "string" && constraints.brand.trim()
      ? constraints.brand.trim().toLowerCase()
      : null;
  const budgetMin = Number.isFinite(constraints.budgetMin)
    ? constraints.budgetMin
    : null;
  const budgetMax = Number.isFinite(constraints.budgetMax)
    ? constraints.budgetMax
    : null;
  const priorities = Array.isArray(constraints.priorities)
    ? constraints.priorities.filter((p) => typeof p === "string")
    : [];

  const hasHard =
    Boolean(brand) || budgetMin != null || budgetMax != null;
  if (!hasHard && priorities.length === 0) return null;

  return { brand, budgetMin, budgetMax, priorities };
};

/**
 * Build a Mongo match/filter object from sanitized constraints.
 * Used as a HARD pre-filter in every recommendation path so an explicitly
 * requested brand/budget is never silently ignored. When constraints exist
 * it always enforces isActive so MongoDB Vector Search can pre-filter
 * against the `vector_index` filter fields (brand, price, isActive).
 * Returns {} when no hard constraints are supplied so an empty
 * `$vectorSearch.filter` is never emitted.
 */
const buildConstraintMatch = (constraints) => {
  if (!constraints) return {};
  const match = { isActive: true };
  if (constraints.brand) match.brand = constraints.brand;
  const price = {};
  if (constraints.budgetMin != null) price.$gte = constraints.budgetMin;
  if (constraints.budgetMax != null) price.$lte = constraints.budgetMax;
  if (Object.keys(price).length > 0) match.price = price;
  return match;
};

const findSourceProduct = async (productId) => {
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return { error: "INVALID_ID" };
  }
  const product = await Product.findById(productId).lean();
  if (!product) {
    return { error: "NOT_FOUND" };
  }
  return { product };
};

const recommendByVector = async (sourceProduct, safeLimit, constraints) => {
  // Hard constraints (isActive, brand, price range) are applied by MongoDB
  // Vector Search itself via $vectorSearch.filter, pre-filtering candidates
  // during retrieval instead of post-filtering retrieved results.
  // NOTE: inStock is intentionally NOT added to $vectorSearch.filter because
  // the Atlas vector_index may not declare inStock as a filter field; it is
  // enforced via the regular $match stage below instead.
  const constraintFilter = buildConstraintMatch(constraints);
  const { W, numCandidates } = candidateWindow(safeLimit);

  const vectorSearch = {
    index: "vector_index",
    path: "embedding_vector",
    queryVector: sourceProduct.embedding_vector,
    numCandidates,
    limit: W,
  };
  if (Object.keys(constraintFilter).length > 0) {
    vectorSearch.filter = constraintFilter;
  }

  const pipeline = [
    { $vectorSearch: vectorSearch },
    {
      $match: {
        _id: { $ne: sourceProduct._id },
        isActive: true,
        inStock: { $gt: 0 },
      },
    },
    {
      $project: {
        embedding_vector: 0,
        embeddingError: 0,
        score: { $meta: "vectorSearchScore" },
      },
    },
    { $sort: { inStock: -1, score: -1 } },
    { $limit: W },
  ];

  const products = await Product.aggregate(pipeline);
  return products;
};

const recommendByBrandPrice = async (sourceProduct, safeLimit, constraints) => {
  const priceMin = sourceProduct.price * 0.8;
  const priceMax = sourceProduct.price * 1.2;

  // User's explicit brand constraint overrides the source-product brand
  // heuristic; otherwise keep the existing source-brand behavior.
  const brand = constraints && constraints.brand
    ? constraints.brand
    : sourceProduct.brand;

  // Constrain the ±20% price band with explicit budget bounds.
  let gte = priceMin;
  let lte = priceMax;
  if (constraints && constraints.budgetMin != null) gte = Math.max(gte, constraints.budgetMin);
  if (constraints && constraints.budgetMax != null) lte = Math.min(lte, constraints.budgetMax);

  if (gte > lte) return [];

  return Product.find({
    brand,
    _id: { $ne: sourceProduct._id },
    isActive: true,
    inStock: { $gt: 0 },
    price: { $gte: gte, $lte: lte },
  })
    .sort({ inStock: -1, createdAt: -1 })
    .select("-embedding_vector")
    .limit(safeLimit)
    .lean();
};

const recommendLatest = async (sourceProduct, safeLimit, constraints) => {
  const constraintMatch = buildConstraintMatch(constraints);

  return Product.find({
    _id: { $ne: sourceProduct._id },
    isActive: true,
    inStock: { $gt: 0 },
    ...constraintMatch,
  })
    .sort({ inStock: -1, createdAt: -1 })
    .select("-embedding_vector")
    .limit(safeLimit)
    .lean();
};

const recommend = async (productId, limit = DEFAULT_LIMIT, constraints = null) => {
  const safeLimit = sanitizeLimit(limit);
  const sanitizedConstraints = sanitizeConstraints(constraints);
  const priorities = sanitizedConstraints ? sanitizedConstraints.priorities : [];

  const sourceResult = await findSourceProduct(productId);
  if (sourceResult.error) {
    return { error: sourceResult.error };
  }

  const sourceProduct = sourceResult.product;
  logger.debug(
    { sourceProductId: sourceProduct._id, sourceProductName: sourceProduct.name },
    '[Recommendation] Source product'
  );

  if (hasValidEmbedding(sourceProduct)) {
    try {
      logger.debug('[Recommendation] Executing vector search');
      const products = await recommendByVector(sourceProduct, safeLimit, sanitizedConstraints);
      logger.debug({ resultCount: products.length }, '[Recommendation] Vector results');

      if (products.length > 0) {
        return {
          sourceProduct: { _id: sourceProduct._id, name: sourceProduct.name },
          products: finalizeRecommendations(products, safeLimit, priorities),
          recommendationMode: "vector",
          constraints: sanitizedConstraints,
        };
      }
    } catch (error) {
      logger.warn({ err: { message: error.message } }, '[Recommendation] Vector search error');
    }
  }

  logger.debug('[Recommendation] Using brand-price fallback');
  const brandPriceProducts = await recommendByBrandPrice(
    sourceProduct,
    safeLimit,
    sanitizedConstraints
  );

  if (brandPriceProducts.length > 0) {
    return {
      sourceProduct: { _id: sourceProduct._id, name: sourceProduct.name },
      products: finalizeRecommendations(brandPriceProducts, safeLimit, priorities),
      recommendationMode: "brand_price",
      constraints: sanitizedConstraints,
    };
  }

  logger.debug('[Recommendation] Using latest-products fallback');
  const latestProducts = await recommendLatest(sourceProduct, safeLimit, sanitizedConstraints);

  return {
    sourceProduct: { _id: sourceProduct._id, name: sourceProduct.name },
    products: finalizeRecommendations(latestProducts, safeLimit, priorities),
    recommendationMode: "fallback",
    constraints: sanitizedConstraints,
  };
};

module.exports = { recommend };
