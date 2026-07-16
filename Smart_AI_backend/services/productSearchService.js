const Product = require('../models/Product');
const { generateEmbedding } = require('../utils/openai');

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 10;

const search = async (queryText, limit = DEFAULT_LIMIT) => {
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), MAX_LIMIT);

  console.log(`[Semantic Search] Query: "${queryText}"`);

  try {
    const queryVector = await generateEmbedding(queryText);

    console.log(`[Semantic Search] Embedding generated: ${queryVector.length} dimensions`);

    console.log(`[Semantic Search] Executing $vectorSearch on index "vector_index"`);

    let products = await Product.aggregate([
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
          score: { $meta: 'vectorSearchScore' },
        },
      },
      { $match: { isActive: true } },
    ]);

    console.log(`[Semantic Search] Vector results: ${products.length}`);

    if (products.length > 0) {
      return { products, searchMode: 'vector' };
    }

    console.log(`[Semantic Search] Vector Search EMPTY — switching to text fallback`);

    products = await Product.find(
      { $text: { $search: queryText }, isActive: true },
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

    products = await Product.find({ isActive: true, inStock: { $gt: 0 } })
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
      const products = await Product.find(
        { $text: { $search: queryText }, isActive: true },
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

      const fallbackProducts = await Product.find({ isActive: true, inStock: { $gt: 0 } })
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

module.exports = { search };
