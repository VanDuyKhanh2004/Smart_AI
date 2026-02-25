const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: [true, 'Sản phẩm là bắt buộc']
  },
  name: {
    type: String,
    required: [true, 'Tên sản phẩm là bắt buộc'],
    trim: true
  },
  price: {
    type: Number,
    required: [true, 'Giá sản phẩm là bắt buộc'],
    min: [0, 'Giá sản phẩm phải lớn hơn hoặc bằng 0']
  },
  quantity: {
    type: Number,
    required: [true, 'Số lượng là bắt buộc'],
    min: [1, 'Số lượng phải ít nhất là 1']
  },
  color: {
    type: String,
    required: [true, 'Màu sắc là bắt buộc'],
    trim: true
  },
  image: {
    type: String
  }
}, { _id: false });

const shippingAddressSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, 'Họ tên người nhận là bắt buộc'],
    trim: true
  },
  phone: {
    type: String,
    required: [true, 'Số điện thoại là bắt buộc'],
    match: [/^[0-9]{10,11}$/, 'Số điện thoại phải có 10-11 chữ số']
  },
  address: {
    type: String,
    required: [true, 'Địa chỉ là bắt buộc'],
    trim: true
  },
  ward: {
    type: String,
    required: [true, 'Phường/Xã là bắt buộc'],
    trim: true
  },
  district: {
    type: String,
    required: [true, 'Quận/Huyện là bắt buộc'],
    trim: true
  },
  city: {
    type: String,
    required: [true, 'Tỉnh/Thành phố là bắt buộc'],
    trim: true
  }
}, { _id: false });


const statusHistorySchema = new mongoose.Schema({
  status: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  note: {
    type: String,
    trim: true
  }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User là bắt buộc']
  },
  orderNumber: {
    type: String,
    unique: true,
    required: [true, 'Mã đơn hàng là bắt buộc']
  },
  items: {
    type: [orderItemSchema],
    required: [true, 'Đơn hàng phải có ít nhất một sản phẩm'],
    validate: {
      validator: function(v) {
        return v && v.length > 0;
      },
      message: 'Đơn hàng phải có ít nhất một sản phẩm'
    }
  },
  shippingAddress: {
    type: shippingAddressSchema,
    required: [true, 'Địa chỉ giao hàng là bắt buộc']
  },
  subtotal: {
    type: Number,
    required: [true, 'Tổng tiền hàng là bắt buộc'],
    min: [0, 'Tổng tiền hàng phải lớn hơn hoặc bằng 0']
  },
  shippingFee: {
    type: Number,
    default: 0,
    min: [0, 'Phí vận chuyển phải lớn hơn hoặc bằng 0']
  },
  promotion: {
    code: {
      type: String,
      trim: true,
      uppercase: true
    },
    discountType: {
      type: String,
      enum: ['percentage', 'fixed']
    },
    discountValue: {
      type: Number,
      min: [0, 'Giá trị giảm giá phải lớn hơn hoặc bằng 0']
    },
    discountAmount: {
      type: Number,
      min: [0, 'Số tiền giảm giá phải lớn hơn hoặc bằng 0']
    }
  },
  total: {
    type: Number,
    required: [true, 'Tổng đơn hàng là bắt buộc'],
    min: [0, 'Tổng đơn hàng phải lớn hơn hoặc bằng 0']
  },
  status: {
    type: String,
    enum: {
      values: ['pending', 'confirmed', 'processing', 'shipping', 'delivered', 'cancelled'],
      message: 'Trạng thái không hợp lệ'
    },
    default: 'pending'
  },
  statusHistory: [statusHistorySchema],
  confirmedAt: Date,
  shippedAt: Date,
  deliveredAt: Date,
  cancelledAt: Date,
  cancelReason: {
    type: String,
    trim: true
  }
}, {
  timestamps: true,
  
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  },
  
  toObject: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});


// Indexes for efficient queries
orderSchema.index({ user: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ orderNumber: 1 }, { unique: true });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });

/**
 * Generate unique order number
 * Format: ORD-YYYYMMDD-XXX (e.g., ORD-20241209-001)
 */
orderSchema.statics.generateOrderNumber = async function() {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `ORD-${dateStr}-`;
  
  // Find the last order of today to get the sequence number
  const lastOrder = await this.findOne({
    orderNumber: { $regex: `^${prefix}` }
  }).sort({ orderNumber: -1 });
  
  let sequence = 1;
  if (lastOrder) {
    const lastSequence = parseInt(lastOrder.orderNumber.split('-').pop(), 10);
    sequence = lastSequence + 1;
  }
  
  // Pad sequence to 3 digits
  const sequenceStr = sequence.toString().padStart(3, '0');
  return `${prefix}${sequenceStr}`;
};

/**
 * Calculate subtotal from items
 */
orderSchema.methods.calculateSubtotal = function() {
  return this.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
};

/**
 * Calculate total (subtotal + shippingFee - discountAmount)
 */
orderSchema.methods.calculateTotal = function() {
  const discountAmount = this.promotion?.discountAmount || 0;
  return this.subtotal + this.shippingFee - discountAmount;
};

/**
 * Add status to history
 */
orderSchema.methods.addStatusHistory = function(status, note = '') {
  this.statusHistory.push({
    status,
    timestamp: new Date(),
    note
  });
};

// Pre-save middleware to add initial status to history
orderSchema.pre('save', function(next) {
  if (this.isNew && this.statusHistory.length === 0) {
    this.statusHistory.push({
      status: this.status,
      timestamp: new Date(),
      note: 'Đơn hàng được tạo'
    });
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);
