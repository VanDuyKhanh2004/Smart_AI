const Appointment = require('../models/Appointment');
const Store = require('../models/Store');

/**
 * Generate time slots for a given store and date
 * @param {Object} store - Store document
 * @param {Date} date - Date to generate slots for
 * @param {Array} existingAppointments - Existing appointments for that date
 * @returns {Array} Available time slots
 */
const generateTimeSlots = (store, date, existingAppointments) => {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = days[date.getDay()];
  const businessHours = store.businessHours[dayName];
  
  // If store is closed on this day, return empty array
  if (!businessHours || businessHours.isClosed) {
    return [];
  }
  
  const slots = [];
  const slotDuration = 30; // 30 minutes per slot
  
  const [openHour, openMin] = businessHours.open.split(':').map(Number);
  const [closeHour, closeMin] = businessHours.close.split(':').map(Number);
  
  const openMinutes = openHour * 60 + openMin;
  const closeMinutes = closeHour * 60 + closeMin;
  
  // Generate all possible slots
  for (let startMin = openMinutes; startMin + slotDuration <= closeMinutes; startMin += slotDuration) {
    const endMin = startMin + slotDuration;
    
    const startHour = Math.floor(startMin / 60);
    const startMinute = startMin % 60;
    const endHour = Math.floor(endMin / 60);
    const endMinute = endMin % 60;
    
    const startTime = `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`;
    const endTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
    
    // Check if slot is already booked
    const isBooked = existingAppointments.some(apt => {
      return apt.timeSlot.start === startTime && 
             ['pending', 'confirmed'].includes(apt.status);
    });
    
    if (!isBooked) {
      slots.push({
        start: startTime,
        end: endTime
      });
    }
  }
  
  return slots;
};


/**
 * Get available time slots for a store on a specific date
 * Public route
 */
