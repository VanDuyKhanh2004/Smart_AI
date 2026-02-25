const express = require('express');
const router = express.Router();
const {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  checkWishlistStatus,
  checkMultipleWishlistStatus,
  clearWishlist
} = require('../controllers/wishlistController');
const { protect } = require('../middlewares/authMiddleware');

// All wishlist routes require authentication
// Requirements: 1.3 - Authentication required for wishlist operations
router.use(protect);

// GET /api/wishlist - Get user's wishlist
// Requirements: 3.1, 3.2, 4.1
router.get('/', getWishlist);

// POST /api/wishlist - Add product to wishlist
// Requirements: 1.1, 1.2, 4.2
router.post('/', addToWishlist);

// GET /api/wishlist/check/:productId - Check single product wishlist status
// Requirements: 7.1, 7.2
router.get('/check/:productId', checkWishlistStatus);

// POST /api/wishlist/check-multiple - Check multiple products wishlist status
// Requirements: 7.1
router.post('/check-multiple', checkMultipleWishlistStatus);

// DELETE /api/wishlist/:productId - Remove product from wishlist
// Requirements: 2.1, 2.2
router.delete('/:productId', removeFromWishlist);

// DELETE /api/wishlist - Clear entire wishlist
// Requirements: 2.1
router.delete('/', clearWishlist);

module.exports = router;
