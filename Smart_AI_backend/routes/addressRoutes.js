const express = require('express');
const router = express.Router();
const {
  getAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress
} = require('../controllers/addressController');
const { protect } = require('../middlewares/authMiddleware');
const errorResponseFormat = require('../middlewares/errorResponseFormat');

// All address routes require authentication
router.use(protect);
router.use(errorResponseFormat('legacy-top-level-message'));

// GET /api/addresses - Get all addresses for current user
// Requirements: 1.2
router.get('/', getAddresses);

// POST /api/addresses - Create new address
// Requirements: 1.2
router.post('/', createAddress);

// PUT /api/addresses/:id - Update address
// Requirements: 3.2
router.put('/:id', updateAddress);

// DELETE /api/addresses/:id - Delete address
// Requirements: 4.2
router.delete('/:id', deleteAddress);

// PUT /api/addresses/:id/default - Set address as default
// Requirements: 5.1
router.put('/:id/default', setDefaultAddress);

module.exports = router;
