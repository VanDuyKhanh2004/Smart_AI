const mongoose = require('mongoose');
const Review = require('../models/Review');
const Order = require('../models/Order');
const Product = require('../models/Product');
const asyncHandler = require('../utils/asyncHandler');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../utils/errors');

/**
 * Check if user has a delivered order containing the product
 * @param {string} userId - User ID
 * @param {string} productId - Product ID
 * @returns {Promise<boolean>}
 */
const hasVerifiedPurchase = async (userId, productId) => {
  const order = await Order.findOne({
    user: userId,
    status: 'delivered',
    'items.product': productId
  });
  return !!order;
};

/**
 * Create a new review
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 */
const createReview = asyncHandler(async (req, res) => {
  try {
    const userId = req.user._id;
    const { productId, rating, comment } = req.body;

    // Validate productId
    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      throw new BadRequestError('Product ID không hợp lệ', 'INVALID_PRODUCT');
    }

    // Check product exists
    const product = await Product.findById(productId);
    if (!product) {
      throw new NotFoundError('Không tìm thấy sản phẩm', 'PRODUCT_NOT_FOUND');
    }


    // Requirement 1.1, 1.2: Verify user has delivered order containing product
    const hasDeliveredOrder = await hasVerifiedPurchase(userId, productId);
    if (!hasDeliveredOrder) {
      throw new ForbiddenError('Bạn cần mua và nhận sản phẩm để đánh giá', 'NO_VERIFIED_PURCHASE');
    }

    // Requirement 1.5: Check no existing review for user-product pair
    const existingReview = await Review.findOne({ user: userId, product: productId });
    if (existingReview) {
      throw new BadRequestError('Bạn đã đánh giá sản phẩm này rồi', 'ALREADY_REVIEWED');
    }

    // Requirement 1.3: Validate rating (1-5)
    if (!rating || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestError('Rating phải là số nguyên từ 1 đến 5', 'INVALID_RATING');
    }

    // Requirement 1.4: Validate comment (max 1000 chars)
    if (comment && comment.length > 1000) {
      throw new BadRequestError('Comment không được vượt quá 1000 ký tự', 'COMMENT_TOO_LONG');
    }

    // Requirement 1.6: Create review with status 'approved'
    const review = new Review({
      user: userId,
      product: productId,
      rating,
      comment: comment || '',
      status: 'approved',
      isVerifiedPurchase: true
    });

    await review.save();

    // Populate user info for response
    const populatedReview = await Review.findById(review._id)
      .populate('user', 'name');

    res.status(201).json({
      success: true,
      message: 'Đánh giá đã được tạo thành công',
      data: populatedReview
    });
  } catch (error) {
    // Handle duplicate key error (unique constraint)
    if (error.code === 11000) {
      throw new BadRequestError('Bạn đã đánh giá sản phẩm này rồi', 'ALREADY_REVIEWED');
    }
    throw error;
  }
});


/**
 * Get product reviews with stats
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */
const getProductReviews = asyncHandler(async (req, res) => {
  const { id: productId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // Validate productId
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw new BadRequestError('Product ID không hợp lệ', 'INVALID_PRODUCT');
  }

  // Check product exists
  const product = await Product.findById(productId);
  if (!product) {
    throw new NotFoundError('Không tìm thấy sản phẩm', 'PRODUCT_NOT_FOUND');
  }

  // Requirement 2.1: Return only approved reviews
  // Requirement 2.3: Sort by newest first
  const [reviews, totalCount, stats] = await Promise.all([
    Review.find({ product: productId, status: 'approved' })
      .populate('user', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Review.countDocuments({ product: productId, status: 'approved' }),
    Review.getProductStats(productId)
  ]);

  const totalPages = Math.ceil(totalCount / limit);

  // Requirement 2.4: Empty state handled by returning empty array
  res.status(200).json({
    success: true,
    data: {
      reviews,
      // Requirement 2.2: Include average rating and total count
      stats: {
        averageRating: stats.averageRating,
        totalCount: stats.totalCount
      },
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    }
  });
});


/**
 * Update own review
 * Requirements: 6.1, 6.3
 */
const updateReview = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { id: reviewId } = req.params;
  const { rating, comment } = req.body;

  // Validate reviewId
  if (!mongoose.Types.ObjectId.isValid(reviewId)) {
    throw new BadRequestError('Review ID không hợp lệ', 'INVALID_REVIEW');
  }

  // Find the review
  const review = await Review.findById(reviewId);
  if (!review) {
    throw new NotFoundError('Không tìm thấy đánh giá', 'REVIEW_NOT_FOUND');
  }

  // Requirement 6.3: Verify requesting user owns the review
  if (review.user.toString() !== userId.toString()) {
    throw new ForbiddenError('Bạn không có quyền chỉnh sửa đánh giá này', 'NOT_OWNER');
  }

  // Validate rating if provided (1-5)
  if (rating !== undefined) {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestError('Rating phải là số nguyên từ 1 đến 5', 'INVALID_RATING');
    }
    review.rating = rating;
  }

  // Validate comment if provided (max 1000 chars)
  if (comment !== undefined) {
    if (comment.length > 1000) {
      throw new BadRequestError('Comment không được vượt quá 1000 ký tự', 'COMMENT_TOO_LONG');
    }
    review.comment = comment;
  }

  // Requirement 6.1: Update the review
  await review.save();

  // Populate user info for response
  const populatedReview = await Review.findById(review._id)
    .populate('user', 'name');

  res.status(200).json({
    success: true,
    message: 'Đánh giá đã được cập nhật thành công',
    data: populatedReview
  });
});


