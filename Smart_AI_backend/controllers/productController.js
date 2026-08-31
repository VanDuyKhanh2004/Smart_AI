const Product = require("../models/Product");
const Review = require("../models/Review");
const cache = require("../services/cacheService");
const { search: semanticSearch } = require("../services/productSearchService");
const { recommend: productRecommend } = require("../services/productRecommendationService");
const { parseRecommendationConstraints } = require("../utils/recommendationConstraintParser");
const { buildEmbeddingContent, computeContentHash } = require("../utils/embeddingContent");
const { normalizeProductSpecs } = require("../utils/productSpecs");
const { enqueueProductEmbedding } = require("../services/embeddingQueueService");
const { uploadProductImageIfNeeded, uploadProductImageBuffer, deleteImageFromCloudinary, ProductImageValidationError } = require("../services/productImageService");
const logger = require("../utils/logger");
const asyncHandler = require("../utils/asyncHandler");
const { AppError, BadRequestError, NotFoundError } = require("../utils/errors");

/**
 * Normalize a user search query for consistent text matching.
 * - Trims leading/trailing whitespace
 * - Collapses repeated internal whitespace
 * - Lowercases for case-insensitive matching
 *
 * Does NOT strip punctuation or hyphens that may be part of real model names
 * (e.g., "Galaxy S24-Ultra" or "iPhone 15 Pro Max").
 */
