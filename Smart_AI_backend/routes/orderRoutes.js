const express = require('express');
const router = express.Router();
const {
  createOrder,
  getUserOrders,
  getOrderById,
  getAllOrders,
  getOrderStats,
  updateOrderStatus,
  cancelOrder
} = require('../controllers/orderController');
const { protect } = require('../middlewares/authMiddleware');
const { adminMiddleware } = require('../middlewares/adminMiddleware');

// All order routes require authentication
router.use(protect);

// Admin routes (must be defined before :id routes to avoid conflicts)
// GET /api/orders/admin/all - Get all orders (admin)
router.get('/admin/all', adminMiddleware, getAllOrders);

// GET /api/orders/admin/stats - Get order statistics (admin)
router.get('/admin/stats', adminMiddleware, getOrderStats);

// User routes
// POST /api/orders - Create new order
router.post('/', createOrder);

// GET /api/orders - Get user's orders
router.get('/', getUserOrders);

// GET /api/orders/:id - Get order details
router.get('/:id', getOrderById);

// POST /api/orders/:id/cancel - Cancel order (user, owner only)
router.post('/:id/cancel', cancelOrder);

// Admin route for status update
// PATCH /api/orders/:id/status - Update order status (admin)
router.patch('/:id/status', adminMiddleware, updateOrderStatus);

module.exports = router;
