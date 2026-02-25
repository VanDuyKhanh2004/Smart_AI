const mongoose = require('mongoose');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const Promotion = require('../models/Promotion');

// Default shipping fee
const SHIPPING_FEE = 30000;

/**
 * Create order from cart
 * Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 5.1 (promotion usage tracking)
 */
const createOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { shippingAddress, promotionCode } = req.body;
    const userId = req.user._id;

    // Validate shipping address
    if (!shippingAddress) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Địa chỉ giao hàng là bắt buộc',
        code: 'INVALID_SHIPPING_ADDRESS'
      });
    }

    const requiredFields = ['fullName', 'phone', 'address', 'ward', 'district', 'city'];
    for (const field of requiredFields) {
      if (!shippingAddress[field] || !shippingAddress[field].trim()) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `${field} là bắt buộc`,
          code: 'INVALID_SHIPPING_ADDRESS'
        });
      }
    }

    // Validate phone format
    if (!/^[0-9]{10,11}$/.test(shippingAddress.phone)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Số điện thoại phải có 10-11 chữ số',
        code: 'INVALID_SHIPPING_ADDRESS'
      });
    }

    // Get user's cart
    const cart = await Cart.findOne({ user: userId })
      .populate('items.product')
      .session(session);


    if (!cart || !cart.items || cart.items.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Giỏ hàng trống',
        code: 'CART_EMPTY'
      });
    }

    // Check stock for all items
    const orderItems = [];
    for (const item of cart.items) {
      const product = item.product;
      
      if (!product) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Sản phẩm không tồn tại',
          code: 'PRODUCT_NOT_FOUND'
        });
      }

      if (product.inStock < item.quantity) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Sản phẩm "${product.name}" không đủ số lượng. Chỉ còn ${product.inStock} sản phẩm`,
          code: 'INSUFFICIENT_STOCK'
        });
      }

      orderItems.push({
        product: product._id,
        name: product.name,
        price: product.price,
        quantity: item.quantity,
        color: item.color,
        image: product.image
      });
    }

    // Calculate subtotal
    const subtotal = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // Validate and apply promotion if provided
    let promotionData = null;
    let discountAmount = 0;

    if (promotionCode) {
      const promotion = await Promotion.findOne({ 
        code: promotionCode.toUpperCase() 
      }).session(session);

      // Check if code exists
      if (!promotion) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: 'Mã khuyến mãi không hợp lệ',
          code: 'INVALID_PROMOTION'
        });
      }

      // Check if promotion is active
      if (!promotion.isActive) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Mã khuyến mãi không còn hiệu lực',
          code: 'INACTIVE_PROMOTION'
        });
      }

      const now = new Date();

      // Check if promotion has started
      if (promotion.startDate > now) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Mã khuyến mãi chưa có hiệu lực',
          code: 'PROMOTION_NOT_STARTED'
        });
      }

      // Check if promotion has expired
      if (promotion.endDate < now) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Mã khuyến mãi đã hết hạn',
          code: 'EXPIRED_PROMOTION'
        });
      }

      // Check usage limit
      if (promotion.usedCount >= promotion.usageLimit) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Mã khuyến mãi đã hết lượt sử dụng',
          code: 'PROMOTION_USAGE_LIMIT'
        });
      }

      // Check minimum order value
      if (subtotal < promotion.minOrderValue) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Đơn hàng chưa đạt giá trị tối thiểu ${promotion.minOrderValue.toLocaleString('vi-VN')}đ để áp dụng mã này`,
          code: 'MIN_ORDER_NOT_MET'
        });
      }

      // Calculate discount amount
      if (promotion.discountType === 'percentage') {
        discountAmount = Math.round(subtotal * promotion.discountValue / 100);
        // Apply max discount cap if set
        if (promotion.maxDiscountAmount && discountAmount > promotion.maxDiscountAmount) {
          discountAmount = promotion.maxDiscountAmount;
        }
      } else {
        // Fixed discount
        discountAmount = promotion.discountValue;
        // Cap at subtotal (free order)
        if (discountAmount > subtotal) {
          discountAmount = subtotal;
        }
      }

      promotionData = {
        code: promotion.code,
        discountType: promotion.discountType,
        discountValue: promotion.discountValue,
        discountAmount
      };
    }

    // Calculate total (subtotal + shipping - discount)
    const total = subtotal + SHIPPING_FEE - discountAmount;

    // Generate order number
    const orderNumber = await Order.generateOrderNumber();

    // Create order
    const orderData = {
      user: userId,
      orderNumber,
      items: orderItems,
      shippingAddress,
      subtotal,
      shippingFee: SHIPPING_FEE,
      total,
      status: 'pending'
    };

    // Add promotion data if applied
    if (promotionData) {
      orderData.promotion = promotionData;
    }

    const order = new Order(orderData);

    await order.save({ session });

    // Increment promotion usedCount if promotion was applied (Requirement 5.1)
    if (promotionCode) {
      await Promotion.findOneAndUpdate(
        { code: promotionCode.toUpperCase() },
        { $inc: { usedCount: 1 } },
        { session }
      );
    }

    // Decrease stock for all products
    for (const item of cart.items) {
      await Product.findByIdAndUpdate(
        item.product._id,
        { $inc: { inStock: -item.quantity } },
        { session }
      );
    }

    // Clear cart
    cart.items = [];
    await cart.save({ session });

    await session.commitTransaction();

    // Populate user info for response
    const populatedOrder = await Order.findById(order._id)
      .populate('user', 'name email');

    res.status(201).json({
      success: true,
      message: 'Đặt hàng thành công',
      data: populatedOrder
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi tạo đơn hàng',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    session.endSession();
  }
};