function normalizeSearchQuery(raw) {
  if (!raw || typeof raw !== "string") return "";
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Common product-suffix tokens that appear across many unrelated products.
 * When a multi-token search has only these generic tokens matching a product
 * name, that product is too weakly related and should be filtered out.
 */
const GENERIC_SEARCH_TOKENS = new Set([
  "pro",
  "max",
  "plus",
  "ultra",
  "lite",
  "mini",
  "se",
  "note",
  "air",
  "s",
  "t",
  "r",
  "x",
]);

/**
 * Returns true if the product name contains at least one non-generic search
 * token. Single-token searches always pass (the token itself is specific
 * enough to have been the user's intent). Empty/whitespace-only searches pass.
 */
function hasNonGenericTokenMatch(productName, searchTokens) {
  if (!searchTokens || searchTokens.length === 0) return true;
  if (searchTokens.length === 1) return true;
  const name = productName.toLowerCase();
  return searchTokens.some((t) => !GENERIC_SEARCH_TOKENS.has(t) && name.includes(t));
}

/**
 * Escape all regex metacharacters in a user-supplied string so it can be
 * safely embedded in a RegExp constructor.
 */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Multipart text fields arrive as strings. Coerce the known product fields to
 * their JSON types only when a file upload is present; JSON bodies pass through
 * untouched so the existing API contract is preserved.
 */
function parseMultipartProductFields(req) {
  if (!req.file || !req.body || typeof req.body !== 'object') return;

  const { body } = req;

  const toNumber = (field, name) => {
    if (body[field] === undefined || body[field] === null) return;
    if (typeof body[field] === 'number') return;
    const num = Number(body[field]);
    if (Number.isNaN(num)) {
      throw new BadRequestError(`${name} phải là số hợp lệ`, 'INVALID_MULTIPART_FIELD');
    }
    body[field] = num;
  };

  const toJson = (field) => {
    if (body[field] === undefined || body[field] === null) return;
    if (typeof body[field] !== 'string') return;
    const trimmed = body[field].trim();
    if (trimmed === '') {
      body[field] = undefined;
      return;
    }
    try {
      body[field] = JSON.parse(trimmed);
    } catch {
      throw new BadRequestError(`Trường ${field} phải là JSON hợp lệ`, 'INVALID_MULTIPART_FIELD');
    }
  };

  toNumber('price', 'Giá');
  toNumber('inStock', 'Số lượng tồn kho');
  toJson('colors');
  toJson('tags');
  toJson('specs');
}

/**
 * A product image must come from exactly one source: a multipart file OR the
 * JSON image field. Returns a summary of which source is present.
 */
function resolveImageSource(req) {
  const hasFile = Boolean(req.file);
  const bodyImage = req.body.image;
  const hasBodyImage = typeof bodyImage === 'string' && bodyImage.trim() !== '';

  if (hasFile && hasBodyImage) {
    throw new BadRequestError(
      'Chỉ cung cấp một nguồn ảnh: file tải lên hoặc URL/Base64',
      'IMAGE_SOURCE_CONFLICT',
    );
  }

  return { hasFile, hasBodyImage };
}

async function processProductImage(req) {
  const { hasFile } = resolveImageSource(req);
  if (hasFile) {
    return uploadProductImageBuffer(req.file.buffer, req.file.mimetype);
  }
  return uploadProductImageIfNeeded(req.body.image);
}

/**
 * Best-effort Cloudinary image cleanup. Never throws, so it can safely run
 * during rollback without masking the original error.
 */
async function cleanupProductImage(publicId, log, requestId) {
  if (!publicId) return;
  const result = await deleteImageFromCloudinary(publicId);
  if (!result.deleted) {
    log.warn({ publicId, requestId }, 'Cloudinary image cleanup failed; continuing without it');
  }
}

const createProduct = asyncHandler(async (req, res) => {
  req.errorResponseFormat = 'legacy-top-level-message';
  const log = req.logger || logger;

  parseMultipartProductFields(req);

  const {
    name,
    brand,
    price,
    specs,
    description,
    inStock,
    colors,
    tags,
  } = req.body;

  if (!name || !brand || !price || !description) {
    throw new BadRequestError("Thiếu thông tin bắt buộc: name, brand, price, description");
  }

  const existingProduct = await Product.findOne({
    name: { $regex: new RegExp(`^${escapeRegex(name)}$`, "i") },
    brand: brand.toLowerCase(),
  });

  if (existingProduct) {
    throw new BadRequestError("Sản phẩm đã tồn tại với tên và hãng này");
  }

  let processedImage, processedPublicId;
  try {
    const result = await processProductImage(req);
    processedImage = result.imageUrl;
    processedPublicId = result.imagePublicId;
  } catch (error) {
    if (error instanceof ProductImageValidationError) {
      throw new AppError(error.message, error.statusCode, error.code);
    }
    throw error;
  }

  const newProduct = new Product({
    name,
    brand: brand.toLowerCase(),
    price,
    specs: normalizeProductSpecs(specs) || {},
    description,
    inStock: inStock || 0,
    colors: colors || [],
    tags: tags || [],
    image: processedImage,
    imagePublicId: processedPublicId || undefined,
    embeddingStatus: 'pending',
  });

  let savedProduct;
  try {
    savedProduct = await newProduct.save();
  } catch (error) {
    if (processedPublicId) {
      await cleanupProductImage(processedPublicId, log, req.requestId);
    }
    throw error;
  }
  log.info({ productId: savedProduct._id.toString(), requestId: req.requestId }, 'Product created');

  const canonicalText = buildEmbeddingContent(savedProduct);

  enqueueProductEmbedding(
    savedProduct._id.toString(),
    canonicalText,
    'create',
    req.requestId || null,
  );

  await cache.invalidatePattern("products:*");
  await cache.del("product-meta");

  res.status(201).json({
    success: true,
    message: "Sản phẩm đã được tạo thành công",
    data: savedProduct,
  });
});

// Lấy tất cả sản phẩm với pagination
const getAllProducts = asyncHandler(async (req, res) => {
  // Lấy parameters từ query string
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  // Normalize search query for consistent matching and caching
  const normalizedSearch = normalizeSearchQuery(req.query.search);

  const cacheParams = {
    page,
    limit,
    brand: req.query.brand || null,
    search: normalizedSearch || null,
    minPrice: req.query.minPrice || null,
    maxPrice: req.query.maxPrice || null,
    sortBy: req.query.sortBy || null,
    sortOrder: req.query.sortOrder || null,
    minRating: req.query.minRating || null,
    inStock: req.query.inStock !== undefined ? req.query.inStock : null,
  };

  const cacheKey = "products:" + JSON.stringify(cacheParams);

  const cached = await cache.get(cacheKey);
  if (cached) {
    logger.debug({ cacheKey }, 'Cache HIT');
    return res.status(200).json(cached);
  }

  logger.debug({ cacheKey }, 'Cache MISS');
  const skip = (page - 1) * limit;
  const minRating = req.query.minRating
    ? parseFloat(req.query.minRating)
    : null;

  let filter = { isActive: true };
  let sort = {};

  if (req.query.brand) {
    filter.brand = req.query.brand.toLowerCase();
  }

  if (req.query.minPrice || req.query.maxPrice) {
    filter.price = {};
    if (req.query.minPrice) {
      filter.price.$gte = parseFloat(req.query.minPrice);
    }
    if (req.query.maxPrice) {
      filter.price.$lte = parseFloat(req.query.maxPrice);
    }
  }

  if (req.query.inStock !== undefined) {
    if (req.query.inStock === "true") {
      filter.inStock = { $gt: 0 };
    } else if (req.query.inStock === "false") {
      filter.inStock = 0;
    }
  }

  // Use normalized search for $text query
  const useTextSearch = normalizedSearch.length > 0;

  if (useTextSearch) {
    // Always try prefix matching first.  Prefix regex handles any query length
    // ("iph", "ipho", "iphone") and provides progressive incremental-search UX.
    // We query with prefix first; if it yields results we are done.
    // If prefix returns nothing, we fall back to $text for multi-word / generic
    // queries that don't match a product-name prefix (e.g. "pro max", "14t pro").
    const prefixPattern = "\\b" + escapeRegex(normalizedSearch);
    const prefixFilter = {
      $or: [
        { name: { $regex: prefixPattern, $options: "i" } },
        { brand: { $regex: prefixPattern, $options: "i" } },
      ],
    };

    // Run a lightweight count to decide whether prefix matches exist.
    const prefixCountPipeline = [
      { $match: { ...filter, ...prefixFilter } },
      { $count: "total" },
    ];
    const prefixCountResult = await Product.aggregate(prefixCountPipeline);
    const prefixCount = prefixCountResult.length > 0 ? prefixCountResult[0].total : 0;

    if (prefixCount > 0) {
      // Strong prefix matches found — use them exclusively.
      filter.$or = prefixFilter.$or;
      sort = { name: 1, createdAt: -1 };
    } else {
      // No prefix matches — fall back to $text full-text search.
      filter.$text = { $search: normalizedSearch };
      sort = { score: { $meta: "textScore" } };
    }
  } else if (req.query.sortBy) {
    const sortField = req.query.sortBy;
    const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;
    sort[sortField] = sortOrder;
  } else {
    sort.createdAt = -1;
  }

  // Use aggregation to include rating stats
  const aggregationPipeline = [
    { $match: filter },
    {
      $lookup: {
        from: "reviews",
        let: { productId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$product", "$$productId"] },
                  { $eq: ["$status", "approved"] },
                ],
              },
            },
          },
        ],
        as: "reviews",
      },
    },
    {
      $addFields: {
        reviewCount: { $size: "$reviews" },
        averageRating: {
          $cond: {
            if: { $gt: [{ $size: "$reviews" }, 0] },
            then: { $round: [{ $avg: "$reviews.rating" }, 1] },
            else: 0,
          },
        },
      },
    },
    // Filter by minRating if specified
    ...(minRating
      ? [{ $match: { averageRating: { $gte: minRating } } }]
      : []),
    {
      $project: {
        embedding_vector: 0,
        embeddingError: 0,
        reviews: 0,
        // Include text relevance score when $text search is active (prefix uses alphabetical sort)
        ...(filter.$text ? { score: { $meta: "textScore" } } : {}),
      },
    },
  ];

  // Get total count with rating filter applied
  const countPipeline = [
    ...aggregationPipeline.slice(0, minRating ? 4 : 3),
    ...(minRating
      ? [{ $match: { averageRating: { $gte: minRating } } }]
      : []),
    { $count: "total" },
  ];

  // Add sorting, skip, and limit
  const dataPipeline = [
    ...aggregationPipeline,
    { $sort: sort },
    { $skip: skip },
    { $limit: limit },
  ];

  const [products, countResult] = await Promise.all([
    Product.aggregate(dataPipeline),
    Product.aggregate(countPipeline),
  ]);

  // Post-query relevance filter: when falling back to $text search (no prefix
  // matches), exclude products that only match on generic tokens (e.g. "Pro",
  // "Max").  This prevents unrelated products from polluting multi-token queries
  // like "Xiaomi 14T Pro" where "Pro" alone is not a meaningful match signal.
  // Prefix search already constrains by name/brand prefix, so no filter needed.
  const searchTokens = useTextSearch ? normalizedSearch.split(/\s+/) : [];
  const usedPrefix = useTextSearch && !filter.$text;
  const filteredProducts = !usedPrefix && searchTokens.length > 1
    ? products.filter((p) => hasNonGenericTokenMatch(p.name, searchTokens))
    : products;

  const filteredCount = filteredProducts.length;
  const totalCount = countResult.length > 0 ? countResult[0].total : 0;
  // For text-search fallback with generic-token filtering, use the actual
  // filtered count since the MongoDB $count pipeline does not apply post-filters.
  const displayTotal = (!usedPrefix && searchTokens.length > 1)
    ? filteredCount
    : totalCount;
  const totalPages = Math.ceil(displayTotal / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  const responseData = {
    success: true,
    message: "Lấy danh sách sản phẩm thành công",
    data: {
      products: filteredProducts,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount: displayTotal,
        limit,
        hasNextPage,
        hasPrevPage,
        nextPage: hasNextPage ? page + 1 : null,
        prevPage: hasPrevPage ? page - 1 : null,
      },
    },
  };

  await cache.set(cacheKey, responseData, 300);

  res.status(200).json(responseData);
});

