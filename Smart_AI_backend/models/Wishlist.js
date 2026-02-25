const mongoose = require('mongoose');

const wishlistItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: [true, 'Sản phẩm là bắt buộc']
  },
  addedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

const wishlistSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User là bắt buộc'],
    unique: true
  },
  items: [wishlistItemSchema]
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

// Index for user lookup (unique)
wishlistSchema.index({ user: 1 }, { unique: true });

// Index for checking if product exists in wishlist
wishlistSchema.index({ 'items.product': 1 });

module.exports = mongoose.model('Wishlist', wishlistSchema);
