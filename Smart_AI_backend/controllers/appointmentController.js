const Appointment = require('../models/Appointment');
const Store = require('../models/Store');
const asyncHandler = require('../utils/asyncHandler');
const { BadRequestError, NotFoundError } = require('../utils/errors');

const generateTimeSlots = (store, date, existingAppointments) => {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = days[date.getDay()];
  const businessHours = store.businessHours[dayName];

  if (!businessHours || businessHours.isClosed) {
    return [];
  }

  const slots = [];
  const slotDuration = 30;

  const [openHour, openMin] = businessHours.open.split(':').map(Number);
  const [closeHour, closeMin] = businessHours.close.split(':').map(Number);

  const openMinutes = openHour * 60 + openMin;
  const closeMinutes = closeHour * 60 + closeMin;

  for (let startMin = openMinutes; startMin + slotDuration <= closeMinutes; startMin += slotDuration) {
    const endMin = startMin + slotDuration;

    const startHour = Math.floor(startMin / 60);
    const startMinute = startMin % 60;
    const endHour = Math.floor(endMin / 60);
    const endMinute = endMin % 60;

    const startTime = `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`;
    const endTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;

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

const getAvailableSlots = async (req, res) => {
  const { storeId, date } = req.params;

  const appointmentDate = new Date(date);
  if (isNaN(appointmentDate.getTime())) {
    throw new BadRequestError('Ngày không hợp lệ', 'INVALID_DATE', undefined, 'legacy-top-level-message');
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (appointmentDate < today) {
    throw new BadRequestError('Không thể đặt lịch cho ngày trong quá khứ', 'PAST_DATE', undefined, 'legacy-top-level-message');
  }

  const store = await Store.findOne({ _id: storeId, isActive: true });
  if (!store) {
    throw new NotFoundError('Không tìm thấy cửa hàng', 'STORE_NOT_FOUND', 'legacy-top-level-message');
  }

  const startOfDay = new Date(appointmentDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(appointmentDate);
  endOfDay.setHours(23, 59, 59, 999);

  const existingAppointments = await Appointment.find({
    store: storeId,
    date: { $gte: startOfDay, $lte: endOfDay },
    status: { $in: ['pending', 'confirmed'] }
  });

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
};

const createAppointment = async (req, res) => {
  const { storeId, store, date, timeSlot, purpose, notes, guestInfo } = req.body;
  const userId = req.user?.id || null;

  const storeIdValue = storeId || store;

  if (!storeIdValue || !date || !timeSlot || !purpose) {
    throw new BadRequestError('Thiếu thông tin bắt buộc: store, date, timeSlot, purpose', 'MISSING_FIELDS', undefined, 'legacy-top-level-message');
  }

  if (!timeSlot.start || !timeSlot.end) {
    throw new BadRequestError('Khung giờ không hợp lệ', 'INVALID_TIME_SLOT', undefined, 'legacy-top-level-message');
  }

  if (!userId) {
    if (!guestInfo || !guestInfo.name || !guestInfo.phone || !guestInfo.email) {
      throw new BadRequestError('Thông tin khách (tên, số điện thoại, email) là bắt buộc khi không đăng nhập', 'GUEST_INFO_REQUIRED', undefined, 'legacy-top-level-message');
    }
  }

  const appointmentDate = new Date(date);
  if (isNaN(appointmentDate.getTime())) {
    throw new BadRequestError('Ngày không hợp lệ', 'INVALID_DATE', undefined, 'legacy-top-level-message');
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (appointmentDate < today) {
    throw new BadRequestError('Không thể đặt lịch cho ngày trong quá khứ', 'PAST_DATE', undefined, 'legacy-top-level-message');
  }

  const storeDoc = await Store.findOne({ _id: storeIdValue, isActive: true });
  if (!storeDoc) {
    throw new NotFoundError('Không tìm thấy cửa hàng', 'STORE_NOT_FOUND', 'legacy-top-level-message');
  }

  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = days[appointmentDate.getDay()];
  const businessHours = storeDoc.businessHours[dayName];

  if (!businessHours || businessHours.isClosed) {
    throw new BadRequestError('Cửa hàng đóng cửa vào ngày này', 'STORE_CLOSED', undefined, 'legacy-top-level-message');
  }

  const [slotStartHour, slotStartMin] = timeSlot.start.split(':').map(Number);
  const [slotEndHour, slotEndMin] = timeSlot.end.split(':').map(Number);
  const [openHour, openMin] = businessHours.open.split(':').map(Number);
  const [closeHour, closeMin] = businessHours.close.split(':').map(Number);

  const slotStartMinutes = slotStartHour * 60 + slotStartMin;
  const slotEndMinutes = slotEndHour * 60 + slotEndMin;
  const openMinutes = openHour * 60 + openMin;
  const closeMinutes = closeHour * 60 + closeMin;

  if (slotStartMinutes < openMinutes || slotEndMinutes > closeMinutes) {
    throw new BadRequestError('Thời gian không hợp lệ - ngoài giờ làm việc', 'OUTSIDE_BUSINESS_HOURS', undefined, 'legacy-top-level-message');
  }

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
    throw new BadRequestError('Khung giờ đã được đặt', 'SLOT_ALREADY_BOOKED', undefined, 'legacy-top-level-message');
  }

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

  await savedAppointment.populate('store', 'name address phone');

  res.status(201).json({
    success: true,
    message: 'Đặt lịch hẹn thành công',
    data: savedAppointment
  });
};

const getMyAppointments = async (req, res) => {
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
};

const getAppointmentsByStore = async (req, res) => {
  const { storeId } = req.params;
  const { status, date, startDate, endDate } = req.query;

  let filter = { store: storeId };

  if (status) {
    filter.status = status;
  }

  if (date) {
    const targetDate = new Date(date);
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);
    filter.date = { $gte: startOfDay, $lte: endOfDay };
  } else if (startDate || endDate) {
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
};

const getAllAppointments = async (req, res) => {
  const { status, storeId, date, startDate, endDate, page = 1, limit = 20 } = req.query;

  let filter = {};

  if (status) {
    filter.status = status;
  }

  if (storeId) {
    filter.store = storeId;
  }

  if (date) {
    const targetDate = new Date(date);
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);
    filter.date = { $gte: startOfDay, $lte: endOfDay };
  } else if (startDate || endDate) {
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
};

const updateAppointmentStatus = async (req, res) => {
  const { id } = req.params;
  const { status, cancelReason } = req.body;

  if (!status) {
    throw new BadRequestError('Trạng thái là bắt buộc', 'STATUS_REQUIRED', undefined, 'legacy-top-level-message');
  }

  const appointment = await Appointment.findById(id);

  if (!appointment) {
    throw new NotFoundError('Không tìm thấy lịch hẹn', 'APPOINTMENT_NOT_FOUND', 'legacy-top-level-message');
  }

  if (!appointment.canTransitionTo(status)) {
    const validTransitions = Appointment.getValidTransitions(appointment.status);
    throw new BadRequestError(
      `Không thể chuyển từ trạng thái "${appointment.status}" sang "${status}". Các trạng thái hợp lệ: ${validTransitions.join(', ') || 'không có'}`,
      'INVALID_TRANSITION',
      undefined,
      'legacy-top-level-message'
    );
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
};

const cancelAppointment = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { cancelReason } = req.body;

  const appointment = await Appointment.findOne({
    _id: id,
    user: userId
  });

  if (!appointment) {
    throw new NotFoundError('Không tìm thấy lịch hẹn', 'APPOINTMENT_NOT_FOUND', 'legacy-top-level-message');
  }

  if (!appointment.canTransitionTo('cancelled')) {
    throw new BadRequestError(
      `Không thể hủy lịch hẹn với trạng thái "${appointment.status}"`,
      'INVALID_TRANSITION',
      undefined,
      'legacy-top-level-message'
    );
  }

  if (!appointment.canBeCancelled()) {
    throw new BadRequestError('Không thể hủy lịch hẹn trong vòng 24 giờ', 'CANCELLATION_WINDOW', undefined, 'legacy-top-level-message');
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
};

const getAppointmentById = async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const isAdmin = req.user?.role === 'admin';

  let filter = { _id: id };

  if (!isAdmin && userId) {
    filter.user = userId;
  }

  const appointment = await Appointment.findOne(filter)
    .populate('store', 'name address phone email businessHours')
    .populate('user', 'name email phone');

  if (!appointment) {
    throw new NotFoundError('Không tìm thấy lịch hẹn', 'APPOINTMENT_NOT_FOUND', 'legacy-top-level-message');
  }

  res.status(200).json({
    success: true,
    message: 'Lấy thông tin lịch hẹn thành công',
    data: appointment
  });
};

module.exports = {
  getAvailableSlots: asyncHandler(getAvailableSlots),
  createAppointment: asyncHandler(createAppointment),
  getMyAppointments: asyncHandler(getMyAppointments),
  getAppointmentsByStore: asyncHandler(getAppointmentsByStore),
  getAllAppointments: asyncHandler(getAllAppointments),
  updateAppointmentStatus: asyncHandler(updateAppointmentStatus),
  cancelAppointment: asyncHandler(cancelAppointment),
  getAppointmentById: asyncHandler(getAppointmentById),
  generateTimeSlots
};
