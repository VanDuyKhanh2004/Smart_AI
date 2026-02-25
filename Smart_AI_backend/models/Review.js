const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User là bắt buộc']
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: [true, 'Product là bắt buộc']
  },
  rating: {
    type: Number,
    required: [true, 'Rating là bắt buộc'],
    min: [1, 'Rating phải từ 1-5'],
    max: [5, 'Rating phải từ 1-5'],
    validate: {
      validator: Number.isInteger,
      message: 'Rating phải là số nguyên'
    }
  },
  comment: {
    type: String,
    trim: true,
    maxlength: [1000, 'Comment không được vượt quá 1000 ký tự']
  },
  status: {
    type: String,
    enum: {
      values: ['pending', 'approved', 'rejected'],
      message: 'Status phải là pending, approved hoặc rejected'
    },
    default: 'approved'
  },
  isVerifiedPurchase: {
    type: Boolean,
    default: true
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

// Unique constraint: one review per user per product
// Validates: Requirements 1.5
reviewSchema.index({ user: 1, product: 1 }, { unique: true });

// Index for fetching approved reviews by product
// Used for getProductReviews endpoint
reviewSchema.index({ product: 1, status: 1 });

// Index for admin listing with status filter and sorting by date
reviewSchema.index({ status: 1, createdAt: -1 });

/**
 * Static method to calculate average rating for a product
 * Only considers approved reviews
 */
reviewSchema.statics.getProductStats = async function(productId) {
  const stats = await this.aggregate([
    { 
      $match: { 
        product: new mongoose.Types.ObjectId(productId),
        status: 'approved'
      }
    },
    {
      $group: {
        _id: '$product',
        averageRating: { $avg: '$rating' },
        totalCount: { $sum: 1 }
      }
    }
  ]);
  
  if (stats.length > 0) {
    return {
      averageRating: Math.round(stats[0].averageRating * 10) / 10, // Round to 1 decimal
      totalCount: stats[0].totalCount
    };
  }
  
  return {
    averageRating: 0,
    totalCount: 0
  };
};

/**
 * Static method to check if user has already reviewed a product
 */
reviewSchema.statics.hasUserReviewed = async function(userId, productId) {
  const review = await this.findOne({ user: userId, product: productId });
  return !!review;
};

module.exports = mongoose.model('Review', reviewSchema);
