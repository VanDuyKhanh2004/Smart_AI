const express = require('express');
const router = express.Router();
const {
  createQuestion,
  getProductQuestions,
  toggleUpvote,
  deleteQuestion,
  getAllQuestions,
  updateQuestionStatus
} = require('../controllers/questionController');
const {
  createAnswer,
  deleteAnswer
} = require('../controllers/answerController');
const { protect, optionalAuth } = require('../middlewares/authMiddleware');
const { adminMiddleware } = require('../middlewares/adminMiddleware');

// ============================================
// Question Routes
// ============================================

// Public routes
// GET /api/questions/product/:productId - Get product questions (public, with optional auth for hasUpvoted)
router.get('/product/:productId', optionalAuth, getProductQuestions);

// Protected routes (auth required)
// POST /api/questions - Create question
router.post('/', protect, createQuestion);

// POST /api/questions/:id/upvote - Toggle upvote
router.post('/:id/upvote', protect, toggleUpvote);

// DELETE /api/questions/:id - Delete own question
router.delete('/:id', protect, deleteQuestion);

// Admin routes
// GET /api/questions/admin - Get all questions (admin)
router.get('/admin', protect, adminMiddleware, getAllQuestions);

// PUT /api/questions/admin/:id/status - Update status (admin)
router.put('/admin/:id/status', protect, adminMiddleware, updateQuestionStatus);

// ============================================
// Answer Routes
// ============================================

// Admin routes
// POST /api/answers - Create answer (admin)
router.post('/answers', protect, adminMiddleware, createAnswer);

// DELETE /api/answers/:id - Delete answer (admin)
router.delete('/answers/:id', protect, adminMiddleware, deleteAnswer);

module.exports = router;
