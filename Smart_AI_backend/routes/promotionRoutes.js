const express = require('express');
const router = express.Router();
const {
  getPromotions,
  getPromotion,
  createPromotion,
  updatePromotion,
  deletePromotion,
  togglePromotionStatus,
  validatePromotion
} = require('../controllers/promotionController');
const { protect } = require('../middlewares/authMiddleware');
const { adminMiddleware } = require('../middlewares/adminMiddleware');

// User route (must be defined before admin routes with :id to avoid conflicts)
// POST /api/promotions/validate - Validate promotion code and calculate discount
router.post('/validate', protect, validatePromotion);

// Admin routes - all require authentication and admin role
// GET /api/promotions - Get all promotions with pagination
router.get('/', protect, adminMiddleware, getPromotions);

// POST /api/promotions - Create new promotion
router.post('/', protect, adminMiddleware, createPromotion);

// GET /api/promotions/:id - Get promotion by ID
router.get('/:id', protect, adminMiddleware, getPromotion);

// PUT /api/promotions/:id - Update promotion
router.put('/:id', protect, adminMiddleware, updatePromotion);

// DELETE /api/promotions/:id - Delete promotion
router.delete('/:id', protect, adminMiddleware, deletePromotion);

// PATCH /api/promotions/:id/toggle - Toggle promotion active status
router.patch('/:id/toggle', protect, adminMiddleware, togglePromotionStatus);

module.exports = router;
