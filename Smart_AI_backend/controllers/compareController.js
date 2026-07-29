const CompareHistory = require('../models/CompareHistory');
const Product = require('../models/Product');
const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../utils/errors');

/**
 * Save comparison to history
 * POST /api/compare/history
 * Requirements: 5.1, 5.2, 5.7
 */
const saveComparison = asyncHandler(async (req, res) => {
  const { products } = req.body;
  const userId = req.user._id;

  if (!products || !Array.isArray(products)) {
    throw new BadRequestError('Products phải là một mảng', 'INVALID_PRODUCTS');
  }

  if (products.length < 2) {
    throw new BadRequestError('Cần ít nhất 2 sản phẩm để so sánh', 'MIN_PRODUCTS_REQUIRED');
  }

  if (products.length > 4) {
    throw new BadRequestError('Chỉ có thể so sánh tối đa 4 sản phẩm', 'MAX_PRODUCTS_EXCEEDED');
  }

  const invalidIds = products.filter(id => !mongoose.Types.ObjectId.isValid(id));
  if (invalidIds.length > 0) {
    throw new BadRequestError('Một hoặc nhiều product ID không hợp lệ', 'INVALID_PRODUCTS');
  }

  const existingProducts = await Product.find({
    _id: { $in: products },
    isActive: true
  }).select('_id');

  if (existingProducts.length !== products.length) {
    throw new BadRequestError('Một hoặc nhiều sản phẩm không tồn tại', 'INVALID_PRODUCTS');
  }

  const sortedProductIds = [...products].sort();

  const existingComparison = await CompareHistory.findOne({
    user: userId,
    $expr: {
      $setEquals: ['$products', sortedProductIds.map(id => new mongoose.Types.ObjectId(id))]
    }
  });

  if (existingComparison) {
    existingComparison.updatedAt = new Date();
    await existingComparison.save();

    const populated = await CompareHistory.findById(existingComparison._id)
      .populate({
        path: 'products',
        select: 'name image price'
      });

    return res.status(200).json({
      success: true,
      message: 'Đã cập nhật lịch sử so sánh',
      data: populated
    });
  }

  const historyCount = await CompareHistory.countDocuments({ user: userId });
  if (historyCount >= 20) {
    const oldest = await CompareHistory.findOne({ user: userId })
      .sort({ createdAt: 1 });
    if (oldest) {
      await CompareHistory.findByIdAndDelete(oldest._id);
    }
  }

  const newComparison = new CompareHistory({
    user: userId,
    products: products
  });

  await newComparison.save();

  const populated = await CompareHistory.findById(newComparison._id)
    .populate({
      path: 'products',
      select: 'name image price'
    });

  res.status(201).json({
    success: true,
    message: 'Đã lưu lịch sử so sánh',
    data: populated
  });
});


/**
 * Get user's comparison history
 * GET /api/compare/history
 * Requirements: 5.3, 5.4
 */
const getCompareHistory = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const history = await CompareHistory.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(20)
    .populate({
      path: 'products',
      select: 'name image price'
    });

  res.status(200).json({
    success: true,
    message: 'Lấy lịch sử so sánh thành công',
    data: history
  });
});

/**
 * Delete comparison from history
 * DELETE /api/compare/history/:id
 * Requirements: 5.6
 */
const deleteComparison = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new BadRequestError('ID không hợp lệ', 'INVALID_ID');
  }

  const comparison = await CompareHistory.findById(id);

  if (!comparison) {
    throw new NotFoundError('Không tìm thấy lịch sử so sánh', 'HISTORY_NOT_FOUND');
  }

  if (comparison.user.toString() !== userId.toString()) {
    throw new ForbiddenError('Bạn không có quyền xóa lịch sử này', 'NOT_OWNER');
  }

  await CompareHistory.findByIdAndDelete(id);

  res.status(200).json({
    success: true,
    message: 'Đã xóa lịch sử so sánh'
  });
});


/**
 * Get products for comparison (public endpoint)
 * GET /api/compare/products?ids=id1,id2,id3
 * Requirements: 3.2, 6.3
 */
const getCompareProducts = asyncHandler(async (req, res) => {
  const { ids } = req.query;

  if (!ids) {
    throw new BadRequestError('Thiếu tham số ids', 'INVALID_PRODUCTS');
  }

  const productIds = ids.split(',').map(id => id.trim()).filter(id => id);

  if (productIds.length < 2) {
    throw new BadRequestError('Cần ít nhất 2 sản phẩm để so sánh', 'MIN_PRODUCTS_REQUIRED');
  }

  if (productIds.length > 4) {
    throw new BadRequestError('Chỉ có thể so sánh tối đa 4 sản phẩm', 'MAX_PRODUCTS_EXCEEDED');
  }

  const invalidIds = productIds.filter(id => !mongoose.Types.ObjectId.isValid(id));
  if (invalidIds.length > 0) {
    throw new BadRequestError('Một hoặc nhiều product ID không hợp lệ', 'INVALID_PRODUCTS');
  }

  const products = await Product.find({
    _id: { $in: productIds },
    isActive: true
  }).select('-embedding_vector');

  if (products.length === 0) {
    throw new NotFoundError('Không tìm thấy sản phẩm nào', 'INVALID_PRODUCTS');
  }

  const orderedProducts = productIds
    .map(id => products.find(p => p._id.toString() === id))
    .filter(p => p !== undefined);

  res.status(200).json({
    success: true,
    message: 'Lấy thông tin sản phẩm so sánh thành công',
    data: orderedProducts
  });
});

module.exports = {
  saveComparison,
  getCompareHistory,
  deleteComparison,
  getCompareProducts
};
