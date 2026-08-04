const Product = require("../models/Product");
const Review = require("../models/Review");
const cache = require("../services/cacheService");
const { search: semanticSearch } = require("../services/productSearchService");
const { recommend: productRecommend } = require("../services/productRecommendationService");
const { buildEmbeddingContent, computeContentHash } = require("../utils/embeddingContent");
const { enqueueProductEmbedding } = require("../services/embeddingQueueService");
const { uploadProductImageIfNeeded, deleteImageFromCloudinary, ProductImageValidationError } = require("../services/productImageService");
const logger = require("../utils/logger");
const asyncHandler = require("../utils/asyncHandler");
const { AppError, BadRequestError, NotFoundError } = require("../utils/errors");

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

  const existingProduct = await Product.findOne({
    name: { $regex: new RegExp(`^${name}$`, "i") },
    brand: brand.toLowerCase(),
  });

  if (existingProduct) {
    throw new BadRequestError("Sản phẩm đã tồn tại với tên và hãng này");
  }

  let processedImage, processedPublicId;
  try {
    const result = await uploadProductImageIfNeeded(image);
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
    specs: specs || {},
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

  const cacheParams = {
    page,
    limit,
    brand: req.query.brand || null,
    search: req.query.search || null,
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
    console.log("Cache HIT:", cacheKey);
    return res.status(200).json(cached);
  }

  console.log("Cache MISS:", cacheKey);
  const skip = (page - 1) * limit;
  const minRating = req.query.minRating
    ? parseFloat(req.query.minRating)
    : null;

  let filter = { isActive: true };

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

  if (req.query.search) {
    filter.$text = { $search: req.query.search };
  }

  let sort = {};
  if (req.query.sortBy) {
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

  const totalCount = countResult.length > 0 ? countResult[0].total : 0;
  const totalPages = Math.ceil(totalCount / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  const responseData = {
    success: true,
    message: "Lấy danh sách sản phẩm thành công",
    data: {
      products,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
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
 */
const getRecommendations = asyncHandler(async (req, res) => {
  const productId = req.params.id;
  const limit = req.query.limit;

  const result = await productRecommend(productId, limit);

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

  // Build update payload — only include explicitly provided fields
  let processedImage;
  let processedPublicId;
  if (image !== undefined) {
    try {
      const result = await uploadProductImageIfNeeded(image);
      processedImage = result.imageUrl;
      processedPublicId = result.imagePublicId;
    } catch (error) {
      if (error instanceof ProductImageValidationError) {
        throw new AppError(error.message, error.statusCode, error.code);
      }
      throw error;
    }
  }

  const $set = {
    name,
    brand: brand.toLowerCase(),
    price,
    description,
    inStock: inStock !== undefined ? inStock : existing.inStock,
    ...(specs !== undefined && { specs }),
    ...(colors !== undefined && { colors }),
    ...(tags !== undefined && { tags }),
  };
  const $unset = {};

  if (image !== undefined) {
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
    (specs !== undefined && JSON.stringify(specs) !== JSON.stringify(existing.specs)) ||
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

  if (image !== undefined && existing.imagePublicId && processedImage !== existing.image) {
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

  res.status(200).json({
    success: true,
    message: "Cập nhật sản phẩm thành công",
    data: updatedProduct,
  });
});

module.exports = {
  createProduct,
  getAllProducts,
  searchSemantic,
  getProductById,
  getRecommendations,
  updateProduct,
  deleteProduct,
};
