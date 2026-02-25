const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: [true, 'Cửa hàng là bắt buộc']
  },
  
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null // null for guest bookings
  },
  
  // Guest info (required if no user)
  guestInfo: {
    name: {
      type: String,
      trim: true,
      maxlength: [100, 'Tên không được vượt quá 100 ký tự']
    },
    phone: {
      type: String,
      trim: true,
      match: [/^[0-9]{10,11}$/, 'Số điện thoại phải có 10-11 chữ số']
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Email không hợp lệ']
    }
  },
  
  date: {
    type: Date,
    required: [true, 'Ngày hẹn là bắt buộc']
  },
  
  timeSlot: {
    start: {
      type: String,
      required: [true, 'Giờ bắt đầu là bắt buộc'],
      match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Giờ bắt đầu không hợp lệ (HH:MM)']
    },
    end: {
      type: String,
      required: [true, 'Giờ kết thúc là bắt buộc'],
      match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Giờ kết thúc không hợp lệ (HH:MM)']
    }
  },

  purpose: {
    type: String,
    enum: {
      values: ['consultation', 'warranty', 'purchase', 'other'],
      message: 'Mục đích phải là consultation, warranty, purchase hoặc other'
    },
    required: [true, 'Mục đích là bắt buộc']
  },
  
  notes: {
    type: String,
    maxlength: [500, 'Ghi chú không được vượt quá 500 ký tự']
  },
  
  status: {
    type: String,
    enum: {
      values: ['pending', 'confirmed', 'cancelled', 'completed'],
      message: 'Trạng thái không hợp lệ'
    },
    default: 'pending'
  },
  
  cancelReason: {
    type: String,
    maxlength: [500, 'Lý do hủy không được vượt quá 500 ký tự']
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

// Indexes for querying appointments
appointmentSchema.index({ store: 1, date: 1 });
appointmentSchema.index({ user: 1, date: -1 });
appointmentSchema.index({ status: 1 });
appointmentSchema.index({ date: 1, status: 1 });

// Valid status transitions
const VALID_STATUS_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  cancelled: [],
  completed: []
};

// Static method to validate status transition
appointmentSchema.statics.isValidStatusTransition = function(currentStatus, newStatus) {
  const validTransitions = VALID_STATUS_TRANSITIONS[currentStatus] || [];
  return validTransitions.includes(newStatus);
};

// Static method to get valid transitions for a status
appointmentSchema.statics.getValidTransitions = function(currentStatus) {
  return VALID_STATUS_TRANSITIONS[currentStatus] || [];
};

// Pre-save validation for guest info
appointmentSchema.pre('save', function(next) {
  // If no user, guest info is required
  if (!this.user) {
    if (!this.guestInfo || !this.guestInfo.name || !this.guestInfo.phone || !this.guestInfo.email) {
      const error = new Error('Thông tin khách (tên, số điện thoại, email) là bắt buộc khi không đăng nhập');
      error.name = 'ValidationError';
      return next(error);
    }
  }
  next();
});

// Instance method to check if appointment can be cancelled (24-hour rule)
appointmentSchema.methods.canBeCancelled = function() {
  const now = new Date();
  const appointmentDateTime = new Date(this.date);
  
  // Parse time slot start
  const [hours, minutes] = this.timeSlot.start.split(':').map(Number);
  appointmentDateTime.setHours(hours, minutes, 0, 0);
  
  // Calculate difference in hours
  const diffMs = appointmentDateTime.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  
  return diffHours >= 24;
};

// Instance method to check if status transition is valid
appointmentSchema.methods.canTransitionTo = function(newStatus) {
  return appointmentSchema.statics.isValidStatusTransition(this.status, newStatus);
};

// Virtual for formatted date
appointmentSchema.virtual('formattedDate').get(function() {
  if (!this.date) return null;
  return this.date.toLocaleDateString('vi-VN');
});

// Virtual for contact info (returns user info or guest info)
appointmentSchema.virtual('contactInfo').get(function() {
  if (this.user && this.user.name) {
    return {
      name: this.user.name,
      phone: this.user.phone,
      email: this.user.email
    };
  }
  return this.guestInfo;
});

module.exports = mongoose.model('Appointment', appointmentSchema);
