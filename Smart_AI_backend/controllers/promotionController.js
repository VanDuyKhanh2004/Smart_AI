const Promotion = require('../models/Promotion');

/**
 * GET /api/promotions - Get all promotions with pagination (Admin)
 */
const getPromotions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const status = req.query.status;

    let filter = {};
    const now = new Date();

    // Filter by status
    if (status === 'active') {
      filter.isActive = true;
      filter.startDate = { $lte: now };
      filter.endDate = { $gte: now };
      filter.$expr = { $lt: ['$usedCount', '$usageLimit'] };
    } else if (status === 'inactive') {
      filter.isActive = false;
    } else if (status === 'expired') {
      filter.endDate = { $lt: now };
    } else if (status === 'depleted') {
      filter.$expr = { $gte: ['$usedCount', '$usageLimit'] };
    }

    const [promotions, totalCount] = await Promise.all([
      Promotion.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Promotion.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    res.status(200).json({
      success: true,
      data: promotions,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Lỗi khi lấy danh sách khuyến mãi:', error.message);
    res.status(500).json({
      success: false,
      message: 'Đã xảy ra lỗi, vui lòng thử lại'
    });
  }
};

/**
 * GET /api/promotions/:id - Get promotion by ID (Admin)
 */
const getPromotion = async (req, res) => {
  try {
    const promotion = await Promotion.findById(req.params.id);

    if (!promotion) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy mã khuyến mãi'
      });
    }

    res.status(200).json({
      success: true,
      data: promotion
    });
  } catch (error) {
    console.error('Lỗi khi lấy chi tiết khuyến mãi:', error.message);
    res.status(500).json({
      success: false,
      message: 'Đã xảy ra lỗi, vui lòng thử lại'
    });
  }
};

/**
 * POST /api/promotions - Create new promotion (Admin)
 */
const createPromotion = async (req, res) => {
  try {
    const {
      code,
      description,
      discountType,
      discountValue,
      minOrderValue,
      maxDiscountAmount,
      usageLimit,
      startDate,
      endDate
    } = req.body;

    // Check if code already exists
    const existingPromotion = await Promotion.findOne({ 
      code: code.toUpperCase() 
    });

    if (existingPromotion) {
      return res.status(409).json({
        success: false,
        message: 'Mã khuyến mãi đã tồn tại'
      });
    }

    const promotion = new Promotion({
      code,
      description,
      discountType,
      discountValue,
      minOrderValue: minOrderValue || 0,
      maxDiscountAmount: maxDiscountAmount || null,
      usageLimit,
      startDate,
      endDate
    });

    const savedPromotion = await promotion.save();

    res.status(201).json({
      success: true,
      message: 'Tạo mã khuyến mãi thành công',
      data: savedPromotion
    });
  } catch (error) {
    console.error('Lỗi khi tạo khuyến mãi:', error.message);

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: errors[0],
        errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Đã xảy ra lỗi, vui lòng thử lại'
    });
  }
};

/**
 * PUT /api/promotions/:id - Update promotion (Admin)
 */
const updatePromotion = async (req, res) => {
  try {
    const {
      description,
      discountValue,
      minOrderValue,
      maxDiscountAmount,
      usageLimit,
      endDate,
      isActive
    } = req.body;

    const promotion = await Promotion.findById(req.params.id);

    if (!promotion) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy mã khuyến mãi'
      });
    }

    // Update allowed fields
    if (description !== undefined) promotion.description = description;
    if (discountValue !== undefined) promotion.discountValue = discountValue;
    if (minOrderValue !== undefined) promotion.minOrderValue = minOrderValue;
    if (maxDiscountAmount !== undefined) promotion.maxDiscountAmount = maxDiscountAmount;
    if (usageLimit !== undefined) promotion.usageLimit = usageLimit;
    if (endDate !== undefined) promotion.endDate = endDate;
    if (isActive !== undefined) promotion.isActive = isActive;

    const updatedPromotion = await promotion.save();

    res.status(200).json({
      success: true,
      message: 'Cập nhật mã khuyến mãi thành công',
      data: updatedPromotion
    });
  } catch (error) {
    console.error('Lỗi khi cập nhật khuyến mãi:', error.message);

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: errors[0],
        errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Đã xảy ra lỗi, vui lòng thử lại'
    });
  }
};