/**
 * Lightweight product metadata (brands) used to populate filter UIs.
 *
 * Uses a small, dedicated cache key ("product-meta") so it never pollutes the
 * high-cardinality products:* list cache, and a `distinct` query so full
 * product documents are never fetched. Inactive products are excluded and the
 * result is normalized (trimmed, lowercased — matching the Product schema
 * `lowercase` convention), de-duplicated and sorted.
 */
const getProductMeta = asyncHandler(async (req, res) => {
  const log = req.logger || logger;
  const cacheKey = "product-meta";

  const cached = await cache.get(cacheKey);
  if (cached && cached.success === true && Array.isArray(cached.data?.brands)) {
    log.info({ cache: 'hit', cacheKey }, 'Product meta served from cache');
    return res.status(200).json(cached);
  }

  log.info({ cache: 'miss', cacheKey }, 'Product meta cache miss');

  const rawBrands = await Product.distinct("brand", { isActive: true });

  const brands = [
    ...new Set(
      rawBrands
        .filter((brand) => typeof brand === 'string' && brand.trim() !== '')
        .map((brand) => brand.trim().toLowerCase()),
    ),
  ].sort();

  const responseData = {
    success: true,
    data: { brands },
  };

  try {
    await cache.set(cacheKey, responseData, 300);
  } catch (error) {
    log.warn({ cacheKey, error: error.message }, 'Product meta cache write failed');
  }

  res.status(200).json(responseData);
});

