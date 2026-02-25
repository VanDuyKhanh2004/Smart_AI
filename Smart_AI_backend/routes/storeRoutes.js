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

// Admin protected routes (must come before /:id to avoid conflicts)
router.get('/admin/all', protect, adminMiddleware, getAllStoresAdmin);

// Public routes
router.get('/', getAllStores);
router.get('/:id', getStoreById);
router.post('/', protect, adminMiddleware, createStore);
router.put('/:id', protect, adminMiddleware, updateStore);
router.delete('/:id', protect, adminMiddleware, deleteStore);
router.patch('/:id/toggle', protect, adminMiddleware, toggleStoreActive);

module.exports = router;
