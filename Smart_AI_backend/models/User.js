const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Tên là bắt buộc'],
    minlength: [2, 'Tên phải có ít nhất 2 ký tự'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email là bắt buộc'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Vui lòng cung cấp email hợp lệ']
  },
  password: {
    type: String,
    required: function() {
      return !this.googleId; // Password not required for Google login
    },
    minlength: [6, 'Mật khẩu phải có ít nhất 6 ký tự'],
    select: false
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true // Allow null values but enforce uniqueness
  },
  refreshToken: {
    type: String,
    select: false
  },
  role: {
    type: String,
    enum: {
      values: ['user', 'admin'],
      message: 'Role phải là user hoặc admin'
    },
    default: 'user'
  },
  phone: {
    type: String,
    trim: true,
    match: [/^[0-9]{10,11}$/, 'Số điện thoại phải có 10-11 chữ số']
  },
  avatar: {
    type: String,
    default: null
  }
}, {
  timestamps: true,
  
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      delete ret.password;
      delete ret.refreshToken;
      return ret;
    }
  },
  
  toObject: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      delete ret.password;
      delete ret.refreshToken;
      return ret;
    }
  }
});

// Index for email lookup performance
userSchema.index({ email: 1 });

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) {
    return next();
  }
  
  try {
    // Generate salt and hash password
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Static method to find user by email with password
userSchema.statics.findByEmailWithPassword = function(email) {
  return this.findOne({ email }).select('+password');
};

// Static method to find user by email with refresh token
userSchema.statics.findByEmailWithRefreshToken = function(email) {
  return this.findOne({ email }).select('+refreshToken');
};

module.exports = mongoose.model('User', userSchema);
