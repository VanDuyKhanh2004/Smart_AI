const express = require('express');
const router = express.Router();
const {
  createProduct,
  getAllProducts,
  searchSemantic,
  getProductById,
  getRecommendations,
  updateProduct,
  deleteProduct
} = require('../controllers/productController');
const { protect } = require('../middlewares/authMiddleware');
const { adminMiddleware } = require('../middlewares/adminMiddleware');

// Public routes
router.get('/', getAllProducts);
router.get('/search/semantic', searchSemantic);
router.get('/:id/recommendations', getRecommendations);
router.get('/:id', getProductById);

// Admin protected routes
router.post('/', protect, adminMiddleware, createProduct);
router.put('/:id', protect, adminMiddleware, updateProduct);
router.delete('/:id', protect, adminMiddleware, deleteProduct);

module.exports = router;