// Tìm kiếm ngữ nghĩa sản phẩm
const searchSemantic = asyncHandler(async (req, res) => {
  const query = (req.query.q || '').trim();
  let limit = parseInt(req.query.limit) || 10;

  if (!query) {
    throw new BadRequestError('Vui lòng cung cấp từ khóa tìm kiếm (q)');
  }

  if (limit < 1) limit = 10;
  if (limit > 50) limit = 50;

  const result = await semanticSearch(query, limit);

  res.status(200).json({
    success: true,
    message: 'Tìm kiếm ngữ nghĩa thành công',
    data: {
      products: result.products,
      query,
      searchMode: result.searchMode,
    },
  });
});

// Lấy chi tiết sản phẩm theo ID
const getProductById = asyncHandler(async (req, res) => {
  const productId = req.params.id;
  const cacheKey = "product:" + productId;

  const cached = await cache.get(cacheKey);
  if (cached) {
    return res.status(200).json(cached);
  }

  const product = await Product.findOne({
    _id: productId,
    isActive: true,
  })
    .select("-embedding_vector")
    .lean();

  if (!product) {
    throw new NotFoundError("Không tìm thấy sản phẩm");
  }

  // Get rating stats for the product
  const reviewStats = await Review.getProductStats(productId);

  // Add rating stats to product response
  const productWithStats = {
    ...product,
    averageRating: reviewStats.averageRating,
    reviewCount: reviewStats.totalCount,
  };

  const responseData = {
    success: true,
    message: "Lấy chi tiết sản phẩm thành công",
    data: productWithStats,
  };

  await cache.set(cacheKey, responseData, 300);

  res.status(200).json(responseData);
});

