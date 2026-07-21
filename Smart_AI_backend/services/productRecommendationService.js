const Product = require("../models/Product");
const mongoose = require("mongoose");

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

const recommendByVector = async (sourceProduct, safeLimit) => {
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

const recommendByBrandPrice = async (sourceProduct, safeLimit) => {
  const priceMin = sourceProduct.price * 0.8;
  const priceMax = sourceProduct.price * 1.2;

  return Product.find({
    brand: sourceProduct.brand,
    _id: { $ne: sourceProduct._id },
    isActive: true,
    price: { $gte: priceMin, $lte: priceMax },
  })
    .sort({ inStock: -1, createdAt: -1 })
    .select("-embedding_vector")
    .limit(safeLimit)
    .lean();
};

const recommendLatest = async (sourceProduct, safeLimit) => {
  return Product.find({
    _id: { $ne: sourceProduct._id },
    isActive: true,
  })
    .sort({ inStock: -1, createdAt: -1 })
    .select("-embedding_vector")
    .limit(safeLimit)
    .lean();
};

const recommend = async (productId, limit = DEFAULT_LIMIT) => {
  const safeLimit = sanitizeLimit(limit);

  const sourceResult = await findSourceProduct(productId);
  if (sourceResult.error) {
    return { error: sourceResult.error };
  }

  const sourceProduct = sourceResult.product;
  console.log(
    `[Recommendation] Source product: ${sourceProduct.name} (${sourceProduct._id})`
  );

  if (hasValidEmbedding(sourceProduct)) {
    try {
      console.log(`[Recommendation] Executing vector search`);
      const products = await recommendByVector(sourceProduct, safeLimit);
      console.log(`[Recommendation] Vector results: ${products.length}`);

      if (products.length > 0) {
        return {
          sourceProduct: { _id: sourceProduct._id, name: sourceProduct.name },
          products,
          recommendationMode: "vector",
        };
      }
    } catch (error) {
      console.log(`[Recommendation] Vector search error: ${error.message}`);
    }
  }

  console.log(`[Recommendation] Using brand-price fallback`);
  const brandPriceProducts = await recommendByBrandPrice(
    sourceProduct,
    safeLimit
  );

  if (brandPriceProducts.length > 0) {
    return {
      sourceProduct: { _id: sourceProduct._id, name: sourceProduct.name },
      products: brandPriceProducts,
      recommendationMode: "brand_price",
    };
  }

  console.log(`[Recommendation] Using latest-products fallback`);
  const latestProducts = await recommendLatest(sourceProduct, safeLimit);

  return {
    sourceProduct: { _id: sourceProduct._id, name: sourceProduct.name },
    products: latestProducts,
    recommendationMode: "fallback",
  };
};

module.exports = { recommend };
