const Complaint = require('../models/Complaint');
const Conversation = require('../models/Conversation');

/**
 * GET /api/complaints - List complaints with pagination
 */
const getComplaints = async (req, res) => {
    try {
      const {
        page = 1,
        limit = 10,
        status,
        priority,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        search
      } = req.query;

      // Build filter object
      const filter = {};
      
      if (status && ['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
        filter.status = status;
      }
      
      if (priority && ['low', 'medium', 'high', 'urgent'].includes(priority)) {
        filter.priority = priority;
      }

      // Text search across multiple fields
      if (search && search.trim()) {
        filter.$text = { $search: search.trim() };
      }

      // Calculate pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const sortDirection = sortOrder === 'asc' ? 1 : -1;
      const sortObject = { [sortBy]: sortDirection };

      // Execute query with pagination
      const [complaints, totalCount] = await Promise.all([
        Complaint.find(filter)
          .populate('conversationId', 'sessionId messageCount')
          .sort(sortObject)
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Complaint.countDocuments(filter)
      ]);

      // Calculate pagination info
      const totalPages = Math.ceil(totalCount / parseInt(limit));
      const hasNextPage = parseInt(page) < totalPages;
      const hasPrevPage = parseInt(page) > 1;

      res.json({
        success: true,
        data: {
          complaints,
          pagination: {
            currentPage: parseInt(page),
            totalPages,
            totalCount,
            limit: parseInt(limit),
            hasNextPage,
            hasPrevPage
          }
        },
        message: `Retrieved ${complaints.length} complaints`
      });

    } catch (error) {
      console.error('Error in getComplaints:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Lỗi khi lấy danh sách khiếu nại',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        }
      });
    }
};

/**
 * GET /api/complaints/:id - Get complaint details
 */
const getComplaintById = async (req, res) => {
    try {
      const { id } = req.params;

      const complaint = await Complaint.findById(id)
        .populate('conversationId', 'sessionId messages messageCount createdAt')
        .lean();

      if (!complaint) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Không tìm thấy khiếu nại',
            code: 'COMPLAINT_NOT_FOUND'
          }
        });
      }

      res.json({
        success: true,
        data: complaint,
        message: 'Lấy thông tin khiếu nại thành công'
      });

    } catch (error) {
      console.error('Error in getComplaintById:', error);
      
      if (error.name === 'CastError') {
        return res.status(400).json({
          success: false,
          error: {
            message: 'ID khiếu nại không hợp lệ',
            code: 'INVALID_COMPLAINT_ID'
          }
        });
      }

      res.status(500).json({
        success: false,
        error: {
          message: 'Lỗi khi lấy thông tin khiếu nại',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        }
      });
    }
};

/**
 * PUT /api/complaints/:id - Update complaint status
 */
const updateComplaint = async (req, res) => {
    try {
      const { id } = req.params;
      const {
        status,
        priority,
        assignedTo,
        resolutionNotes,
        tags
      } = req.body;

      const complaint = await Complaint.findById(id);
      
      if (!complaint) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Không tìm thấy khiếu nại',
            code: 'COMPLAINT_NOT_FOUND'
          }
        });
      }

      // Track what fields are being updated
      const updates = {};
      
      if (status && ['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
        updates.status = status;
      }
      
      if (priority && ['low', 'medium', 'high', 'urgent'].includes(priority)) {
        updates.priority = priority;
      }
      
      if (assignedTo !== undefined) {
        updates.assignedTo = assignedTo;
      }
      
      if (resolutionNotes !== undefined) {
        updates.resolutionNotes = resolutionNotes;
      }
      
      if (Array.isArray(tags)) {
        updates.tags = tags;
      }

      // Apply updates
      Object.assign(complaint, updates);
      
      // Auto-resolve timestamp handling is done in pre-save middleware
      const updatedComplaint = await complaint.save();

      res.json({
        success: true,
        data: updatedComplaint,
        message: 'Cập nhật khiếu nại thành công'
      });

    } catch (error) {
      console.error('Error in updateComplaint:', error);
      
      if (error.name === 'CastError') {
        return res.status(400).json({
          success: false,
          error: {
            message: 'ID khiếu nại không hợp lệ',
            code: 'INVALID_COMPLAINT_ID'
          }
        });
      }

      if (error.name === 'ValidationError') {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Dữ liệu cập nhật không hợp lệ',
            details: Object.values(error.errors).map(err => err.message)
          }
        });
      }

      res.status(500).json({
        success: false,
        error: {
          message: 'Lỗi khi cập nhật khiếu nại',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        }
      });
    }
};

