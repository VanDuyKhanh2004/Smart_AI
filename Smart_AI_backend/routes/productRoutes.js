const express = require('express');
const router = express.Router();
const {
  createProduct,
  getAllProducts,
  getProductMeta,
  searchSemantic,
  getProductById,
  getRecommendations,
  updateProduct,
  deleteProduct
} = require('../controllers/productController');
const { protect } = require('../middlewares/authMiddleware');
const { adminMiddleware } = require('../middlewares/adminMiddleware');
const { semanticSearchLimiter, adminLimiter } = require('../middlewares/rateLimiters');
const { uploadProductImage } = require('../middlewares/uploadMiddleware');

// Public routes
router.get('/', getAllProducts);
router.get('/search/semantic', semanticSearchLimiter, searchSemantic);
router.get('/meta', getProductMeta);
router.get('/:id/recommendations', getRecommendations);
router.get('/:id', getProductById);

// Admin protected routes
router.post('/', protect, adminMiddleware, adminLimiter, uploadProductImage, createProduct);
router.put('/:id', protect, adminMiddleware, adminLimiter, uploadProductImage, updateProduct);
router.delete('/:id', protect, adminMiddleware, adminLimiter, deleteProduct);

module.exports = router;