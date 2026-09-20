const express = require('express');
const router = express.Router();
const {
  getAllStores,
  getStoreById,
  createStore,
  updateStore,
  deleteStore,
  toggleStoreActive,
  getAllStoresAdmin
} = require('../controllers/storeController');
const { protect } = require('../middlewares/authMiddleware');
const { adminMiddleware } = require('../middlewares/adminMiddleware');
const { adminLimiter } = require('../middlewares/rateLimiters');
const errorResponseFormat = require('../middlewares/errorResponseFormat');

router.use(errorResponseFormat('legacy-top-level-message'));

// Admin protected routes (must come before /:id to avoid conflicts)
router.get('/admin/all', protect, adminMiddleware, adminLimiter, getAllStoresAdmin);

// Public routes
router.get('/', getAllStores);
router.get('/:id', getStoreById);
router.post('/', protect, adminMiddleware, adminLimiter, createStore);
router.put('/:id', protect, adminMiddleware, adminLimiter, updateStore);
router.delete('/:id', protect, adminMiddleware, adminLimiter, deleteStore);
router.patch('/:id/toggle', protect, adminMiddleware, adminLimiter, toggleStoreActive);

module.exports = router;