/**
 * PUT /api/complaints/:id/resolve - Quick resolve complaint
 */
const resolveComplaint = async (req, res) => {
    try {
      const { id } = req.params;
      const { resolutionNotes } = req.body;

      const complaint = await Complaint.findById(id);
      
      if (!complaint) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Không tìm thấy khiếu nại',
            code: 'COMPLAINT_NOT_FOUND'
          }
        });
      }

      // Use the instance method to resolve
      await complaint.resolve(resolutionNotes);

      res.json({
        success: true,
        data: complaint,
        message: 'Giải quyết khiếu nại thành công'
      });

    } catch (error) {
      console.error('Error in resolveComplaint:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Lỗi khi giải quyết khiếu nại',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        }
      });
    }
};

/**
 * PUT /api/complaints/:id/escalate - Escalate complaint
 */
const escalateComplaint = async (req, res) => {
    try {
      const { id } = req.params;

      const complaint = await Complaint.findById(id);
      
      if (!complaint) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Không tìm thấy khiếu nại',
            code: 'COMPLAINT_NOT_FOUND'
          }
        });
      }

      // Use the instance method to escalate
      await complaint.escalate();

      res.json({
        success: true,
        data: complaint,
        message: 'Escalate khiếu nại thành công'
      });

    } catch (error) {
      console.error('Error in escalateComplaint:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Lỗi khi escalate khiếu nại',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        }
      });
    }
};

/**
 * GET /api/complaints/stats - Complaint statistics
 */
const getComplaintStats = async (req, res) => {
    try {
      const { timeRange = '30d' } = req.query;
      
      // Calculate date range
      let startDate = new Date();
      switch (timeRange) {
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(startDate.getDate() - 90);
          break;
        default:
          startDate.setDate(startDate.getDate() - 30);
      }

      // Basic statistics
      const [basicStats, timeRangeStats, priorityStats, statusDistribution] = await Promise.all([
        // Overall stats
        Complaint.getStats(),
        
        // Time range stats
        Complaint.aggregate([
          {
            $match: {
              createdAt: { $gte: startDate }
            }
          },
          {
            $group: {
              _id: null,
              totalInTimeRange: { $sum: 1 },
              resolvedInTimeRange: {
                $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] }
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
        ]),
        
        // Priority distribution
        Complaint.aggregate([
          {
            $group: {
              _id: '$priority',
              count: { $sum: 1 }
            }
          }
        ]),
        
        // Status distribution over time
        Complaint.aggregate([
          {
            $match: {
              createdAt: { $gte: startDate }
            }
          },
          {
            $group: {
              _id: {
                status: '$status',
                date: {
                  $dateToString: {
                    format: '%Y-%m-%d',
                    date: '$createdAt'
                  }
                }
              },
              count: { $sum: 1 }
            }
          },
          {
            $sort: { '_id.date': 1 }
          }
        ])
      ]);

      // Process priority stats
      const priorityMap = {};
      priorityStats.forEach(item => {
        priorityMap[item._id] = item.count;
      });

      // Calculate resolution rate
      const timeRangeData = timeRangeStats[0] || { totalInTimeRange: 0, resolvedInTimeRange: 0, avgResolutionTime: null };
      const resolutionRate = timeRangeData.totalInTimeRange > 0 
        ? (timeRangeData.resolvedInTimeRange / timeRangeData.totalInTimeRange * 100).toFixed(2)
        : 0;

      res.json({
        success: true,
        data: {
          overall: basicStats,
          timeRange: {
            period: timeRange,
            totalComplaints: timeRangeData.totalInTimeRange,
            resolvedComplaints: timeRangeData.resolvedInTimeRange,
            resolutionRate: parseFloat(resolutionRate),
            avgResolutionTimeHours: timeRangeData.avgResolutionTime 
              ? Math.round(timeRangeData.avgResolutionTime / (1000 * 60 * 60) * 100) / 100
              : null
          },
          priorityDistribution: {
            urgent: priorityMap.urgent || 0,
            high: priorityMap.high || 0,
            medium: priorityMap.medium || 0,
            low: priorityMap.low || 0
          },
          statusTrend: statusDistribution
        },
        message: 'Lấy thống kê khiếu nại thành công'
      });

    } catch (error) {
      console.error('Error in getComplaintStats:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Lỗi khi lấy thống kê khiếu nại',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        }
      });
    }
};

