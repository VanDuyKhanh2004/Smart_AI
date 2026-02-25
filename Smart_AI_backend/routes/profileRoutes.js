const express = require('express');
const router = express.Router();
const {
  getProfile,
  updateProfile,
  uploadAvatar,
  changePassword
} = require('../controllers/profileController');
const { protect } = require('../middlewares/authMiddleware');
const uploadMiddleware = require('../middlewares/uploadMiddleware');

// All profile routes require authentication
router.use(protect);

// GET /api/profile - Get current user profile
// Requirements: 1.1, 1.2, 1.3
router.get('/', getProfile);

// PUT /api/profile - Update profile information (name, phone)
// Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
router.put('/', updateProfile);

// POST /api/profile/avatar - Upload avatar
// Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
router.post('/avatar', uploadMiddleware, uploadAvatar);

// PUT /api/profile/password - Change password
// Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
router.put('/password', changePassword);

module.exports = router;