/**
 * Get user's orders with pagination
 * Requirements: 2.1, 2.2
 */
const getUserOrders = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      Order.find({ user: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('user', 'name email'),
      Order.countDocuments({ user: userId })
    ]);

    res.status(200).json({
      success: true,
      data: orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy danh sách đơn hàng',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get single order by ID
 * Requirements: 2.3
 */
const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID đơn hàng không hợp lệ',
        code: 'ORDER_NOT_FOUND'
      });
    }

    const order = await Order.findById(id)
      .populate('user', 'name email');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy đơn hàng',
        code: 'ORDER_NOT_FOUND'
      });
    }

    // Verify user ownership (unless admin)
    if (order.user._id.toString() !== userId.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền xem đơn hàng này',
        code: 'FORBIDDEN'
      });
    }

    res.status(200).json({
      success: true,
      data: order
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy chi tiết đơn hàng',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


/**
 * Get all orders with filters (admin)
 * Requirements: 3.1, 3.2, 5.1, 5.2, 5.3
 */
const getAllOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter query
    const filter = {};

    // Status filter (Requirement 5.1)
    if (req.query.status) {
      filter.status = req.query.status;
    }

    // Date range filter (Requirement 5.3)
    if (req.query.startDate || req.query.endDate) {
      filter.createdAt = {};
      if (req.query.startDate) {
        filter.createdAt.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        // Set end date to end of day
        const endDate = new Date(req.query.endDate);
        endDate.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = endDate;
      }
    }

    // Search filter (Requirement 5.2) - search by orderNumber or customer name
    let searchQuery = {};
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      searchQuery = {
        $or: [
          { orderNumber: searchRegex }
        ]
      };
    }

    // Combine filters
    const finalFilter = req.query.search 
      ? { $and: [filter, searchQuery] }
      : filter;

    // Get orders with user populated for search
    let ordersQuery = Order.find(finalFilter)
      .populate('user', 'name email')
      .sort({ createdAt: -1 });

    // If searching by customer name, we need to filter after populate
    let orders = await ordersQuery.exec();
    
    if (req.query.search) {
      const searchLower = req.query.search.toLowerCase();
      orders = orders.filter(order => 
        order.orderNumber.toLowerCase().includes(searchLower) ||
        (order.user && order.user.name && order.user.name.toLowerCase().includes(searchLower))
      );
    }

    const total = orders.length;
    const paginatedOrders = orders.slice(skip, skip + limit);

    res.status(200).json({
      success: true,
      data: paginatedOrders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy danh sách đơn hàng',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get order statistics (admin)
 * Requirements: 3.1
 */
const getOrderStats = async (req, res) => {
  try {
    const [total, statusCounts] = await Promise.all([
      Order.countDocuments(),
      Order.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    // Convert to object format
    const byStatus = {
      pending: 0,
      confirmed: 0,
      processing: 0,
      shipping: 0,
      delivered: 0,
      cancelled: 0
    };

    statusCounts.forEach(item => {
      byStatus[item._id] = item.count;
    });

    res.status(200).json({
      success: true,
      data: {
        total,
        byStatus
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy thống kê đơn hàng',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


/**
 * Update order status (admin)
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */
const updateOrderStatus = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { status, note, cancelReason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'ID đơn hàng không hợp lệ',
        code: 'ORDER_NOT_FOUND'
      });
    }

    const validStatuses = ['pending', 'confirmed', 'processing', 'shipping', 'delivered', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Trạng thái không hợp lệ',
        code: 'INVALID_STATUS_TRANSITION'
      });
    }

    const order = await Order.findById(id).session(session);

    if (!order) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy đơn hàng',
        code: 'ORDER_NOT_FOUND'
      });
    }

    // Validate status transitions
    const validTransitions = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['processing', 'cancelled'],
      processing: ['shipping', 'cancelled'],
      shipping: ['delivered', 'cancelled'],
      delivered: [],
      cancelled: []
    };

    if (!validTransitions[order.status].includes(status)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Không thể chuyển từ trạng thái "${order.status}" sang "${status}"`,
        code: 'INVALID_STATUS_TRANSITION'
      });
    }

    // Update status
    order.status = status;

    // Record timestamps based on status (Requirements 4.2, 4.3, 4.4)
    const now = new Date();
    if (status === 'confirmed') {
      order.confirmedAt = now;
    } else if (status === 'shipping') {
      order.shippedAt = now;
    } else if (status === 'delivered') {
      order.deliveredAt = now;
    } else if (status === 'cancelled') {
      order.cancelledAt = now;
      if (cancelReason) {
        order.cancelReason = cancelReason;
      }

      // Restore stock for cancelled orders (Requirement 4.5)
      for (const item of order.items) {
        await Product.findByIdAndUpdate(
          item.product,
          { $inc: { inStock: item.quantity } },
          { session }
        );
      }
    }

    // Add to status history
    order.addStatusHistory(status, note || '');

    await order.save({ session });
    await session.commitTransaction();

    // Populate user for response
    const updatedOrder = await Order.findById(id)
      .populate('user', 'name email');

    res.status(200).json({
      success: true,
      message: 'Cập nhật trạng thái đơn hàng thành công',
      data: updatedOrder
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi cập nhật trạng thái đơn hàng',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    session.endSession();
  }
};

/**
 * Cancel order by user
 * Only allows cancellation for pending/confirmed orders
 * Requirements: 1.3, 1.4, 1.5, 1.6, 2.3
 */
const cancelOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { reason, customReason } = req.body;
    const userId = req.user._id;

    // Validate order ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'ID đơn hàng không hợp lệ',
        code: 'ORDER_NOT_FOUND'
      });
    }

    // Validate cancellation reason is provided (Requirement 2.3)
    if (!reason || !reason.trim()) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Vui lòng chọn lý do hủy đơn hàng',
        code: 'CANCEL_REASON_REQUIRED'
      });
    }

    // Find the order
    const order = await Order.findById(id).session(session);

    if (!order) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy đơn hàng',
        code: 'ORDER_NOT_FOUND'
      });
    }

    // Verify user owns the order (Requirement 1.6)
    if (order.user.toString() !== userId.toString()) {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền hủy đơn hàng này',
        code: 'FORBIDDEN'
      });
    }

    // Check order status is 'pending' or 'confirmed' (Requirement 1.5)
    const cancellableStatuses = ['pending', 'confirmed'];
    if (!cancellableStatuses.includes(order.status)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Không thể hủy đơn hàng với trạng thái "${order.status}". Chỉ có thể hủy đơn hàng đang chờ xử lý hoặc đã xác nhận.`,
        code: 'INVALID_STATUS_FOR_CANCEL'
      });
    }

    // Determine the final cancel reason
    const finalReason = reason === 'other' && customReason ? customReason.trim() : reason;

    // Update order status to 'cancelled' (Requirement 1.3)
    order.status = 'cancelled';
    order.cancelReason = finalReason;
    order.cancelledAt = new Date();

    // Add to status history
    order.addStatusHistory('cancelled', `Khách hàng hủy đơn: ${finalReason}`);

    // Restore stock for all items (Requirement 1.4)
    for (const item of order.items) {
      await Product.findByIdAndUpdate(
        item.product,
        { $inc: { inStock: item.quantity } },
        { session }
      );
    }

    await order.save({ session });
    await session.commitTransaction();

    // Populate user for response
    const updatedOrder = await Order.findById(id)
      .populate('user', 'name email');

    res.status(200).json({
      success: true,
      message: 'Hủy đơn hàng thành công',
      data: updatedOrder
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi hủy đơn hàng',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    session.endSession();
  }
};

module.exports = {
  createOrder,
  getUserOrders,
  getOrderById,
  getAllOrders,
  getOrderStats,
  updateOrderStatus,
  cancelOrder
};
