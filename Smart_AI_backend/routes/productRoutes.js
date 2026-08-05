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
const { semanticSearchLimiter } = require('../middlewares/rateLimiters');
const { uploadProductImage } = require('../middlewares/uploadMiddleware');

// Public routes
router.get('/', getAllProducts);
router.get('/search/semantic', semanticSearchLimiter, searchSemantic);
router.get('/meta', getProductMeta);
router.get('/:id/recommendations', getRecommendations);
router.get('/:id', getProductById);

// Admin protected routes
router.post('/', protect, adminMiddleware, uploadProductImage, createProduct);
router.put('/:id', protect, adminMiddleware, uploadProductImage, updateProduct);
router.delete('/:id', protect, adminMiddleware, deleteProduct);

module.exports = router;