/**
 * DELETE /api/promotions/:id - Delete promotion (Admin)
 */
const deletePromotion = async (req, res) => {
  try {
    const promotion = await Promotion.findByIdAndDelete(req.params.id);

    if (!promotion) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy mã khuyến mãi'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Xóa mã khuyến mãi thành công'
    });
  } catch (error) {
    console.error('Lỗi khi xóa khuyến mãi:', error.message);
    res.status(500).json({
      success: false,
      message: 'Đã xảy ra lỗi, vui lòng thử lại'
    });
  }
};

/**
 * PATCH /api/promotions/:id/toggle - Toggle promotion active status (Admin)
 */
const togglePromotionStatus = async (req, res) => {
  try {
    const promotion = await Promotion.findById(req.params.id);

    if (!promotion) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy mã khuyến mãi'
      });
    }

    promotion.isActive = !promotion.isActive;
    const updatedPromotion = await promotion.save();

    res.status(200).json({
      success: true,
      message: promotion.isActive 
        ? 'Đã kích hoạt mã khuyến mãi' 
        : 'Đã vô hiệu hóa mã khuyến mãi',
      data: updatedPromotion
    });
  } catch (error) {
    console.error('Lỗi khi toggle trạng thái khuyến mãi:', error.message);
    res.status(500).json({
      success: false,
      message: 'Đã xảy ra lỗi, vui lòng thử lại'
    });
  }
};

/**
 * POST /api/promotions/validate - Validate promotion code and calculate discount (User)
 */
const validatePromotion = async (req, res) => {
  try {
    const { code, orderTotal } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập mã khuyến mãi'
      });
    }

    if (orderTotal === undefined || orderTotal < 0) {
      return res.status(400).json({
        success: false,
        message: 'Giá trị đơn hàng không hợp lệ'
      });
    }

    // Find promotion by code
    const promotion = await Promotion.findOne({ 
      code: code.toUpperCase() 
    });

    // Check if code exists
    if (!promotion) {
      return res.status(404).json({
        success: false,
        message: 'Mã khuyến mãi không hợp lệ'
      });
    }

    // Check if promotion is active
    if (!promotion.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Mã khuyến mãi không còn hiệu lực'
      });
    }

    const now = new Date();

    // Check if promotion has started
    if (promotion.startDate > now) {
      return res.status(400).json({
        success: false,
        message: 'Mã khuyến mãi chưa có hiệu lực'
      });
    }

    // Check if promotion has expired
    if (promotion.endDate < now) {
      return res.status(400).json({
        success: false,
        message: 'Mã khuyến mãi đã hết hạn'
      });
    }

    // Check usage limit
    if (promotion.usedCount >= promotion.usageLimit) {
      return res.status(400).json({
        success: false,
        message: 'Mã khuyến mãi đã hết lượt sử dụng'
      });
    }

    // Check minimum order value
    if (orderTotal < promotion.minOrderValue) {
      return res.status(400).json({
        success: false,
        message: `Đơn hàng chưa đạt giá trị tối thiểu ${promotion.minOrderValue.toLocaleString('vi-VN')}đ để áp dụng mã này`
      });
    }

    // Calculate discount amount
    let discountAmount = 0;

    if (promotion.discountType === 'percentage') {
      discountAmount = Math.round(orderTotal * promotion.discountValue / 100);
      // Apply max discount cap if set
      if (promotion.maxDiscountAmount && discountAmount > promotion.maxDiscountAmount) {
        discountAmount = promotion.maxDiscountAmount;
      }
    } else {
      // Fixed discount
      discountAmount = promotion.discountValue;
      // Cap at order total (free order)
      if (discountAmount > orderTotal) {
        discountAmount = orderTotal;
      }
    }

    const finalTotal = orderTotal - discountAmount;

    res.status(200).json({
      success: true,
      data: {
        promotion: promotion.toJSON(),
        discountAmount,
        finalTotal
      }
    });
  } catch (error) {
    console.error('Lỗi khi validate khuyến mãi:', error.message);
    res.status(500).json({
      success: false,
      message: 'Đã xảy ra lỗi, vui lòng thử lại'
    });
  }
};

module.exports = {
  getPromotions,
  getPromotion,
  createPromotion,
  updatePromotion,
  deletePromotion,
  togglePromotionStatus,
  validatePromotion
};
