const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: [true, 'Session ID là bắt buộc'],
    trim: true,
    validate: {
      validator: function(v) {
        // Validate UUID format (basic check)
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
      },
      message: 'Session ID phải có định dạng UUID hợp lệ'
    }
  },
  
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: [true, 'Conversation ID là bắt buộc']
  },
  
  complaintSummary: {
    type: String,
    trim: true,
    maxlength: [500, 'Tóm tắt phàn nàn không được vượt quá 500 ký tự']
  },
  
  detailedDescription: {
    type: String,
    trim: true,
    maxlength: [2000, 'Mô tả chi tiết không được vượt quá 2000 ký tự']
  },
  
  customerContact: {
    email: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    }
  },
  
  status: {
    type: String,
    enum: {
      values: ['open', 'in_progress', 'resolved', 'closed'],
      message: 'Trạng thái phải là open, in_progress, resolved, hoặc closed'
    },
    default: 'open',
    required: true
  },
  
  priority: {
    type: String,
    enum: {
      values: ['low', 'medium', 'high', 'urgent'],
      message: 'Mức độ ưu tiên phải là low, medium, high, hoặc urgent'
    },
    default: 'medium',
    required: true
  },
  
  assignedTo: {
    type: String,
    trim: true
  },
  
  resolutionNotes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Ghi chú giải quyết không được vượt quá 1000 ký tự']
  },
  
  resolvedAt: {
    type: Date
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
}, {
  timestamps: true, // Automatically adds createdAt and updatedAt
  
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

// Indexes for performance optimization
complaintSchema.index({ sessionId: 1 });
complaintSchema.index({ conversationId: 1 });
complaintSchema.index({ status: 1 });
complaintSchema.index({ priority: 1 });
complaintSchema.index({ createdAt: -1 });
complaintSchema.index({ resolvedAt: -1 });

// Compound indexes
complaintSchema.index({ status: 1, priority: 1 });
complaintSchema.index({ status: 1, createdAt: -1 });
complaintSchema.index({ assignedTo: 1, status: 1 });

// Text search index
complaintSchema.index({
  complaintSummary: 'text',
  detailedDescription: 'text',
  resolutionNotes: 'text'
}, {
  weights: {
    complaintSummary: 10,
    detailedDescription: 5,
    resolutionNotes: 3
  }
});

// Pre-save middleware
complaintSchema.pre('save', function(next) {
  // Auto-resolve timestamp when status changes to resolved
  if (this.isModified('status') && this.status === 'resolved' && !this.resolvedAt) {
    this.resolvedAt = new Date();
  }
  
  // Clear resolvedAt if status is changed from resolved to something else
  if (this.isModified('status') && this.status !== 'resolved' && this.resolvedAt) {
    this.resolvedAt = undefined;
  }
  
  next();
});

// Virtual fields
complaintSchema.virtual('isOpen').get(function() {
  return this.status === 'open';
});

complaintSchema.virtual('isResolved').get(function() {
  return this.status === 'resolved' || this.status === 'closed';
});

complaintSchema.virtual('resolutionTime').get(function() {
  if (this.resolvedAt && this.createdAt) {
    return this.resolvedAt.getTime() - this.createdAt.getTime();
  }
  return null;
});

complaintSchema.virtual('hasContact').get(function() {
  return !!(this.customerContact && (this.customerContact.email || this.customerContact.phone));
});

// Static methods
complaintSchema.statics.findByStatus = function(status) {
  return this.find({ status: status });
};

complaintSchema.statics.findByPriority = function(priority) {
  return this.find({ priority: priority });
};

complaintSchema.statics.findUnresolved = function() {
  return this.find({ 
    status: { $in: ['open', 'in_progress'] } 
  }).sort({ priority: -1, createdAt: 1 });
};

complaintSchema.statics.getStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalComplaints: { $sum: 1 },
        openComplaints: {
          $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] }
        },
        inProgressComplaints: {
          $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] }
        },
        resolvedComplaints: {
          $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] }
        },
        closedComplaints: {
          $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] }
        },
        avgResolutionTime: {
          $avg: {
            $cond: [
              { $and: [{ $ne: ['$resolvedAt', null] }, { $ne: ['$createdAt', null] }] },
              { $subtract: ['$resolvedAt', '$createdAt'] },
              null
            ]
          }
        }
      }
    }
  ]);
  
  return stats[0] || {
    totalComplaints: 0,
    openComplaints: 0,
    inProgressComplaints: 0,
    resolvedComplaints: 0,
    closedComplaints: 0,
    avgResolutionTime: null
  };
};

// Instance methods
complaintSchema.methods.markAsInProgress = function(assignedTo = null) {
  this.status = 'in_progress';
  if (assignedTo) {
    this.assignedTo = assignedTo;
  }
  return this.save();
};

complaintSchema.methods.resolve = function(resolutionNotes = null) {
  this.status = 'resolved';
  this.resolvedAt = new Date();
  if (resolutionNotes) {
    this.resolutionNotes = resolutionNotes;
  }
  return this.save();
};

complaintSchema.methods.close = function(resolutionNotes = null) {
  this.status = 'closed';
  if (!this.resolvedAt) {
    this.resolvedAt = new Date();
  }
  if (resolutionNotes) {
    this.resolutionNotes = resolutionNotes;
  }
  return this.save();
};

complaintSchema.methods.escalate = function() {
  if (this.metadata.escalationLevel < 3) {
    this.metadata.escalationLevel += 1;
    
    // Auto-increase priority based on escalation level
    if (this.metadata.escalationLevel === 1 && this.priority === 'low') {
      this.priority = 'medium';
    } else if (this.metadata.escalationLevel === 2 && this.priority === 'medium') {
      this.priority = 'high';
    } else if (this.metadata.escalationLevel === 3 && this.priority === 'high') {
      this.priority = 'urgent';
    }
  }
  return this.save();
};

complaintSchema.methods.updateContact = function(email = null, phone = null) {
  if (!this.customerContact) {
    this.customerContact = {};
  }
  
  if (email) {
    this.customerContact.email = email;
  }
  
  if (phone) {
    this.customerContact.phone = phone;
  }
  
  return this.save();
};

module.exports = mongoose.model('Complaint', complaintSchema);