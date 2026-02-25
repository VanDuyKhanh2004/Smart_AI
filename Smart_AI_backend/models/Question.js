const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: [true, 'Product là bắt buộc']
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User là bắt buộc']
  },
  questionText: {
    type: String,
    required: [true, 'Câu hỏi là bắt buộc'],
    trim: true,
    minlength: [10, 'Câu hỏi phải có ít nhất 10 ký tự'],
    maxlength: [500, 'Câu hỏi không được vượt quá 500 ký tự']
  },
  status: {
    type: String,
    enum: {
      values: ['pending', 'approved', 'answered', 'rejected'],
      message: 'Status phải là pending, approved, answered hoặc rejected'
    },
    default: 'pending'
  },
  upvotes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  upvoteCount: {
    type: Number,
    default: 0
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

// Index for fetching approved/answered questions by product
// Validates: Requirements 2.1
questionSchema.index({ product: 1, status: 1 });

// Index for sorting by upvotes within a product
// Validates: Requirements 2.1
questionSchema.index({ product: 1, upvoteCount: -1 });

// Index for user's questions
questionSchema.index({ user: 1 });

// Index for admin listing with status filter and sorting by date
// Validates: Requirements 6.1
questionSchema.index({ status: 1, createdAt: -1 });

/**
 * Toggle upvote for a user
 * If user has upvoted, remove upvote; otherwise add upvote
 * Validates: Requirements 4.1, 4.2
 * @param {ObjectId} userId - The user ID to toggle upvote for
 * @returns {Promise<Question>} Updated question
 */
questionSchema.methods.toggleUpvote = function(userId) {
  const userIdStr = userId.toString();
  const index = this.upvotes.findIndex(id => id.toString() === userIdStr);
  
  if (index === -1) {
    // User hasn't upvoted, add upvote
    this.upvotes.push(userId);
    this.upvoteCount = this.upvotes.length;
  } else {
    // User has upvoted, remove upvote
    this.upvotes.splice(index, 1);
    this.upvoteCount = this.upvotes.length;
  }
  
  return this.save();
};

/**
 * Check if a user has upvoted this question
 * @param {ObjectId} userId - The user ID to check
 * @returns {boolean} True if user has upvoted
 */
questionSchema.methods.hasUserUpvoted = function(userId) {
  if (!userId) return false;
  const userIdStr = userId.toString();
  return this.upvotes.some(id => id.toString() === userIdStr);
};

/**
 * Static method to get visible questions for a product (approved or answered)
 * Validates: Requirements 2.1
 * @param {ObjectId} productId - The product ID
 * @returns {Promise<Question[]>} Array of visible questions
 */
questionSchema.statics.getVisibleQuestions = function(productId) {
  return this.find({
    product: productId,
    status: { $in: ['approved', 'answered'] }
  })
  .sort({ upvoteCount: -1 })
  .populate('user', 'name');
};

module.exports = mongoose.model('Question', questionSchema);