/**
 * Product Recommendations
 *
 * Optional `query` query-string param: a Vietnamese natural-language phrase
 * (e.g. "Samsung dưới 15 triệu") that is parsed into hard brand/budget
 * constraints by recommendationConstraintParser and enforced by the
 * recommendation service in every path (vector, brand-price, latest).
 */
const getRecommendations = asyncHandler(async (req, res) => {
  const productId = req.params.id;
  const limit = req.query.limit;

  const rawQuery = typeof req.query.query === 'string' ? req.query.query.trim() : '';

  let result;
  if (rawQuery) {
    // Natural-language query -> deterministic brand/budget constraints.
    const constraints = parseRecommendationConstraints(rawQuery);
    result = await productRecommend(productId, limit, constraints);
  } else {
    result = await productRecommend(productId, limit);
  }

  if (result.error === "INVALID_ID") {
    throw new BadRequestError("ID sản phẩm không hợp lệ");
  }

  if (result.error === "NOT_FOUND") {
    throw new NotFoundError("Không tìm thấy sản phẩm");
  }

  res.status(200).json({
    success: true,
    message: "Lấy sản phẩm gợi ý thành công",
    data: {
      sourceProduct: result.sourceProduct,
      products: result.products,
      recommendationMode: result.recommendationMode,
    },
  });
});

/**
 * Delete product (soft delete by setting isActive = false)
 *
 * Deliberately does NOT destroy the Cloudinary image: order items copy
 * product.image at purchase time (orderController.js -> orderItemSchema.image),
 * so the Cloudinary URL remains referenced by order history. Permanent asset
 * cleanup is deferred to a future reference-aware cleanup job.
 */
const deleteProduct = asyncHandler(async (req, res) => {
  const productId = req.params.id;

  const product = await Product.findByIdAndUpdate(
    productId,
    { isActive: false },
    { new: true },
  );

  if (!product) {
    throw new NotFoundError("Không tìm thấy sản phẩm");
  }

  await cache.del("product:" + productId);
  await cache.invalidatePattern("products:*");
  await cache.del("product-meta");

  res.status(200).json({
    success: true,
    message: "Xóa sản phẩm thành công",
  });
});

/**
 * Update product
 */
