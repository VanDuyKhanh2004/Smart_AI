const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
  question: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    required: [true, 'Question là bắt buộc']
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User là bắt buộc']
  },
  answerText: {
    type: String,
    required: [true, 'Câu trả lời là bắt buộc'],
    trim: true,
    minlength: [5, 'Câu trả lời phải có ít nhất 5 ký tự'],
    maxlength: [1000, 'Câu trả lời không được vượt quá 1000 ký tự']
  },
  isOfficial: {
    type: Boolean,
    default: false
  },
  isAISuggestion: {
    type: Boolean,
    default: false
  },
  aiConfidence: {
    type: Number,
    min: [0, 'AI confidence phải từ 0-1'],
    max: [1, 'AI confidence phải từ 0-1']
  },
  aiSourceSpecs: [{
    type: String,
    trim: true
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

// Index for fetching answers by question, sorted by creation date
// Validates: Requirements 2.3
answerSchema.index({ question: 1, createdAt: 1 });

// Index for filtering AI suggestions
// Validates: Requirements 5.2
answerSchema.index({ isAISuggestion: 1 });

/**
 * Static method to get answers for a question
 * @param {ObjectId} questionId - The question ID
 * @returns {Promise<Answer[]>} Array of answers
 */
answerSchema.statics.getAnswersForQuestion = function(questionId) {
  return this.find({ question: questionId })
    .sort({ createdAt: 1 })
    .populate('user', 'name role');
};

/**
 * Static method to delete all answers for a question
 * Used for cascade delete when question is deleted
 * Validates: Requirements 6.4, 7.1
 * @param {ObjectId} questionId - The question ID
 * @returns {Promise<DeleteResult>} Delete result
 */
answerSchema.statics.deleteByQuestion = function(questionId) {
  return this.deleteMany({ question: questionId });
};

module.exports = mongoose.model('Answer', answerSchema);
