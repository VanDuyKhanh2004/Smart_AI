const CompareHistory = require('../models/CompareHistory');
const Product = require('../models/Product');
const mongoose = require('mongoose');

/**
 * Save comparison to history
 * POST /api/compare/history
 * Requirements: 5.1, 5.2, 5.7
 */
const saveComparison = async (req, res) => {
  try {
    const { products } = req.body;
    const userId = req.user._id;

    // Validate products array exists
    if (!products || !Array.isArray(products)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PRODUCTS',
          message: 'Products phải là một mảng'
        }
      });
    }

    // Validate 2-4 products
    if (products.length < 2) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MIN_PRODUCTS_REQUIRED',
          message: 'Cần ít nhất 2 sản phẩm để so sánh'
        }
      });
    }

    if (products.length > 4) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MAX_PRODUCTS_EXCEEDED',
          message: 'Chỉ có thể so sánh tối đa 4 sản phẩm'
        }
      });
    }

    // Validate all product IDs are valid ObjectIds
    const invalidIds = products.filter(id => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PRODUCTS',
          message: 'Một hoặc nhiều product ID không hợp lệ'
        }
      });
    }


    // Verify all products exist
    const existingProducts = await Product.find({
      _id: { $in: products },
      isActive: true
    }).select('_id');

    if (existingProducts.length !== products.length) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PRODUCTS',
          message: 'Một hoặc nhiều sản phẩm không tồn tại'
        }
      });
    }

    // Sort product IDs to check for duplicate comparison
    const sortedProductIds = [...products].sort();

    // Check if identical comparison exists (same products regardless of order)
    const existingComparison = await CompareHistory.findOne({
      user: userId,
      $expr: {
        $setEquals: ['$products', sortedProductIds.map(id => new mongoose.Types.ObjectId(id))]
      }
    });

    if (existingComparison) {
      // Update timestamp of existing comparison
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

    // Enforce 20 item limit per user - remove oldest if needed
    const historyCount = await CompareHistory.countDocuments({ user: userId });
    if (historyCount >= 20) {
      // Find and delete the oldest entry
      const oldest = await CompareHistory.findOne({ user: userId })
        .sort({ createdAt: 1 });
      if (oldest) {
        await CompareHistory.findByIdAndDelete(oldest._id);
      }
    }

    // Create new comparison
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

  } catch (error) {
    console.error('Lỗi khi lưu lịch sử so sánh:', error.message);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Lỗi server khi lưu lịch sử so sánh'
      }
    });
  }
};


/**
 * Get user's comparison history
 * GET /api/compare/history
 * Requirements: 5.3, 5.4
 */
const getCompareHistory = async (req, res) => {
  try {
    const userId = req.user._id;

    // Return user's comparisons sorted by date desc, limit to 20
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

  } catch (error) {
    console.error('Lỗi khi lấy lịch sử so sánh:', error.message);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Lỗi server khi lấy lịch sử so sánh'
      }
    });
  }
};

/**
 * Delete comparison from history
 * DELETE /api/compare/history/:id
 * Requirements: 5.6
 */
const deleteComparison = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    // Validate ID format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ID',
          message: 'ID không hợp lệ'
        }
      });
    }

    // Find the comparison
    const comparison = await CompareHistory.findById(id);

    if (!comparison) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'HISTORY_NOT_FOUND',
          message: 'Không tìm thấy lịch sử so sánh'
        }
      });
    }

    // Verify ownership
    if (comparison.user.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'NOT_OWNER',
          message: 'Bạn không có quyền xóa lịch sử này'
        }
      });
    }

    await CompareHistory.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Đã xóa lịch sử so sánh'
    });

  } catch (error) {
    console.error('Lỗi khi xóa lịch sử so sánh:', error.message);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Lỗi server khi xóa lịch sử so sánh'
      }
    });
  }
};


/**
 * Get products for comparison (public endpoint)
 * GET /api/compare/products?ids=id1,id2,id3
 * Requirements: 3.2, 6.3
 */
const getCompareProducts = async (req, res) => {
  try {
    const { ids } = req.query;

    if (!ids) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PRODUCTS',
          message: 'Thiếu tham số ids'
        }
      });
    }

    // Parse product IDs from comma-separated string
    const productIds = ids.split(',').map(id => id.trim()).filter(id => id);

    if (productIds.length < 2) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MIN_PRODUCTS_REQUIRED',
          message: 'Cần ít nhất 2 sản phẩm để so sánh'
        }
      });
    }

    if (productIds.length > 4) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MAX_PRODUCTS_EXCEEDED',
          message: 'Chỉ có thể so sánh tối đa 4 sản phẩm'
        }
      });
    }

    // Validate all product IDs are valid ObjectIds
    const invalidIds = productIds.filter(id => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PRODUCTS',
          message: 'Một hoặc nhiều product ID không hợp lệ'
        }
      });
    }

    // Fetch full product details
    const products = await Product.find({
      _id: { $in: productIds },
      isActive: true
    }).select('-embedding_vector');

    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'INVALID_PRODUCTS',
          message: 'Không tìm thấy sản phẩm nào'
        }
      });
    }

    // Maintain the order of products as requested
    const orderedProducts = productIds
      .map(id => products.find(p => p._id.toString() === id))
      .filter(p => p !== undefined);

    res.status(200).json({
      success: true,
      message: 'Lấy thông tin sản phẩm so sánh thành công',
      data: orderedProducts
    });

  } catch (error) {
    console.error('Lỗi khi lấy sản phẩm so sánh:', error.message);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Lỗi server khi lấy sản phẩm so sánh'
      }
    });
  }
};

module.exports = {
  saveComparison,
  getCompareHistory,
  deleteComparison,
  getCompareProducts
};
