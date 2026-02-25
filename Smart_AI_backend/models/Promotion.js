const mongoose = require('mongoose');

const promotionSchema = new mongoose.Schema({
  code: {
    type: String,
    required: [true, 'Mã khuyến mãi là bắt buộc'],
    unique: true,
    uppercase: true,
    trim: true,
    minlength: [4, 'Mã phải có ít nhất 4 ký tự'],
    maxlength: [20, 'Mã không được vượt quá 20 ký tự'],
    match: [/^[A-Z0-9]+$/, 'Mã chỉ chứa chữ cái và số']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [200, 'Mô tả không được vượt quá 200 ký tự']
  },
  discountType: {
    type: String,
    enum: {
      values: ['percentage', 'fixed'],
      message: 'Loại giảm giá phải là percentage hoặc fixed'
    },
    required: [true, 'Loại giảm giá là bắt buộc']
  },
  discountValue: {
    type: Number,
    required: [true, 'Giá trị giảm giá là bắt buộc'],
    min: [1, 'Giá trị giảm giá phải lớn hơn 0']
  },
  minOrderValue: {
    type: Number,
    default: 0,
    min: [0, 'Giá trị đơn hàng tối thiểu không được âm']
  },
  maxDiscountAmount: {
    type: Number,
    default: null
  },
  usageLimit: {
    type: Number,
    required: [true, 'Giới hạn sử dụng là bắt buộc'],
    min: [1, 'Giới hạn sử dụng phải ít nhất là 1']
  },
  usedCount: {
    type: Number,
    default: 0,
    min: [0, 'Số lần sử dụng không được âm']
  },
  startDate: {
    type: Date,
    required: [true, 'Ngày bắt đầu là bắt buộc']
  },
  endDate: {
    type: Date,
    required: [true, 'Ngày kết thúc là bắt buộc']
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  },
  toObject: {
    virtuals: true,
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes for code and status queries
promotionSchema.index({ code: 1 }, { unique: true });
promotionSchema.index({ isActive: 1, startDate: 1, endDate: 1 });
promotionSchema.index({ createdAt: -1 });

// Validation: endDate must be after startDate
promotionSchema.pre('validate', function(next) {
  if (this.endDate && this.startDate && this.endDate <= this.startDate) {
    this.invalidate('endDate', 'Ngày kết thúc phải sau ngày bắt đầu');
  }
  if (this.discountType === 'percentage' && this.discountValue > 100) {
    this.invalidate('discountValue', 'Phần trăm giảm giá không được vượt quá 100');
  }
  next();
});

// Virtual: check if promotion is currently valid
promotionSchema.virtual('isValid').get(function() {
  const now = new Date();
  return this.isActive && 
         this.startDate <= now && 
         this.endDate >= now && 
         this.usedCount < this.usageLimit;
});

// Virtual: remaining uses
promotionSchema.virtual('remainingUses').get(function() {
  return Math.max(0, this.usageLimit - this.usedCount);
});

module.exports = mongoose.model('Promotion', promotionSchema);