const updateProduct = asyncHandler(async (req, res) => {
  req.errorResponseFormat = 'legacy-top-level-message';
  const log = req.logger || logger;
  const productId = req.params.id;
  log.info({ productId, requestId: req.requestId }, 'Updating product');

  const existing = await Product.findById(productId);
  if (!existing) {
    throw new NotFoundError("Không tìm thấy sản phẩm");
  }

  parseMultipartProductFields(req);

  const {
    name,
    brand,
    price,
    specs,
    description,
    inStock,
    colors,
    tags,
    image,
  } = req.body;

  if (!name || !brand || !price || !description) {
    throw new BadRequestError("Thiếu thông tin bắt buộc: name, brand, price, description");
  }

  const imageProvided = Boolean(req.file) || image !== undefined;

  // Build update payload — only include explicitly provided fields
  let processedImage;
  let processedPublicId;
  if (imageProvided) {
    try {
      const result = await processProductImage(req);
      processedImage = result.imageUrl;
      processedPublicId = result.imagePublicId;
    } catch (error) {
      if (error instanceof ProductImageValidationError) {
        throw new AppError(error.message, error.statusCode, error.code);
      }
      throw error;
    }
  }

  // Normalize specs to the canonical shape. When `specs` is explicitly
  // provided (even as an empty object) the update must apply that state,
  // clearing any previously stored specs; when omitted, preserve existing.
  const specsProvided = specs !== undefined;
  const normalizedSpecs = specsProvided ? normalizeProductSpecs(specs) || {} : undefined;

  const $set = {
    name,
    brand: brand.toLowerCase(),
    price,
    description,
    inStock: inStock !== undefined ? inStock : existing.inStock,
    ...(specsProvided && { specs: normalizedSpecs }),
    ...(colors !== undefined && { colors }),
    ...(tags !== undefined && { tags }),
  };
  const $unset = {};

  if (imageProvided) {
    $set.image = processedImage;
    if (processedPublicId) {
      $set.imagePublicId = processedPublicId;
    } else {
      $unset.imagePublicId = '';
    }
  }

  // Enqueue embedding if embedding-relevant fields changed
  const embeddingRelevantFieldsChanged =
    name !== existing.name ||
    brand.toLowerCase() !== existing.brand ||
    description !== existing.description ||
    price !== existing.price ||
    (specsProvided && JSON.stringify(normalizedSpecs) !== JSON.stringify(existing.specs)) ||
    (colors !== undefined && JSON.stringify(colors) !== JSON.stringify(existing.colors));

  let shouldEnqueue = false;

  if (embeddingRelevantFieldsChanged) {
    const existingData = existing._doc || existing;
    const prospectiveData = { ...existingData, ...$set };
    const contentHash = computeContentHash(buildEmbeddingContent(prospectiveData));

    if (existing.embeddingContentHash === contentHash && existing.embeddingStatus === 'ready') {
      // Canonical content hasn't genuinely changed; keep ready status, skip enqueue
    } else {
      $set.embeddingStatus = 'pending';
      shouldEnqueue = true;
    }
  }

  const updateOp = { $set };
  if (Object.keys($unset).length > 0) {
    updateOp.$unset = $unset;
  }

  let updatedProduct;
  try {
    updatedProduct = await Product.findByIdAndUpdate(productId, updateOp, {
      new: true,
      runValidators: true,
    });
  } catch (error) {
    if (processedPublicId) {
      await cleanupProductImage(processedPublicId, log, req.requestId);
    }
    throw error;
  }

  if (!updatedProduct) {
    if (processedPublicId) {
      await cleanupProductImage(processedPublicId, log, req.requestId);
    }
    throw new NotFoundError("Không tìm thấy sản phẩm");
  }

  if (imageProvided && existing.imagePublicId && processedImage !== existing.image) {
    await cleanupProductImage(existing.imagePublicId, log, req.requestId);
  }

  if (shouldEnqueue) {
    const canonicalText = buildEmbeddingContent(updatedProduct);
    enqueueProductEmbedding(
      productId,
      canonicalText,
      'update',
      req.requestId || null,
    );
  }

  // Invalidate cache
  await cache.del("product:" + productId);
  await cache.invalidatePattern("products:*");
  await cache.del("product-meta");

  res.status(200).json({
    success: true,
    message: "Cập nhật sản phẩm thành công",
    data: updatedProduct,
  });
});

module.exports = {
  createProduct,
  getAllProducts,
  getProductMeta,
  searchSemantic,
  getProductById,
  getRecommendations,
  updateProduct,
  deleteProduct,
  // exported for unit testing only
  normalizeSearchQuery,
  GENERIC_SEARCH_TOKENS,
  hasNonGenericTokenMatch,
  escapeRegex,
};
