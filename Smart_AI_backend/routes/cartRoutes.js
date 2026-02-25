const express = require('express');
const router = express.Router();
const {
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
  mergeCart
} = require('../controllers/cartController');
const { protect } = require('../middlewares/authMiddleware');

// All cart routes require authentication
router.use(protect);

// GET /api/cart - Get user's cart
router.get('/', getCart);

// POST /api/cart/items - Add item to cart
router.post('/items', addItem);

// PUT /api/cart/items/:itemId - Update item quantity
router.put('/items/:itemId', updateItem);

// DELETE /api/cart/items/:itemId - Remove item from cart
router.delete('/items/:itemId', removeItem);

// DELETE /api/cart - Clear entire cart
router.delete('/', clearCart);

// POST /api/cart/merge - Merge guest cart on login
router.post('/merge', mergeCart);

module.exports = router;
