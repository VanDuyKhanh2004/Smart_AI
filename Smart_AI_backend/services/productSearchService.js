const Product = require('../models/Product');
const { generateEmbedding } = require('../utils/openai');

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 10;

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

const search = async (queryText, limit = DEFAULT_LIMIT, filters = null) => {
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), MAX_LIMIT);

  console.log(`[Semantic Search] Query: "${queryText}"`);
  if (filters) {
    const logSafe = { ...filters };
    console.log(`[Semantic Search] Filters: ${JSON.stringify(logSafe)}`);
  }

  const mongoFilter = buildMongoFilter(filters);

  try {
    const queryVector = await generateEmbedding(queryText);

    console.log(`[Semantic Search] Embedding generated: ${queryVector.length} dimensions`);

    console.log(`[Semantic Search] Executing $vectorSearch on index "vector_index"`);

    const pipeline = [
      {
        $vectorSearch: {
          index: 'vector_index',
          path: 'embedding_vector',
          queryVector: queryVector,
          numCandidates: 100,
          limit: safeLimit,
        },
      },
      {
        $project: {
          embedding_vector: 0,
          embeddingError: 0,
          score: { $meta: 'vectorSearchScore' },
        },
      },
      { $match: { isActive: true } },
    ];

    if (mongoFilter) {
      pipeline.push({ $match: mongoFilter });
    }

    let products = await Product.aggregate(pipeline);

    console.log(`[Semantic Search] Vector results: ${products.length}`);

    if (products.length > 0) {
      return { products, searchMode: 'vector' };
    }

    console.log(`[Semantic Search] Vector Search EMPTY — switching to text fallback`);

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

    console.log(`[Semantic Search] Text Search FALLBACK — results: ${products.length}`);

    if (products.length > 0) {
      return { products, searchMode: 'text' };
    }

    console.log(`[Semantic Search] Text also empty — using latest-products fallback`);

    const latestFilter = { isActive: true, inStock: { $gt: 0 } };
    if (mongoFilter) Object.assign(latestFilter, mongoFilter);

    products = await Product.find(latestFilter)
      .sort({ createdAt: -1 })
      .select('-embedding_vector')
      .limit(safeLimit)
      .lean();

    console.log(`[Semantic Search] Fallback results: ${products.length}`);

    return { products, searchMode: 'fallback' };
  } catch (error) {
    console.log(`[Semantic Search] $vectorSearch THREW an error — switching to text fallback`);
    console.log(`[Semantic Search]   message: ${error.message}`);
    console.log(`[Semantic Search]   code: ${error.code}`);
    console.log(`[Semantic Search]   codeName: ${error.codeName}`);
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Semantic Search]   stack: ${error.stack}`);
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

      console.log(`[Semantic Search] Text Search FALLBACK — results: ${products.length}`);

      if (products.length > 0) {
        return { products, searchMode: 'text' };
      }

      console.log(`[Semantic Search] Text also empty — using latest-products fallback`);

      const latestFilter = { isActive: true, inStock: { $gt: 0 } };
      if (mongoFilter) Object.assign(latestFilter, mongoFilter);

      const fallbackProducts = await Product.find(latestFilter)
        .sort({ createdAt: -1 })
        .select('-embedding_vector')
        .limit(safeLimit)
        .lean();

      console.log(`[Semantic Search] Fallback results: ${fallbackProducts.length}`);

      return { products: fallbackProducts, searchMode: 'fallback' };
    } catch (fallbackError) {
      console.log(`[Semantic Search] Fallback also threw: ${fallbackError.message}`);
      return { products: [], searchMode: 'fallback' };
    }
  }
};

module.exports = { search, buildMongoFilter };
