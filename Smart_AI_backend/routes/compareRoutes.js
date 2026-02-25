const express = require('express');
const router = express.Router();
const {
  saveComparison,
  getCompareHistory,
  deleteComparison,
  getCompareProducts
} = require('../controllers/compareController');
const { protect } = require('../middlewares/authMiddleware');

// GET /api/compare/products - Get products for comparison (public)
// Requirements: 3.2, 6.3
router.get('/products', getCompareProducts);

// Protected routes - require authentication
// POST /api/compare/history - Save comparison to history
// Requirements: 5.1, 5.2
router.post('/history', protect, saveComparison);

// GET /api/compare/history - Get user's comparison history
// Requirements: 5.3, 5.4
router.get('/history', protect, getCompareHistory);

// DELETE /api/compare/history/:id - Delete comparison from history
// Requirements: 5.6
router.delete('/history/:id', protect, deleteComparison);

module.exports = router;
