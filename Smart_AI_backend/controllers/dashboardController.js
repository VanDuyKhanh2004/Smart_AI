const Order = require('../models/Order');
const User = require('../models/User');

/**
 * Get date range based on period type
 * @param {string} period - 'daily' | 'weekly' | 'monthly'
 * @returns {Object} - { startDate, endDate, previousStartDate, previousEndDate, dateFormat, groupFormat }
 */
const getDateRange = (period) => {
  const now = new Date();
  let startDate, previousStartDate, dateFormat, groupFormat;

  switch (period) {
    case 'daily':
      // Last 30 days
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
      previousStartDate = new Date(startDate);
      previousStartDate.setDate(previousStartDate.getDate() - 30);
      dateFormat = '%Y-%m-%d';
      groupFormat = { $dateToString: { format: '%Y-%m-%d', date: '$deliveredAt' } };
      break;

    case 'weekly':
      // Last 12 weeks
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 84); // 12 weeks * 7 days
      startDate.setHours(0, 0, 0, 0);
      previousStartDate = new Date(startDate);
      previousStartDate.setDate(previousStartDate.getDate() - 84);
      dateFormat = '%Y-W%V';
      groupFormat = {
        $concat: [
          { $toString: { $isoWeekYear: '$deliveredAt' } },
          '-W',
          { $toString: { $isoWeek: '$deliveredAt' } }
        ]
      };
      break;

    case 'monthly':
    default:
      // Last 12 months
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 12);
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      previousStartDate = new Date(startDate);
      previousStartDate.setMonth(previousStartDate.getMonth() - 12);
      dateFormat = '%Y-%m';
      groupFormat = { $dateToString: { format: '%Y-%m', date: '$deliveredAt' } };
      break;
  }

  return {
    startDate,
    endDate: now,
    previousStartDate,
    previousEndDate: startDate,
    dateFormat,
    groupFormat
  };
};

/**
 * Get date range for order trends (uses createdAt instead of deliveredAt)
 */
const getOrderTrendsDateRange = (period) => {
  const now = new Date();
  let startDate, dateFormat, groupFormat;

  switch (period) {
    case 'daily':
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
      dateFormat = '%Y-%m-%d';
      groupFormat = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
      break;

    case 'weekly':
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 84);
      startDate.setHours(0, 0, 0, 0);
      dateFormat = '%Y-W%V';
      groupFormat = {
        $concat: [
          { $toString: { $isoWeekYear: '$createdAt' } },
          '-W',
          { $toString: { $isoWeek: '$createdAt' } }
        ]
      };
      break;

    case 'monthly':
    default:
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 12);
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      dateFormat = '%Y-%m';
      groupFormat = { $dateToString: { format: '%Y-%m', date: '$createdAt' } };
      break;
  }

  return { startDate, endDate: now, dateFormat, groupFormat };
};

/**
 * Get revenue statistics
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 * @param period - 'daily' | 'weekly' | 'monthly'
 */
