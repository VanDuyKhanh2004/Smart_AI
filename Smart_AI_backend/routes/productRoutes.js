const express = require('express');
const router = express.Router();
const {
  createProduct,
  getAllProducts,
  getProductById,
  deleteProduct
} = require('../controllers/productController');
const { protect } = require('../middlewares/authMiddleware');
const { adminMiddleware } = require('../middlewares/adminMiddleware');

// Public routes
router.get('/', getAllProducts);
router.get('/:id', getProductById);

// Admin protected routes
router.post('/', protect, adminMiddleware, createProduct);
router.delete('/:id', protect, adminMiddleware, deleteProduct);

module.exports = router;