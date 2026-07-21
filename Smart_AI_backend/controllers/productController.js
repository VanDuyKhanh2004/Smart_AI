const Product = require("../models/Product");
const Review = require("../models/Review");
const cache = require("../services/cacheService");
const { search: semanticSearch } = require("../services/productSearchService");
const { recommend: productRecommend } = require("../services/productRecommendationService");
const { buildEmbeddingContent, computeContentHash } = require("../utils/embeddingContent");
const { enqueueProductEmbedding } = require("../services/embeddingQueueService");
const logger = require("../utils/logger");

const createProduct = async (req, res) => {
  const log = req.logger || logger;
  try {

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
      return res.status(400).json({
        success: false,
        message: "Thiếu thông tin bắt buộc: name, brand, price, description",
      });
    }

    const existingProduct = await Product.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
      brand: brand.toLowerCase(),
    });

    if (existingProduct) {
      return res.status(400).json({
        success: false,
        message: "Sản phẩm đã tồn tại với tên và hãng này",
      });
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
      image: image || "",
      embeddingStatus: 'pending',
    });

    const savedProduct = await newProduct.save();
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
  } catch (error) {
    log.error({ err: { message: error.message } }, 'Failed to create product');

    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: "Dữ liệu không hợp lệ",
        errors,
      });
    }

    res.status(500).json({
      success: false,
      message: "Lỗi server khi tạo sản phẩm",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Lấy tất cả sản phẩm với pagination
const getAllProducts = async (req, res) => {
  try {
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
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy danh sách sản phẩm",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Tìm kiếm ngữ nghĩa sản phẩm
const searchSemantic = async (req, res) => {
  try {
    const query = (req.query.q || '').trim();
    let limit = parseInt(req.query.limit) || 10;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp từ khóa tìm kiếm (q)',
      });
    }

    if (limit < 1) limit = 10;
    if (limit > 50) limit = 50;

    const result = await semanticSearch(query, limit);

    return res.status(200).json({
      success: true,
      message: 'Tìm kiếm ngữ nghĩa thành công',
      data: {
        products: result.products,
        query,
        searchMode: result.searchMode,
      },
    });
  } catch (error) {
    console.error('Lỗi tìm kiếm ngữ nghĩa:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi tìm kiếm sản phẩm',
    });
  }
};

// Lấy chi tiết sản phẩm theo ID
const getProductById = async (req, res) => {
  try {
    const productId = req.params.id;
    const cacheKey = "product:" + productId;

    const cached = await cache.get(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    // Tìm sản phẩm theo ID
    const product = await Product.findOne({
      _id: productId,
      isActive: true,
    })
      .select("-embedding_vector")
      .lean();

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy sản phẩm",
      });
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
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy chi tiết sản phẩm",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Product Recommendations
 */
const getRecommendations = async (req, res) => {
  try {
    const productId = req.params.id;
    const limit = req.query.limit;

    const result = await productRecommend(productId, limit);

    if (result.error === "INVALID_ID") {
      return res.status(400).json({
        success: false,
        message: "ID sản phẩm không hợp lệ",
      });
    }

    if (result.error === "NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy sản phẩm",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Lấy sản phẩm gợi ý thành công",
      data: {
        sourceProduct: result.sourceProduct,
        products: result.products,
        recommendationMode: result.recommendationMode,
      },
    });
  } catch (error) {
    console.error("Lỗi gợi ý sản phẩm:", error.message);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy gợi ý sản phẩm",
    });
  }
};

/**
 * Delete product (soft delete by setting isActive = false)
 */
const deleteProduct = async (req, res) => {
  try {
    const productId = req.params.id;

    // Find and soft delete the product
    const product = await Product.findByIdAndUpdate(
      productId,
      { isActive: false },
      { new: true },
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Không tìm thấy sản phẩm",
        },
      });
    }

    await cache.del("product:" + productId);
    await cache.invalidatePattern("products:*");

    res.status(200).json({
      success: true,
      message: "Xóa sản phẩm thành công",
    });
  } catch (error) {
    console.error("Lỗi khi xóa sản phẩm:", error.message);
    res.status(500).json({
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: "Lỗi server khi xóa sản phẩm",
      },
    });
  }
};

/**
 * Update product
 */
const updateProduct = async (req, res) => {
  const log = req.logger || logger;
  try {
    const productId = req.params.id;
    log.info({ productId, requestId: req.requestId }, 'Updating product');

    const existing = await Product.findById(productId);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Không tìm thấy sản phẩm",
        },
      });
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
      return res.status(400).json({
        success: false,
        message: "Thiếu thông tin bắt buộc: name, brand, price, description",
      });
    }

    // Build update payload — only include explicitly provided fields
    const updateData = {
      name,
      brand: brand.toLowerCase(),
      price,
      description,
      inStock: inStock !== undefined ? inStock : existing.inStock,
      ...(specs !== undefined && { specs }),
      ...(colors !== undefined && { colors }),
      ...(tags !== undefined && { tags }),
      ...(image !== undefined && { image }),
    };

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
      const prospectiveData = { ...existingData, ...updateData };
      const contentHash = computeContentHash(buildEmbeddingContent(prospectiveData));

      if (existing.embeddingContentHash === contentHash && existing.embeddingStatus === 'ready') {
        // Canonical content hasn't genuinely changed; keep ready status, skip enqueue
      } else {
        updateData.embeddingStatus = 'pending';
        shouldEnqueue = true;
      }
    }

    const updatedProduct = await Product.findByIdAndUpdate(productId, { $set: updateData }, {
      new: true,
      runValidators: true,
    });

    if (!updatedProduct) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Không tìm thấy sản phẩm",
        },
      });
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
  } catch (error) {
    log.error({ err: { message: error.message } }, 'Failed to update product');

    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: "Dữ liệu không hợp lệ",
        errors,
      });
    }

    res.status(500).json({
      success: false,
      message: "Lỗi server khi cập nhật sản phẩm",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

module.exports = {
  createProduct,
  getAllProducts,
  searchSemantic,
  getProductById,
  getRecommendations,
  updateProduct,
  deleteProduct,
};