const getRevenueStats = async (req, res) => {
  try {
    const period = req.query.period || 'monthly';
    const validPeriods = ['daily', 'weekly', 'monthly'];

    if (!validPeriods.includes(period)) {
      return res.status(400).json({
        success: false,
        message: 'Period không hợp lệ. Chọn: daily, weekly, monthly',
        code: 'INVALID_PERIOD'
      });
    }

    const { startDate, endDate, groupFormat } = getDateRange(period);

    // Aggregate delivered orders by period (Requirement 3.5 - only count delivered orders)
    const revenueData = await Order.aggregate([
      {
        $match: {
          status: 'delivered',
          deliveredAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: groupFormat,
          revenue: { $sum: '$total' },
          orderCount: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      },
      {
        $project: {
          _id: 0,
          period: '$_id',
          revenue: 1,
          orderCount: 1
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: revenueData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy thống kê doanh thu',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


/**
 * Get top selling products
 * Requirements: 4.1, 4.2, 4.3
 * @param limit - number of products (default 10)
 */
const getTopSellingProducts = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    // Aggregate order items from delivered orders (Requirement 4.3)
    const topProducts = await Order.aggregate([
      {
        $match: { status: 'delivered' }
      },
      {
        $unwind: '$items'
      },
      {
        $group: {
          _id: '$items.product',
          totalQuantity: { $sum: '$items.quantity' },
          totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
        }
      },
      {
        $sort: { totalQuantity: -1 }
      },
      {
        $limit: limit
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      {
        $unwind: '$product'
      },
      {
        $project: {
          _id: 0,
          product: {
            _id: '$product._id',
            name: '$product.name',
            image: '$product.image',
            price: '$product.price'
          },
          totalQuantity: 1,
          totalRevenue: 1
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: topProducts
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy top sản phẩm bán chạy',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get order trends
 * Requirements: 5.1, 5.2, 5.3, 5.4
 * @param period - 'daily' | 'weekly' | 'monthly'
 */
const getOrderTrends = async (req, res) => {
  try {
    const period = req.query.period || 'monthly';
    const validPeriods = ['daily', 'weekly', 'monthly'];

    if (!validPeriods.includes(period)) {
      return res.status(400).json({
        success: false,
        message: 'Period không hợp lệ. Chọn: daily, weekly, monthly',
        code: 'INVALID_PERIOD'
      });
    }

    const { startDate, endDate, groupFormat } = getOrderTrendsDateRange(period);

    // Aggregate orders by status and period
    const trendsData = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            period: groupFormat,
            status: '$status'
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.period',
          statuses: {
            $push: {
              status: '$_id.status',
              count: '$count'
            }
          }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Transform to flat structure with all statuses
    const result = trendsData.map(item => {
      const statusCounts = {
        period: item._id,
        pending: 0,
        confirmed: 0,
        processing: 0,
        shipping: 0,
        delivered: 0,
        cancelled: 0
      };

      item.statuses.forEach(s => {
        if (statusCounts.hasOwnProperty(s.status)) {
          statusCounts[s.status] = s.count;
        }
      });

      return statusCounts;
    });

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy xu hướng đơn hàng',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


/**
 * Get user registration stats
 * Requirements: 6.1, 6.2, 6.3, 6.4
 * @param period - 'daily' | 'weekly' | 'monthly'
 */
const getUserStats = async (req, res) => {
  try {
    const period = req.query.period || 'monthly';
    const validPeriods = ['daily', 'weekly', 'monthly'];

    if (!validPeriods.includes(period)) {
      return res.status(400).json({
        success: false,
        message: 'Period không hợp lệ. Chọn: daily, weekly, monthly',
        code: 'INVALID_PERIOD'
      });
    }

    // Get date range for user stats
    const now = new Date();
    let startDate, groupFormat;

    switch (period) {
      case 'daily':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);
        groupFormat = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
        break;

      case 'weekly':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 84);
        startDate.setHours(0, 0, 0, 0);
        groupFormat = {
          $concat: [
            { $toString: { $isoWeekYear: '$createdAt' } },
            '-W',
            { $toString: { $isoWeek: '$createdAt' } }
          ]
        };
        break;

      case 'monthly':
      default:
        startDate = new Date(now);
        startDate.setMonth(startDate.getMonth() - 12);
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        groupFormat = { $dateToString: { format: '%Y-%m', date: '$createdAt' } };
        break;
    }

    // Get total users count (Requirement 6.1)
    const totalUsers = await User.countDocuments();

    // Aggregate new registrations by period (Requirement 6.2, 6.3)
    const newUsersData = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: now }
        }
      },
      {
        $group: {
          _id: groupFormat,
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      },
      {
        $project: {
          _id: 0,
          period: '$_id',
          count: 1
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        total: totalUsers,
        newUsers: newUsersData
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy thống kê người dùng',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get dashboard summary
 * Requirements: 7.1, 7.2
 */
const getDashboardSummary = async (req, res) => {
  try {
    const now = new Date();
    
    // Current period: last 30 days
    const currentPeriodStart = new Date(now);
    currentPeriodStart.setDate(currentPeriodStart.getDate() - 30);
    currentPeriodStart.setHours(0, 0, 0, 0);

    // Previous period: 30 days before current period
    const previousPeriodStart = new Date(currentPeriodStart);
    previousPeriodStart.setDate(previousPeriodStart.getDate() - 30);
    const previousPeriodEnd = new Date(currentPeriodStart);
    previousPeriodEnd.setMilliseconds(previousPeriodEnd.getMilliseconds() - 1);

    // Calculate current period metrics
    const [
      currentRevenue,
      previousRevenue,
      currentOrders,
      previousOrders,
      totalUsers,
      currentNewUsers,
      previousNewUsers,
      pendingOrders
    ] = await Promise.all([
      // Current revenue (delivered orders only)
      Order.aggregate([
        {
          $match: {
            status: 'delivered',
            deliveredAt: { $gte: currentPeriodStart, $lte: now }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$total' }
          }
        }
      ]),
      // Previous revenue
      Order.aggregate([
        {
          $match: {
            status: 'delivered',
            deliveredAt: { $gte: previousPeriodStart, $lte: previousPeriodEnd }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$total' }
          }
        }
      ]),
      // Current orders count
      Order.countDocuments({
        createdAt: { $gte: currentPeriodStart, $lte: now }
      }),
      // Previous orders count
      Order.countDocuments({
        createdAt: { $gte: previousPeriodStart, $lte: previousPeriodEnd }
      }),
      // Total users
      User.countDocuments(),
      // Current new users
      User.countDocuments({
        createdAt: { $gte: currentPeriodStart, $lte: now }
      }),
      // Previous new users
      User.countDocuments({
        createdAt: { $gte: previousPeriodStart, $lte: previousPeriodEnd }
      }),
      // Pending orders
      Order.countDocuments({ status: 'pending' })
    ]);

    // Extract values
    const currentRevenueValue = currentRevenue[0]?.total || 0;
    const previousRevenueValue = previousRevenue[0]?.total || 0;

    // Calculate percentage changes (Requirement 7.2)
    const calculateChange = (current, previous) => {
      if (previous === 0) {
        return current > 0 ? 100 : 0;
      }
      return ((current - previous) / previous) * 100;
    };

    const revenueChange = calculateChange(currentRevenueValue, previousRevenueValue);
    const ordersChange = calculateChange(currentOrders, previousOrders);
    const usersChange = calculateChange(currentNewUsers, previousNewUsers);

    res.status(200).json({
      success: true,
      data: {
        totalRevenue: currentRevenueValue,
        totalOrders: currentOrders,
        totalUsers,
        pendingOrders,
        revenueChange: Math.round(revenueChange * 100) / 100,
        ordersChange: Math.round(ordersChange * 100) / 100,
        usersChange: Math.round(usersChange * 100) / 100
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy tổng quan dashboard',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  getRevenueStats,
  getTopSellingProducts,
  getOrderTrends,
  getUserStats,
  getDashboardSummary
};
