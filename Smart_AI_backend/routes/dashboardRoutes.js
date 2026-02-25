const express = require('express');
const router = express.Router();
const {
  getRevenueStats,
  getTopSellingProducts,
  getOrderTrends,
  getUserStats,
  getDashboardSummary
} = require('../controllers/dashboardController');
const { protect } = require('../middlewares/authMiddleware');
const { adminMiddleware } = require('../middlewares/adminMiddleware');

// All dashboard routes require authentication and admin role
router.use(protect);
router.use(adminMiddleware);

// GET /api/dashboard/revenue - Get revenue statistics (Requirements: 3.1, 3.2, 3.3, 3.4, 3.5)
router.get('/revenue', getRevenueStats);

// GET /api/dashboard/top-products - Get top selling products (Requirements: 4.1, 4.2, 4.3)
router.get('/top-products', getTopSellingProducts);

// GET /api/dashboard/order-trends - Get order trends (Requirements: 5.1, 5.2, 5.3, 5.4)
router.get('/order-trends', getOrderTrends);

// GET /api/dashboard/user-stats - Get user registration stats (Requirements: 6.1, 6.2, 6.3, 6.4)
router.get('/user-stats', getUserStats);

// GET /api/dashboard/summary - Get dashboard summary (Requirements: 7.1, 7.2)
router.get('/summary', getDashboardSummary);

module.exports = router;
