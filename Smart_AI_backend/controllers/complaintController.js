const Complaint = require('../models/Complaint');
const Conversation = require('../models/Conversation');
const asyncHandler = require('../utils/asyncHandler');
const { BadRequestError, NotFoundError } = require('../utils/errors');

const getComplaints = async (req, res) => {
  const {
    page = 1,
    limit = 10,
    status,
    priority,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    search
  } = req.query;

  const filter = {};

  if (status && ['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
    filter.status = status;
  }

  if (priority && ['low', 'medium', 'high', 'urgent'].includes(priority)) {
    filter.priority = priority;
  }

  if (search && search.trim()) {
    filter.$text = { $search: search.trim() };
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const sortDirection = sortOrder === 'asc' ? 1 : -1;
  const sortObject = { [sortBy]: sortDirection };

  const [complaints, totalCount] = await Promise.all([
    Complaint.find(filter)
      .populate('conversationId', 'sessionId messageCount')
      .sort(sortObject)
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Complaint.countDocuments(filter)
  ]);

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
};

const getComplaintById = async (req, res) => {
  const { id } = req.params;

  const complaint = await Complaint.findById(id)
    .populate('conversationId', 'sessionId messages messageCount createdAt')
    .lean();

  if (!complaint) {
    throw new NotFoundError('Không tìm thấy khiếu nại', 'COMPLAINT_NOT_FOUND');
  }

  res.json({
    success: true,
    data: complaint,
    message: 'Lấy thông tin khiếu nại thành công'
  });
};

const updateComplaint = async (req, res) => {
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
    throw new NotFoundError('Không tìm thấy khiếu nại', 'COMPLAINT_NOT_FOUND');
  }

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

  Object.assign(complaint, updates);

  const updatedComplaint = await complaint.save();

  res.json({
    success: true,
    data: updatedComplaint,
    message: 'Cập nhật khiếu nại thành công'
  });
};

const resolveComplaint = async (req, res) => {
  const { id } = req.params;
  const { resolutionNotes } = req.body;

  const complaint = await Complaint.findById(id);

  if (!complaint) {
    throw new NotFoundError('Không tìm thấy khiếu nại', 'COMPLAINT_NOT_FOUND');
  }

  await complaint.resolve(resolutionNotes);

  res.json({
    success: true,
    data: complaint,
    message: 'Giải quyết khiếu nại thành công'
  });
};

const escalateComplaint = async (req, res) => {
  const { id } = req.params;

  const complaint = await Complaint.findById(id);

  if (!complaint) {
    throw new NotFoundError('Không tìm thấy khiếu nại', 'COMPLAINT_NOT_FOUND');
  }

  await complaint.escalate();

  res.json({
    success: true,
    data: complaint,
    message: 'Escalate khiếu nại thành công'
  });
};

const getComplaintStats = async (req, res) => {
  const { timeRange = '30d' } = req.query;

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

  const [basicStats, timeRangeStats, priorityStats, statusDistribution] = await Promise.all([
    Complaint.getStats(),

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

    Complaint.aggregate([
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 }
        }
      }
    ]),

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

  const priorityMap = {};
  priorityStats.forEach(item => {
    priorityMap[item._id] = item.count;
  });

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
};

const searchComplaints = async (req, res) => {
  const {
    q,
    status,
    priority,
    dateFrom,
    dateTo,
    hasContact,
    page = 1,
    limit = 10
  } = req.query;

  const filter = {};

  if (q && q.trim()) {
    filter.$text = { $search: q.trim() };
  }

  if (status) {
    if (Array.isArray(status)) {
      filter.status = { $in: status };
    } else {
      filter.status = status;
    }
  }

  if (priority) {
    if (Array.isArray(priority)) {
      filter.priority = { $in: priority };
    } else {
      filter.priority = priority;
    }
  }

  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) {
      filter.createdAt.$gte = new Date(dateFrom);
    }
    if (dateTo) {
      filter.createdAt.$lte = new Date(dateTo);
    }
  }

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
};

const deleteComplaint = async (req, res) => {
  const { id } = req.params;

  const complaint = await Complaint.findByIdAndDelete(id);

  if (!complaint) {
    throw new NotFoundError('Không tìm thấy khiếu nại', 'COMPLAINT_NOT_FOUND');
  }

  res.json({
    success: true,
    message: 'Xóa khiếu nại thành công',
    data: { deletedId: id }
  });
};

module.exports = {
  getComplaints: asyncHandler(getComplaints),
  getComplaintById: asyncHandler(getComplaintById),
  updateComplaint: asyncHandler(updateComplaint),
  resolveComplaint: asyncHandler(resolveComplaint),
  escalateComplaint: asyncHandler(escalateComplaint),
  getComplaintStats: asyncHandler(getComplaintStats),
  searchComplaints: asyncHandler(searchComplaints),
  deleteComplaint: asyncHandler(deleteComplaint),
};
