const Product = require("../models/Product");
const mongoose = require("mongoose");
const logger = require("../utils/logger");

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

const sanitizeLimit = (limit) => {
  const n = Number(limit);
  if (isNaN(n) || !isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(n), 1), MAX_LIMIT);
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
 * Used as a HARD filter in every recommendation path so an explicitly
 * requested brand/budget is never silently ignored.
 */
const buildConstraintMatch = (constraints) => {
  if (!constraints) return {};
  const match = {};
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
  const constraintMatch = buildConstraintMatch(constraints);
  const pipeline = [
    {
      $vectorSearch: {
        index: "vector_index",
        path: "embedding_vector",
        queryVector: sourceProduct.embedding_vector,
        numCandidates: Math.max(safeLimit * 10, 50),
        limit: safeLimit + 1,
      },
    },
    {
      $match: {
        _id: { $ne: sourceProduct._id },
        isActive: true,
        ...constraintMatch,
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
    { $limit: safeLimit },
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
          products,
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
      products: brandPriceProducts,
      recommendationMode: "brand_price",
      constraints: sanitizedConstraints,
    };
  }

  logger.debug('[Recommendation] Using latest-products fallback');
  const latestProducts = await recommendLatest(sourceProduct, safeLimit, sanitizedConstraints);

  return {
    sourceProduct: { _id: sourceProduct._id, name: sourceProduct.name },
    products: latestProducts,
    recommendationMode: "fallback",
    constraints: sanitizedConstraints,
  };
};

module.exports = { recommend };
