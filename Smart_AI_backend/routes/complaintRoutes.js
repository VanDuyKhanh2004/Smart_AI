const express = require('express');
const router = express.Router();
const complaintController = require('../controllers/complaintController');

/**
 * @route GET /api/complaints
 * @desc Get list of complaints with pagination and filtering
 * @query {number} page - Page number (default: 1)
 * @query {number} limit - Items per page (default: 10)
 * @query {string} status - Filter by status (open, in_progress, resolved, closed)
 * @query {string} priority - Filter by priority (low, medium, high, urgent)
 * @query {string} sortBy - Sort field (default: createdAt)
 * @query {string} sortOrder - Sort order (asc, desc, default: desc)
 * @query {string} search - Text search across complaint fields
 * @access Admin
 */
router.get('/', complaintController.getComplaints);

/**
 * @route GET /api/complaints/stats
 * @desc Get complaint statistics and analytics
 * @query {string} timeRange - Time range for stats (7d, 30d, 90d, default: 30d)
 * @access Admin
 */
router.get('/stats', complaintController.getComplaintStats);

/**
 * @route GET /api/complaints/search
 * @desc Advanced search for complaints
 * @query {string} q - Search query
 * @query {string|array} status - Status filter
 * @query {string|array} priority - Priority filter
 * @query {string} dateFrom - Start date filter
 * @query {string} dateTo - End date filter
 * @query {boolean} hasContact - Filter by contact information availability
 * @query {number} page - Page number
 * @query {number} limit - Items per page
 * @access Admin
 */
router.get('/search', complaintController.searchComplaints);

/**
 * @route GET /api/complaints/:id
 * @desc Get complaint details by ID
 * @param {string} id - Complaint ID
 * @access Admin
 */
router.get('/:id', complaintController.getComplaintById);

/**
 * @route PUT /api/complaints/:id
 * @desc Update complaint details
 * @param {string} id - Complaint ID
 * @body {string} status - New status
 * @body {string} priority - New priority
 * @body {string} assignedTo - Assign to staff member
 * @body {string} resolutionNotes - Resolution notes
 * @body {array} tags - Complaint tags
 * @access Admin
 */
router.put('/:id', complaintController.updateComplaint);

/**
 * @route PUT /api/complaints/:id/resolve
 * @desc Quick resolve complaint
 * @param {string} id - Complaint ID
 * @body {string} resolutionNotes - Resolution notes
 * @access Admin
 */
router.put('/:id/resolve', complaintController.resolveComplaint);

/**
 * @route PUT /api/complaints/:id/escalate
 * @desc Escalate complaint priority
 * @param {string} id - Complaint ID
 * @access Admin
 */
router.put('/:id/escalate', complaintController.escalateComplaint);

/**
 * @route DELETE /api/complaints/:id
 * @desc Delete complaint (admin only)
 * @param {string} id - Complaint ID
 * @access Admin
 */
router.delete('/:id', complaintController.deleteComplaint);

// Error handling middleware for this router
router.use((error, req, res, next) => {
  console.error('Complaint routes error:', error);
  
  // Handle specific error types
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Dữ liệu không hợp lệ',
        details: Object.values(error.errors).map(err => err.message)
      }
    });
  }
  
  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: {
        message: 'ID không hợp lệ',
        code: 'INVALID_ID'
      }
    });
  }
  
  // Generic server error
  res.status(500).json({
    success: false,
    error: {
      message: 'Lỗi server nội bộ',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }
  });
});

module.exports = router;