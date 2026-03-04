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
  resendVerification,
  requestPasswordReset,
  resetPassword,
  requestUnlockAccount,
  unlockAccount,
  adminUnlockAccount
} = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware');
const { loginRateLimit } = require('../middlewares/loginRateLimitMiddleware');

// Public routes
router.post('/register', register);
router.post('/login', loginRateLimit, login);
router.post('/google-login', googleLogin);
router.post('/refresh', refreshToken);
router.get('/verify-email', verifyEmail);
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerification);
router.post('/forgot-password', requestPasswordReset);
router.post('/reset-password', resetPassword);
router.post('/request-unlock', requestUnlockAccount);
router.post('/unlock-account', unlockAccount);

// Protected routes
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);
router.post('/admin-unlock', protect, adminUnlockAccount);

module.exports = router;
