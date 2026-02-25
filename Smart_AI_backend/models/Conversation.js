const mongoose = require('mongoose');


const conversationSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: [true, 'Session ID là bắt buộc'],
    unique: true,
    trim: true,
    validate: {
      validator: function(v) {
        // Validate UUID format (basic check)
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
      },
      message: 'Session ID phải có định dạng UUID hợp lệ'
    }
  },
  
  messages: [{
    role: {
      type: String,
      required: [true, 'Role là bắt buộc'],
      enum: {
        values: ['user', 'assistant', 'system'],
        message: 'Role phải là user, assistant hoặc system'
      }
    },
    
    content: {
      type: String,
      required: [true, 'Nội dung tin nhắn là bắt buộc'],
      trim: true,
      maxlength: [10000, 'Tin nhắn không được vượt quá 10000 ký tự']
    },
    
    timestamp: {
      type: Date,
      default: Date.now,
      required: true
    },
    
    metadata: {
      userAgent: String,
      ipAddress: String,
      
      modelUsed: String, // VD: "gemini-1.5-flash"
      tokensUsed: Number,
      processingTime: Number, // milliseconds
      
      retrievedProducts: [{
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product'
        },
        score: Number // Vector search score
      }],
      
      clarifiedQuery: String,
      originalQuery: String
    }
  }],
  
  status: {
    type: String,
    enum: ['active', 'ended', 'archived'],
    default: 'active'
  },
  
  messageCount: {
    type: Number,
    default: 0
  },
  
  lastMessageAt: {
    type: Date,
    default: Date.now
  },
  
  userInfo: {
    fingerprint: String, 
    sessionDuration: Number, 
    previousSessions: [{
      sessionId: String,
      timestamp: Date
    }]
  },
  
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  
  feedback: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    comment: {
      type: String,
      maxlength: 500
    },
    submittedAt: Date
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


conversationSchema.index({ sessionId: 1 }, { unique: true });
conversationSchema.index({ lastMessageAt: -1 });
conversationSchema.index({ createdAt: -1 });
conversationSchema.index({ status: 1 });


conversationSchema.index({ status: 1, lastMessageAt: -1 });
conversationSchema.index({ messageCount: 1, createdAt: -1 });


conversationSchema.index({
  'messages.content': 'text'
});


conversationSchema.pre('save', function(next) {
  if (this.isModified('messages')) {
    this.messageCount = this.messages.length;
    
    if (this.messages.length > 0) {
      this.lastMessageAt = this.messages[this.messages.length - 1].timestamp;
    }
  }
  next();
});


conversationSchema.virtual('lastMessage').get(function() {
  return this.messages.length > 0 ? this.messages[this.messages.length - 1] : null;
});

conversationSchema.virtual('recentMessages').get(function() {
  const recentCount = 6;
  return this.messages.slice(-recentCount);
});


conversationSchema.virtual('sessionDuration').get(function() {
  if (this.messages.length === 0) return 0;
  
  const firstMessage = this.messages[0].timestamp;
  const lastMessage = this.messages[this.messages.length - 1].timestamp;
  
  return lastMessage.getTime() - firstMessage.getTime();
});


conversationSchema.statics.findActive = function() {
  return this.find({ status: 'active' });
};


conversationSchema.statics.findByDateRange = function(startDate, endDate) {
  return this.find({
    createdAt: {
      $gte: startDate,
      $lte: endDate
    }
  });
};


conversationSchema.statics.getStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalConversations: { $sum: 1 },
        averageMessages: { $avg: '$messageCount' },
        activeConversations: {
          $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
        }
      }
    }
  ]);
  
  return stats[0] || {
    totalConversations: 0,
    averageMessages: 0,
    activeConversations: 0
  };
};


conversationSchema.methods.addMessage = function(role, content, metadata = {}) {
  const message = {
    role,
    content,
    timestamp: new Date(),
    metadata
  };
  
  this.messages.push(message);
  return this.save();
};


conversationSchema.methods.getLastUserMessage = function() {
  const userMessages = this.messages.filter(msg => msg.role === 'user');
  return userMessages.length > 0 ? userMessages[userMessages.length - 1] : null;
};


conversationSchema.methods.getContextMessages = function(limit = 6) {
  return this.messages
    .slice(-limit)
    .map(msg => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp
    }));
};


conversationSchema.methods.endConversation = function() {
  this.status = 'ended';
  return this.save();
};


conversationSchema.methods.archive = function() {
  this.status = 'archived';
  return this.save();
};

module.exports = mongoose.model('Conversation', conversationSchema);
