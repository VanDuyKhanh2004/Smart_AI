const express = require('express');
const router = express.Router();
const {
  getAvailableSlots,
  createAppointment,
  getMyAppointments,
  getAppointmentsByStore,
  getAllAppointments,
  updateAppointmentStatus,
  cancelAppointment,
  getAppointmentById
} = require('../controllers/appointmentController');
const { protect, optionalAuth } = require('../middlewares/authMiddleware');
const { adminMiddleware } = require('../middlewares/adminMiddleware');

// Public routes
// GET available time slots for a store on a specific date
router.get('/available-slots/:storeId/:date', getAvailableSlots);

// Create appointment (guest or logged-in user)
// Uses optionalAuth to attach user if logged in, but allows guest bookings
router.post('/', optionalAuth, createAppointment);

// User protected routes
// GET user's own appointments
router.get('/my', protect, getMyAppointments);

// GET single appointment by ID (user can only see their own)
router.get('/:id', protect, getAppointmentById);

// Cancel user's own appointment
router.patch('/:id/cancel', protect, cancelAppointment);

// Admin protected routes
// GET all appointments with filters
router.get('/admin/all', protect, adminMiddleware, getAllAppointments);

// GET appointments by store
router.get('/admin/store/:storeId', protect, adminMiddleware, getAppointmentsByStore);

// Update appointment status (confirm, complete, cancel)
router.patch('/admin/:id/status', protect, adminMiddleware, updateAppointmentStatus);

module.exports = router;
