const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User là bắt buộc']
  },
  label: {
    type: String,
    required: [true, 'Nhãn địa chỉ là bắt buộc'],
    trim: true,
    maxlength: [50, 'Nhãn không được vượt quá 50 ký tự']
  },
  fullName: {
    type: String,
    required: [true, 'Họ tên là bắt buộc'],
    trim: true,
    minlength: [2, 'Họ tên phải có ít nhất 2 ký tự']
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
  },
  isDefault: {
    type: Boolean,
    default: false
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

// Index for user lookup
addressSchema.index({ user: 1 });
// Compound index for user + default
addressSchema.index({ user: 1, isDefault: 1 });

module.exports = mongoose.model('Address', addressSchema);
