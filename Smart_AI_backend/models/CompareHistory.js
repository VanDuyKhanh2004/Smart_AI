const mongoose = require('mongoose');

const compareHistorySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User là bắt buộc']
  },
  products: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  }]
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

// Validate 2-4 products
compareHistorySchema.path('products').validate(function(value) {
  return value.length >= 2 && value.length <= 4;
}, 'Comparison phải có từ 2-4 sản phẩm');

// Index for user queries sorted by date (descending)
compareHistorySchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('CompareHistory', compareHistorySchema);
