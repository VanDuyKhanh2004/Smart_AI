const express = require('express');
const router = express.Router();
const { 
  register, 
  login, 
  logout, 
  refreshToken, 
  getMe,
  googleLogin,
  verifyEmail,
  resendVerification
} = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware');

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/google-login', googleLogin);
router.post('/refresh', refreshToken);
router.get('/verify-email', verifyEmail);
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerification);

// Protected routes
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);

module.exports = router;