/**
 * Delete own review
 * Requirements: 6.2, 6.3
 */
const deleteReview = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { id: reviewId } = req.params;

  // Validate reviewId
  if (!mongoose.Types.ObjectId.isValid(reviewId)) {
    throw new BadRequestError('Review ID không hợp lệ', 'INVALID_REVIEW');
  }

  // Find the review
  const review = await Review.findById(reviewId);
  if (!review) {
    throw new NotFoundError('Không tìm thấy đánh giá', 'REVIEW_NOT_FOUND');
  }

  // Requirement 6.3: Verify requesting user owns the review
  if (review.user.toString() !== userId.toString()) {
    throw new ForbiddenError('Bạn không có quyền xóa đánh giá này', 'NOT_OWNER');
  }

  // Requirement 6.2: Remove review from database
  await Review.findByIdAndDelete(reviewId);

  res.status(200).json({
    success: true,
    message: 'Đánh giá đã được xóa thành công'
  });
});


/**
 * Check if user can review a product
 * Requirements: 1.1, 1.2
 */
const canReviewProduct = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { productId } = req.params;

  // Validate productId
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw new BadRequestError('Product ID không hợp lệ', 'INVALID_PRODUCT');
  }

  // Check product exists
  const product = await Product.findById(productId);
  if (!product) {
    throw new NotFoundError('Không tìm thấy sản phẩm', 'PRODUCT_NOT_FOUND');
  }

  // Check verified purchase
  const hasDeliveredOrder = await hasVerifiedPurchase(userId, productId);

  // Check no existing review
  const existingReview = await Review.findOne({ user: userId, product: productId });

  const canReview = hasDeliveredOrder && !existingReview;

  res.status(200).json({
    success: true,
    data: {
      canReview,
      hasVerifiedPurchase: hasDeliveredOrder,
      hasExistingReview: !!existingReview,
      existingReview: existingReview || null
    }
  });
});

/**
 * Admin: Get all reviews with filtering
 * Requirements: 5.1
 */
const getAllReviews = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const { status, productId, userId } = req.query;

  // Build filter query
  const filter = {};

  // Filter by status if provided
  if (status && ['pending', 'approved', 'rejected'].includes(status)) {
    filter.status = status;
  }

  // Filter by product if provided
  if (productId && mongoose.Types.ObjectId.isValid(productId)) {
    filter.product = productId;
  }

  // Filter by user if provided
  if (userId && mongoose.Types.ObjectId.isValid(userId)) {
    filter.user = userId;
  }

  // Get reviews with pagination
  const [reviews, totalCount] = await Promise.all([
    Review.find(filter)
      .populate('user', 'name email')
      .populate('product', 'name images')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Review.countDocuments(filter)
  ]);

  const totalPages = Math.ceil(totalCount / limit);

  res.status(200).json({
    success: true,
    data: {
      reviews,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    }
  });
});


/**
 * Admin: Update review status
 * Requirements: 5.2, 5.3, 5.4, 5.5
 */
const updateReviewStatus = asyncHandler(async (req, res) => {
  const { id: reviewId } = req.params;
  const { status } = req.body;

  // Validate reviewId
  if (!mongoose.Types.ObjectId.isValid(reviewId)) {
    throw new BadRequestError('Review ID không hợp lệ', 'INVALID_REVIEW');
  }

  // Validate status
  if (!status || !['pending', 'approved', 'rejected'].includes(status)) {
    throw new BadRequestError('Status phải là pending, approved hoặc rejected', 'INVALID_STATUS');
  }

  // Find the review
  const review = await Review.findById(reviewId);
  if (!review) {
    throw new NotFoundError('Không tìm thấy đánh giá', 'REVIEW_NOT_FOUND');
  }

  // Requirement 5.2, 5.3, 5.4: Update review status
  review.status = status;
  await review.save();

  // Populate for response
  const populatedReview = await Review.findById(review._id)
    .populate('user', 'name email')
    .populate('product', 'name images');

  res.status(200).json({
    success: true,
    message: `Đánh giá đã được ${status === 'approved' ? 'phê duyệt' : status === 'rejected' ? 'từ chối' : 'cập nhật'}`,
    data: populatedReview
  });
});


module.exports = {
  createReview,
  getProductReviews,
  canReviewProduct,
  updateReview,
  deleteReview,
  // Admin functions
  getAllReviews,
  updateReviewStatus,
  // Export helper for testing
  hasVerifiedPurchase
};
