const express = require('express');
const router = express.Router();
const { 
  register, 
  login, 
  logout, 
  refreshToken, 
  getMe,
  googleLogin,
  linkGoogle,
  unlinkGoogle,
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
const {
  authSessionLimiter,
  emailActionLimiter,
  tokenActionLimiter,
} = require('../middlewares/rateLimiters');

// Public routes
router.post('/register', register);
router.post('/login', loginRateLimit, login);
router.post('/google-login', authSessionLimiter, googleLogin);
// Link/unlink Google to/from authenticated account
router.post('/link/google', protect, linkGoogle);
router.delete('/unlink/google', protect, unlinkGoogle);
router.post('/refresh', authSessionLimiter, refreshToken);
router.get('/verify-email', authSessionLimiter, verifyEmail);
router.post('/verify-email', authSessionLimiter, verifyEmail);
router.post('/resend-verification', emailActionLimiter, resendVerification);
router.post('/forgot-password', emailActionLimiter, requestPasswordReset);
router.post('/reset-password', tokenActionLimiter, resetPassword);
router.post('/request-unlock', emailActionLimiter, requestUnlockAccount);
router.post('/unlock-account', tokenActionLimiter, unlockAccount);

// Protected routes
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);
router.post('/admin-unlock', protect, adminUnlockAccount);

module.exports = router;
