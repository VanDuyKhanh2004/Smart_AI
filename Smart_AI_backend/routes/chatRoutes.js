const express = require('express');
const router = express.Router();
const { listConversations, getConversation } = require('../controllers/conversationController');
const { protect } = require('../middlewares/authMiddleware');

// ============================================
// Chat History routes (REST, read-only)
// ============================================
// Live chat messaging remains Socket.IO-only. These routes provide owned
// conversation history for reload restoration. There is deliberately NO
// POST /api/chat — messaging is never done over HTTP.

// GET /api/chat/conversations — owned active conversation summaries
router.get('/conversations', protect, listConversations);

// GET /api/chat/conversations/:sessionId — owned full conversation detail
router.get('/conversations/:sessionId', protect, getConversation);

module.exports = router;