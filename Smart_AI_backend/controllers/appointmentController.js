const Appointment = require('../models/Appointment');
const Store = require('../models/Store');
const asyncHandler = require('../utils/asyncHandler');
const { BadRequestError, NotFoundError } = require('../utils/errors');
const parsePagination = require('../utils/parsePagination');
const logger = require('../utils/logger');
const {
  enqueueAppointmentCreatedEmail,
  enqueueAppointmentConfirmedEmail,
  enqueueAppointmentCancelledEmail,
} = require('../services/emailQueueService');

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// The backend is the source of truth for slot durations. Duration is derived
// from the appointment purpose; users never pick a duration directly.
const APPOINTMENT_DURATIONS = {
  consultation: 30,
  purchase: 30,
  warranty: 60,
  other: 30,
};

const SLOT_GRID_MINUTES = 30;

const getPurposeDuration = (purpose) => APPOINTMENT_DURATIONS[purpose] || APPOINTMENT_DURATIONS.consultation;

const timeToMinutes = (time) => {
  if (typeof time !== 'string') return null;
  const [hours, minutes] = time.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  return hours * 60 + minutes;
};

const minutesToTime = (minutes) => {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

// Two intervals [aStart, aEnd) and [bStart, bEnd) conflict when they strictly
// overlap. Touching boundaries (end === start) do NOT conflict.
const intervalOverlaps = (aStartMin, aEndMin, bStartMin, bEndMin) => {
  if (aStartMin === null || aEndMin === null || bStartMin === null || bEndMin === null) return false;
  return bStartMin < aEndMin && aStartMin < bEndMin;
};

// Normalize an existing appointment into interval minutes. Falls back to the
// purpose duration when the stored end time is missing (legacy data). Returns
// null when the stored times cannot be parsed.
const normalizeInterval = (appointment) => {
  const start = timeToMinutes(appointment.timeSlot && appointment.timeSlot.start);
  if (start === null) return null;
  const end = timeToMinutes(appointment.timeSlot && appointment.timeSlot.end);
  if (end === null) {
    return { start, end: start + getPurposeDuration(appointment.purpose) };
  }
  return { start, end };
};

// Split an interval into the 30-minute grid buckets it occupies. Two
// grid-aligned intervals overlap if and only if they share at least one bucket.
const computeOccupiedBuckets = (startMinutes, durationMinutes) => {
  const buckets = [];
  for (let t = startMinutes; t < startMinutes + durationMinutes; t += SLOT_GRID_MINUTES) {
    buckets.push(minutesToTime(t));
  }
  return buckets;
};

const generateTimeSlots = (store, date, existingAppointments, purpose = 'consultation') => {
  const dayName = DAYS[date.getDay()];
  const businessHours = store.businessHours[dayName];

  if (!businessHours || businessHours.isClosed) {
    return [];
  }

  const slotDuration = getPurposeDuration(purpose);

  const openMinutes = timeToMinutes(businessHours.open);
  const closeMinutes = timeToMinutes(businessHours.close);

  if (openMinutes === null || closeMinutes === null) {
    return [];
  }

  const blockedIntervals = existingAppointments
    .filter((apt) => ['pending', 'confirmed'].includes(apt.status))
    .map(normalizeInterval)
    .filter((interval) => interval !== null);

  const slots = [];
  for (let startMin = openMinutes; startMin + slotDuration <= closeMinutes; startMin += SLOT_GRID_MINUTES) {
    const endMin = startMin + slotDuration;

    const isBooked = blockedIntervals.some((interval) => {
      return intervalOverlaps(startMin, endMin, interval.start, interval.end);
    });

    if (!isBooked) {
      slots.push({
        start: minutesToTime(startMin),
        end: minutesToTime(endMin)
      });
    }
  }

  return slots;
};

// Resolve the recipient contact (name + email) for appointment emails.
// Prefers the populated user, then guest info, then the authenticated user.
function resolveAppointmentContact(appointment, fallbackUser) {
  const user = appointment && appointment.user;
  if (user && user.email) {
    return { name: user.name, email: user.email };
  }
  const guestInfo = appointment && appointment.guestInfo;
  if (guestInfo && guestInfo.email) {
    return { name: guestInfo.name, email: guestInfo.email };
  }
  if (fallbackUser && fallbackUser.email) {
    return { name: fallbackUser.name, email: fallbackUser.email };
  }
  return null;
}

const sendAppointmentEmail = (jobType, contact, appointment, correlationId) => {
  if (!contact || !contact.email) {
    logger.warn(
      { appointmentId: appointment && appointment._id, emailEvent: jobType },
      'Appointment email skipped: no recipient email',
    );
    return;
  }
  try {
    switch (jobType) {
      case 'appointment-created':
        enqueueAppointmentCreatedEmail(contact, appointment, correlationId);
        break;
      case 'appointment-confirmed':
        enqueueAppointmentConfirmedEmail(contact, appointment, correlationId);
        break;
      case 'appointment-cancelled':
        enqueueAppointmentCancelledEmail(contact, appointment, correlationId);
        break;
      default:
        logger.warn({ emailEvent: jobType }, 'Unknown appointment email event');
    }
  } catch (err) {
    logger.error(
      { err: { message: err.message }, appointmentId: appointment && appointment._id, emailEvent: jobType },
      'Appointment email enqueue failed',
    );
  }
};

const getAvailableSlots = async (req, res) => {
  const { storeId, date } = req.params;
  const { purpose } = req.query;

  const normalizedPurpose = purpose && APPOINTMENT_DURATIONS[purpose] ? purpose : 'consultation';

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

  const availableSlots = generateTimeSlots(store, appointmentDate, existingAppointments, normalizedPurpose);

  res.status(200).json({
    success: true,
    message: 'Lấy danh sách khung giờ thành công',
    data: {
      date: date,
      purpose: normalizedPurpose,
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

  const dayName = DAYS[appointmentDate.getDay()];
  const businessHours = storeDoc.businessHours[dayName];

  if (!businessHours || businessHours.isClosed) {
    throw new BadRequestError('Cửa hàng đóng cửa vào ngày này', 'STORE_CLOSED', undefined, 'legacy-top-level-message');
  }

  const slotStartMinutes = timeToMinutes(timeSlot.start);
  const openMinutes = timeToMinutes(businessHours.open);
  const closeMinutes = timeToMinutes(businessHours.close);

  if (slotStartMinutes === null || openMinutes === null || closeMinutes === null) {
    throw new BadRequestError('Khung giờ không hợp lệ', 'INVALID_TIME_SLOT', undefined, 'legacy-top-level-message');
  }

  // Server authority: duration is derived from purpose, never from the client.
  const duration = getPurposeDuration(purpose);
  const expectedEndMinutes = slotStartMinutes + duration;
  const expectedEnd = minutesToTime(expectedEndMinutes);

  if (timeSlot.end !== expectedEnd) {
    throw new BadRequestError(
      'Thời gian kết thúc không khớp với mục đích đã chọn',
      'INVALID_TIME_SLOT',
      undefined,
      'legacy-top-level-message'
    );
  }

  // Slots are aligned to the 30-minute grid relative to opening time.
  if ((slotStartMinutes - openMinutes) % SLOT_GRID_MINUTES !== 0) {
    throw new BadRequestError('Khung giờ phải bắt đầu đúng theo khung 30 phút', 'INVALID_TIME_SLOT', undefined, 'legacy-top-level-message');
  }

  if (slotStartMinutes < openMinutes || expectedEndMinutes > closeMinutes) {
    throw new BadRequestError('Thời gian không hợp lệ - ngoài giờ làm việc', 'OUTSIDE_BUSINESS_HOURS', undefined, 'legacy-top-level-message');
  }

  const startOfDay = new Date(appointmentDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(appointmentDate);
  endOfDay.setHours(23, 59, 59, 999);

  // Deterministic overlap validation: an appointment conflicts with any other
  // active appointment whose interval strictly overlaps, not only identical
  // start times. This query also covers pre-existing records.
  const existingAppointment = await Appointment.findOne({
    store: storeIdValue,
    date: { $gte: startOfDay, $lte: endOfDay },
    'timeSlot.start': { $lt: expectedEnd },
    'timeSlot.end': { $gt: timeSlot.start },
    status: { $in: ['pending', 'confirmed'] }
  });

  if (existingAppointment) {
    throw new BadRequestError('Khung giờ đã được đặt', 'SLOT_ALREADY_BOOKED', undefined, 'legacy-top-level-message');
  }

  const occupies = computeOccupiedBuckets(slotStartMinutes, duration);

  const newAppointment = new Appointment({
    store: storeIdValue,
    user: userId,
    guestInfo: userId ? undefined : guestInfo,
    date: appointmentDate,
    timeSlot: { start: timeSlot.start, end: expectedEnd },
    purpose,
    notes,
    status: 'pending',
    occupies
  });

  let savedAppointment;
  try {
    savedAppointment = await newAppointment.save();
  } catch (err) {
    // E11000 duplicate key from the partial unique index on
    // { store, date, occupies } means a concurrent request reserved an
    // overlapping bucket first. Backend remains the source of truth.
    if (err && err.code === 11000) {
      throw new BadRequestError('Khung giờ đã được đặt', 'SLOT_ALREADY_BOOKED', undefined, 'legacy-top-level-message');
    }
    throw err;
  }

  await savedAppointment.populate('store', 'name address phone');

  const contact = resolveAppointmentContact(savedAppointment, req.user);
  sendAppointmentEmail('appointment-created', contact, savedAppointment, req.requestId);

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
  const { status, storeId, date, startDate, endDate } = req.query;
  const { page, limit, skip } = parsePagination(req.query);

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

  const [appointments, total] = await Promise.all([
    Appointment.find(filter)
      .populate('store', 'name address')
      .populate('user', 'name email phone')
      .sort({ date: -1, 'timeSlot.start': 1 })
      .skip(skip)
      .limit(limit),
    Appointment.countDocuments(filter)
  ]);

  res.status(200).json({
    success: true,
    message: 'Lấy danh sách lịch hẹn thành công',
    data: appointments,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
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

  const contact = resolveAppointmentContact(updatedAppointment);
  if (status === 'confirmed') {
    sendAppointmentEmail('appointment-confirmed', contact, updatedAppointment, req.requestId);
  } else if (status === 'cancelled') {
    sendAppointmentEmail('appointment-cancelled', contact, updatedAppointment, req.requestId);
  }

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
  generateTimeSlots,
  getPurposeDuration,
  intervalOverlaps,
  computeOccupiedBuckets,
  timeToMinutes,
  minutesToTime,
  APPOINTMENT_DURATIONS
};
