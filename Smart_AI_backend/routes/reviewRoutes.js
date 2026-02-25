const express = require('express');
const router = express.Router();
const {
  createReview,
  getProductReviews,
  canReviewProduct,
  updateReview,
  deleteReview,
  getAllReviews,
  updateReviewStatus
} = require('../controllers/reviewController');
const { protect } = require('../middlewares/authMiddleware');
const { adminMiddleware } = require('../middlewares/adminMiddleware');

// Public routes
// GET /api/reviews/product/:id - Get product reviews (public)
router.get('/product/:id', getProductReviews);

// Protected routes (auth required)
// POST /api/reviews - Create review
router.post('/', protect, createReview);

// GET /api/reviews/can-review/:productId - Check can review
router.get('/can-review/:productId', protect, canReviewProduct);

// PUT /api/reviews/:id - Update review
router.put('/:id', protect, updateReview);

// DELETE /api/reviews/:id - Delete review
router.delete('/:id', protect, deleteReview);

// Admin routes
// GET /api/reviews/admin - Get all reviews (admin)
router.get('/admin', protect, adminMiddleware, getAllReviews);

// PUT /api/reviews/admin/:id/status - Update status (admin)
router.put('/admin/:id/status', protect, adminMiddleware, updateReviewStatus);

module.exports = router;