const getAvailableSlots = async (req, res) => {
  try {
    const { storeId, date } = req.params;
    
    // Validate date
    const appointmentDate = new Date(date);
    if (isNaN(appointmentDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Ngày không hợp lệ'
      });
    }
    
    // Check if date is in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (appointmentDate < today) {
      return res.status(400).json({
        success: false,
        message: 'Không thể đặt lịch cho ngày trong quá khứ'
      });
    }
    
    // Find store
    const store = await Store.findOne({ _id: storeId, isActive: true });
    if (!store) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy cửa hàng'
      });
    }
    
    // Get existing appointments for this date
    const startOfDay = new Date(appointmentDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(appointmentDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    const existingAppointments = await Appointment.find({
      store: storeId,
      date: { $gte: startOfDay, $lte: endOfDay },
      status: { $in: ['pending', 'confirmed'] }
    });
    
    // Generate available slots
    const availableSlots = generateTimeSlots(store, appointmentDate, existingAppointments);
    
    res.status(200).json({
      success: true,
      message: 'Lấy danh sách khung giờ thành công',
      data: {
        date: date,
        store: {
          id: store._id,
          name: store.name
        },
        slots: availableSlots
      }
    });
    
  } catch (error) {
    console.error('Lỗi khi lấy khung giờ:', error.message);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy khung giờ',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Create new appointment
 * Public route (guest or logged-in user)
 */
const createAppointment = async (req, res) => {
  try {
    const { storeId, store, date, timeSlot, purpose, notes, guestInfo } = req.body;
    const userId = req.user?.id || null;
    
    // Accept both 'store' and 'storeId' field names
    const storeIdValue = storeId || store;
    
    // Validate required fields
    if (!storeIdValue || !date || !timeSlot || !purpose) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin bắt buộc: store, date, timeSlot, purpose'
      });
    }
    
    // Validate time slot format
    if (!timeSlot.start || !timeSlot.end) {
      return res.status(400).json({
        success: false,
        message: 'Khung giờ không hợp lệ'
      });
    }
    
    // Validate guest info if not logged in
    if (!userId) {
      if (!guestInfo || !guestInfo.name || !guestInfo.phone || !guestInfo.email) {
        return res.status(400).json({
          success: false,
          message: 'Thông tin khách (tên, số điện thoại, email) là bắt buộc khi không đăng nhập'
        });
      }
    }
    
    // Validate date
    const appointmentDate = new Date(date);
    if (isNaN(appointmentDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Ngày không hợp lệ'
      });
    }
    
    // Check if date is in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (appointmentDate < today) {
      return res.status(400).json({
        success: false,
        message: 'Không thể đặt lịch cho ngày trong quá khứ'
      });
    }
    
    // Find store
    const storeDoc = await Store.findOne({ _id: storeIdValue, isActive: true });
    if (!storeDoc) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy cửa hàng'
      });
    }
    
    // Check if time slot is within business hours
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = days[appointmentDate.getDay()];
    const businessHours = storeDoc.businessHours[dayName];
    
    if (!businessHours || businessHours.isClosed) {
      return res.status(400).json({
        success: false,
        message: 'Cửa hàng đóng cửa vào ngày này'
      });
    }
    
    // Validate time slot is within business hours
    const [slotStartHour, slotStartMin] = timeSlot.start.split(':').map(Number);
    const [slotEndHour, slotEndMin] = timeSlot.end.split(':').map(Number);
    const [openHour, openMin] = businessHours.open.split(':').map(Number);
    const [closeHour, closeMin] = businessHours.close.split(':').map(Number);
    
    const slotStartMinutes = slotStartHour * 60 + slotStartMin;
    const slotEndMinutes = slotEndHour * 60 + slotEndMin;
    const openMinutes = openHour * 60 + openMin;
    const closeMinutes = closeHour * 60 + closeMin;
    
    if (slotStartMinutes < openMinutes || slotEndMinutes > closeMinutes) {
      return res.status(400).json({
        success: false,
        message: 'Thời gian không hợp lệ - ngoài giờ làm việc'
      });
    }
    
    // Check if slot is already booked
    const startOfDay = new Date(appointmentDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(appointmentDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    const existingAppointment = await Appointment.findOne({
      store: storeIdValue,
      date: { $gte: startOfDay, $lte: endOfDay },
      'timeSlot.start': timeSlot.start,
      status: { $in: ['pending', 'confirmed'] }
    });
    
    if (existingAppointment) {
      return res.status(400).json({
        success: false,
        message: 'Khung giờ đã được đặt'
      });
    }
    
    // Create appointment
    const newAppointment = new Appointment({
      store: storeIdValue,
      user: userId,
      guestInfo: userId ? undefined : guestInfo,
      date: appointmentDate,
      timeSlot,
      purpose,
      notes,
      status: 'pending'
    });
    
    const savedAppointment = await newAppointment.save();
    
    // Populate store info
    await savedAppointment.populate('store', 'name address phone');
    
    res.status(201).json({
      success: true,
      message: 'Đặt lịch hẹn thành công',
      data: savedAppointment
    });
    
  } catch (error) {
    console.error('Lỗi khi đặt lịch hẹn:', error.message);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Dữ liệu không hợp lệ',
        errors
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi đặt lịch hẹn',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


/**
 * Get user's appointments
 * User route (requires authentication)
 */
const getMyAppointments = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status } = req.query;
    
    let filter = { user: userId };
    
    if (status) {
      filter.status = status;
    }
    
    const appointments = await Appointment.find(filter)
      .populate('store', 'name address phone')
      .sort({ date: -1 });
    
    res.status(200).json({
      success: true,
      message: 'Lấy danh sách lịch hẹn thành công',
      data: appointments
    });
    
  } catch (error) {
    console.error('Lỗi khi lấy lịch hẹn:', error.message);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy lịch hẹn',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get appointments by store
 * Admin route
 */
const getAppointmentsByStore = async (req, res) => {
  try {
    const { storeId } = req.params;
    const { status, date, startDate, endDate } = req.query;
    
    let filter = { store: storeId };
    
    if (status) {
      filter.status = status;
    }
    
    // Filter by specific date
    if (date) {
      const targetDate = new Date(date);
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);
      filter.date = { $gte: startOfDay, $lte: endOfDay };
    }
    // Filter by date range
    else if (startDate || endDate) {
      filter.date = {};
      if (startDate) {
        filter.date.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.date.$lte = end;
      }
    }
    
    const appointments = await Appointment.find(filter)
      .populate('store', 'name address')
      .populate('user', 'name email phone')
      .sort({ date: 1, 'timeSlot.start': 1 });
    
    res.status(200).json({
      success: true,
      message: 'Lấy danh sách lịch hẹn thành công',
      data: appointments
    });
    
  } catch (error) {
    console.error('Lỗi khi lấy lịch hẹn theo cửa hàng:', error.message);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy lịch hẹn',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all appointments
 * Admin route
 */
const getAllAppointments = async (req, res) => {
  try {
    const { status, storeId, date, startDate, endDate, page = 1, limit = 20 } = req.query;
    
    let filter = {};
    
    if (status) {
      filter.status = status;
    }
    
    if (storeId) {
      filter.store = storeId;
    }
    
    // Filter by specific date
    if (date) {
      const targetDate = new Date(date);
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);
      filter.date = { $gte: startOfDay, $lte: endOfDay };
    }
    // Filter by date range
    else if (startDate || endDate) {
      filter.date = {};
      if (startDate) {
        filter.date.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.date.$lte = end;
      }
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [appointments, total] = await Promise.all([
      Appointment.find(filter)
        .populate('store', 'name address')
        .populate('user', 'name email phone')
        .sort({ date: -1, 'timeSlot.start': 1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Appointment.countDocuments(filter)
    ]);
    
    res.status(200).json({
      success: true,
      message: 'Lấy danh sách lịch hẹn thành công',
      data: appointments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (error) {
    console.error('Lỗi khi lấy tất cả lịch hẹn:', error.message);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy lịch hẹn',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


/**
 * Update appointment status
 * Admin route
 */
const updateAppointmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, cancelReason } = req.body;
    
    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Trạng thái là bắt buộc'
      });
    }
    
    const appointment = await Appointment.findById(id);
    
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy lịch hẹn'
      });
    }
    
    // Validate status transition
    if (!appointment.canTransitionTo(status)) {
      const validTransitions = Appointment.getValidTransitions(appointment.status);
      return res.status(400).json({
        success: false,
        message: `Không thể chuyển từ trạng thái "${appointment.status}" sang "${status}". Các trạng thái hợp lệ: ${validTransitions.join(', ') || 'không có'}`
      });
    }
    
    appointment.status = status;
    
    if (status === 'cancelled' && cancelReason) {
      appointment.cancelReason = cancelReason;
    }
    
    const updatedAppointment = await appointment.save();
    await updatedAppointment.populate('store', 'name address');
    await updatedAppointment.populate('user', 'name email phone');
    
    const statusMessages = {
      confirmed: 'Đã xác nhận lịch hẹn',
      completed: 'Đã hoàn thành lịch hẹn',
      cancelled: 'Đã hủy lịch hẹn'
    };
    
    res.status(200).json({
      success: true,
      message: statusMessages[status] || 'Cập nhật trạng thái thành công',
      data: updatedAppointment
    });
    
  } catch (error) {
    console.error('Lỗi khi cập nhật trạng thái:', error.message);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi cập nhật trạng thái',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Cancel appointment (user)
 * User route
 */
const cancelAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { cancelReason } = req.body;
    
    const appointment = await Appointment.findOne({
      _id: id,
      user: userId
    });
    
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy lịch hẹn'
      });
    }
    
    // Check if appointment can be cancelled (status check)
    if (!appointment.canTransitionTo('cancelled')) {
      return res.status(400).json({
        success: false,
        message: `Không thể hủy lịch hẹn với trạng thái "${appointment.status}"`
      });
    }
    
    // Check 24-hour rule
    if (!appointment.canBeCancelled()) {
      return res.status(400).json({
        success: false,
        message: 'Không thể hủy lịch hẹn trong vòng 24 giờ'
      });
    }
    
    appointment.status = 'cancelled';
    if (cancelReason) {
      appointment.cancelReason = cancelReason;
    }
    
    const updatedAppointment = await appointment.save();
    await updatedAppointment.populate('store', 'name address');
    
    res.status(200).json({
      success: true,
      message: 'Đã hủy lịch hẹn thành công',
      data: updatedAppointment
    });
    
  } catch (error) {
    console.error('Lỗi khi hủy lịch hẹn:', error.message);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi hủy lịch hẹn',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get appointment by ID
 * Admin or owner
 */
const getAppointmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const isAdmin = req.user?.role === 'admin';
    
    let filter = { _id: id };
    
    // If not admin, only allow viewing own appointments
    if (!isAdmin && userId) {
      filter.user = userId;
    }
    
    const appointment = await Appointment.findOne(filter)
      .populate('store', 'name address phone email businessHours')
      .populate('user', 'name email phone');
    
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy lịch hẹn'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Lấy thông tin lịch hẹn thành công',
      data: appointment
    });
    
  } catch (error) {
    console.error('Lỗi khi lấy thông tin lịch hẹn:', error.message);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy thông tin lịch hẹn',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  getAvailableSlots,
  createAppointment,
  getMyAppointments,
  getAppointmentsByStore,
  getAllAppointments,
  updateAppointmentStatus,
  cancelAppointment,
  getAppointmentById,
  // Export for testing
  generateTimeSlots
};