/**
 * GET /api/complaints/search - Advanced search complaints
 */
const searchComplaints = async (req, res) => {
    try {
      const {
        q, // search query
        status,
        priority,
        dateFrom,
        dateTo,
        hasContact,
        page = 1,
        limit = 10
      } = req.query;

      // Build advanced filter
      const filter = {};
      
      // Text search
      if (q && q.trim()) {
        filter.$text = { $search: q.trim() };
      }
      
      // Status filter
      if (status) {
        if (Array.isArray(status)) {
          filter.status = { $in: status };
        } else {
          filter.status = status;
        }
      }
      
      // Priority filter
      if (priority) {
        if (Array.isArray(priority)) {
          filter.priority = { $in: priority };
        } else {
          filter.priority = priority;
        }
      }
      
      // Date range filter
      if (dateFrom || dateTo) {
        filter.createdAt = {};
        if (dateFrom) {
          filter.createdAt.$gte = new Date(dateFrom);
        }
        if (dateTo) {
          filter.createdAt.$lte = new Date(dateTo);
        }
      }
      
      // Contact information filter
      if (hasContact === 'true') {
        filter.$or = [
          { 'customerContact.email': { $exists: true, $ne: null, $ne: '' } },
          { 'customerContact.phone': { $exists: true, $ne: null, $ne: '' } }
        ];
      } else if (hasContact === 'false') {
        filter.$and = [
          { $or: [
            { 'customerContact.email': { $exists: false } },
            { 'customerContact.email': null },
            { 'customerContact.email': '' }
          ]},
          { $or: [
            { 'customerContact.phone': { $exists: false } },
            { 'customerContact.phone': null },
            { 'customerContact.phone': '' }
          ]}
        ];
      }

      // Execute search
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const [complaints, totalCount] = await Promise.all([
        Complaint.find(filter)
          .populate('conversationId', 'sessionId messageCount')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Complaint.countDocuments(filter)
      ]);

      res.json({
        success: true,
        data: {
          complaints,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalCount / parseInt(limit)),
            totalCount,
            limit: parseInt(limit)
          },
          searchCriteria: {
            query: q,
            status,
            priority,
            dateFrom,
            dateTo,
            hasContact
          }
        },
        message: `Tìm thấy ${totalCount} khiếu nại`
      });

    } catch (error) {
      console.error('Error in searchComplaints:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Lỗi khi tìm kiếm khiếu nại',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        }
      });
    }
};

/**
 * DELETE /api/complaints/:id - Delete complaint (admin only)
 */
const deleteComplaint = async (req, res) => {
    try {
      const { id } = req.params;

      const complaint = await Complaint.findByIdAndDelete(id);
      
      if (!complaint) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Không tìm thấy khiếu nại',
            code: 'COMPLAINT_NOT_FOUND'
          }
        });
      }

      res.json({
        success: true,
        message: 'Xóa khiếu nại thành công',
        data: { deletedId: id }
      });

    } catch (error) {
      console.error('Error in deleteComplaint:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Lỗi khi xóa khiếu nại',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        }
      });
    }
};

module.exports = {
  getComplaints,
  getComplaintById,
  updateComplaint,
  resolveComplaint,
  escalateComplaint,
  getComplaintStats,
  searchComplaints,
  deleteComplaint
};