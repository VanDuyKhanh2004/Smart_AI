const jwt = require('jsonwebtoken');
const request = require('supertest');
const mongoose = require('mongoose');

const TEST_SECRET = 'test-appointment-secret';
process.env.JWT_SECRET = TEST_SECRET;

const USER_ID = '507f191e810c19729de860ea';
const ADMIN_ID = '507f191e810c19729de860eb';
const STORE_ID = '507f191e810c19729de860ec';
const APPOINTMENT_ID = '507f191e810c19729de860ed';
const MISSING_ID = '507f191e810c19729de860ff';

const USER_TOKEN = jwt.sign({ id: USER_ID, email: 'user@test.com', role: 'user' }, TEST_SECRET);
const ADMIN_TOKEN = jwt.sign({ id: ADMIN_ID, email: 'admin@test.com', role: 'admin' }, TEST_SECRET);

const mockUser = { _id: USER_ID, email: 'user@test.com', role: 'user', name: 'Test User' };
const mockAdmin = { _id: ADMIN_ID, email: 'admin@test.com', role: 'admin', name: 'Admin' };

jest.mock('../models/User', () => ({
  findById: jest.fn((id) => {
    if (id === USER_ID) return Promise.resolve(mockUser);
    if (id === ADMIN_ID) return Promise.resolve(mockAdmin);
    return Promise.resolve(null);
  }),
}));

const mockStore = {
  _id: STORE_ID,
  name: 'Test Store',
  address: { street: '123 Street', district: 'District 1', city: 'City', fullAddress: '123 Street, District 1, City' },
  phone: '0123456789',
  businessHours: {
    monday: { open: '08:00', close: '21:00', isClosed: false },
    tuesday: { open: '08:00', close: '21:00', isClosed: false },
    wednesday: { open: '08:00', close: '21:00', isClosed: false },
    thursday: { open: '08:00', close: '21:00', isClosed: false },
    friday: { open: '08:00', close: '21:00', isClosed: false },
    saturday: { open: '08:00', close: '21:00', isClosed: false },
    sunday: { open: '08:00', close: '21:00', isClosed: false }
  },
  isActive: true,
};

const closedStore = {
  ...mockStore,
  _id: '507f191e810c19729de860ee',
  businessHours: {
    monday: { open: '08:00', close: '21:00', isClosed: true },
    tuesday: { open: '08:00', close: '21:00', isClosed: true },
    wednesday: { open: '08:00', close: '21:00', isClosed: true },
    thursday: { open: '08:00', close: '21:00', isClosed: true },
    friday: { open: '08:00', close: '21:00', isClosed: true },
    saturday: { open: '08:00', close: '21:00', isClosed: true },
    sunday: { open: '08:00', close: '21:00', isClosed: true }
  },
};

const mockAppointmentObj = {
  _id: APPOINTMENT_ID,
  store: STORE_ID,
  user: USER_ID,
  date: new Date('2099-12-25'),
  timeSlot: { start: '10:00', end: '10:30' },
  purpose: 'consultation',
  status: 'pending',
  notes: 'Test',
  canTransitionTo: jest.fn(() => true),
  canBeCancelled: jest.fn(() => true),
  save: jest.fn(function () { return Promise.resolve(this); }),
  populate: jest.fn(function () { return this; }),
};

function createMockAppointment(overrides = {}) {
  return { ...mockAppointmentObj, ...overrides };
}

jest.mock('../models/Store', () => ({
  findOne: jest.fn(),
}));

jest.mock('../models/Appointment', () => {
  const mockAppointment = jest.fn((data) => ({
    ...data,
    ...mockAppointmentObj,
    save: jest.fn().mockResolvedValue({ ...mockAppointmentObj, ...data }),
    populate: jest.fn().mockReturnThis(),
  }));
  mockAppointment.find = jest.fn();
  mockAppointment.findById = jest.fn();
  mockAppointment.findOne = jest.fn();
  mockAppointment.countDocuments = jest.fn();
  mockAppointment.getValidTransitions = jest.fn();
  return mockAppointment;
});

const Store = require('../models/Store');
const Appointment = require('../models/Appointment');
const appointmentRoutes = require('../routes/appointmentRoutes');
const errorHandler = require('../middlewares/errorHandler');
const express = require('express');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/appointments', appointmentRoutes);
  app.use(errorHandler);
  return app;
}

function chainableFind(result) {
  const q = {
    populate: jest.fn(function () { return this; }),
    sort: jest.fn(function () { return this; }),
    skip: jest.fn(function () { return this; }),
    limit: jest.fn(function () { return this; }),
    then: jest.fn(function (resolve) { resolve(result); }),
  };
  return q;
}

describe('Appointment Controller — centralized error handling', () => {
  let app;

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/appointments/available-slots/:storeId/:date', () => {
    it('should return available slots for a valid store and date', async () => {
      Store.findOne.mockResolvedValue(mockStore);
      Appointment.find.mockResolvedValue([]);

      const res = await request(app).get(`/api/appointments/available-slots/${STORE_ID}/2099-12-25`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.slots.length).toBeGreaterThan(0);
      expect(res.body.data.store.id).toBe(STORE_ID);
    });

    it('should return 400 for invalid date format', async () => {
      const res = await request(app).get(`/api/appointments/available-slots/${STORE_ID}/not-a-date`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Ngày không hợp lệ');
    });

    it('should return 400 for past date', async () => {
      const res = await request(app).get(`/api/appointments/available-slots/${STORE_ID}/2020-01-01`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Không thể đặt lịch cho ngày trong quá khứ');
    });

    it('should return 404 when store not found', async () => {
      Store.findOne.mockResolvedValue(null);

      const res = await request(app).get(`/api/appointments/available-slots/${MISSING_ID}/2099-12-25`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Không tìm thấy cửa hàng');
    });

    it('should return 500 on unexpected error', async () => {
      Store.findOne.mockRejectedValue(new Error('DB failure'));

      const res = await request(app).get(`/api/appointments/available-slots/${STORE_ID}/2099-12-25`);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/appointments', () => {
    const validPayload = {
      storeId: STORE_ID,
      date: '2099-12-25',
      timeSlot: { start: '10:00', end: '10:30' },
      purpose: 'consultation',
      notes: 'Test note',
      guestInfo: { name: 'Guest', phone: '0987654321', email: 'guest@test.com' },
    };

    it('should create an appointment for guest user', async () => {
      Store.findOne.mockResolvedValue(mockStore);
      Appointment.findOne.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/appointments')
        .send(validPayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Đặt lịch hẹn thành công');
    });

    it('should create an appointment for logged-in user', async () => {
      Store.findOne.mockResolvedValue(mockStore);
      Appointment.findOne.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send(validPayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 for missing required fields', async () => {
      const res = await request(app).post('/api/appointments').send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Thiếu thông tin bắt buộc');
    });

    it('should return 400 for invalid time slot', async () => {
      const res = await request(app).post('/api/appointments').send({
        storeId: STORE_ID,
        date: '2099-12-25',
        timeSlot: {},
        purpose: 'consultation',
        guestInfo: validPayload.guestInfo,
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Khung giờ không hợp lệ');
    });

    it('should return 400 when guest info is missing for guest user', async () => {
      const res = await request(app).post('/api/appointments').send({
        storeId: STORE_ID,
        date: '2099-12-25',
        timeSlot: { start: '10:00', end: '10:30' },
        purpose: 'consultation',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Thông tin khách');
    });

    it('should return 400 for invalid date', async () => {
      const res = await request(app)
        .post('/api/appointments')
        .send({ ...validPayload, date: 'not-a-date' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Ngày không hợp lệ');
    });

    it('should return 400 for past date', async () => {
      const res = await request(app)
        .post('/api/appointments')
        .send({ ...validPayload, date: '2020-01-01' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Không thể đặt lịch cho ngày trong quá khứ');
    });

    it('should return 404 when store not found', async () => {
      Store.findOne.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/appointments')
        .send(validPayload);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Không tìm thấy cửa hàng');
    });

    it('should return 400 when store is closed on that day', async () => {
      Store.findOne.mockResolvedValue(closedStore);

      const res = await request(app)
        .post('/api/appointments')
        .send(validPayload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Cửa hàng đóng cửa vào ngày này');
    });

    it('should return 400 when slot is outside business hours', async () => {
      Store.findOne.mockResolvedValue(mockStore);

      const res = await request(app)
        .post('/api/appointments')
        .send({ ...validPayload, timeSlot: { start: '22:00', end: '22:30' } });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Thời gian không hợp lệ - ngoài giờ làm việc');
    });

    it('should return 400 when slot is already booked', async () => {
      Store.findOne.mockResolvedValue(mockStore);
      Appointment.findOne.mockResolvedValue(createMockAppointment());

      const res = await request(app)
        .post('/api/appointments')
        .send(validPayload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Khung giờ đã được đặt');
    });

    it('should return 500 on unexpected error', async () => {
      Store.findOne.mockRejectedValue(new Error('DB failure'));

      const res = await request(app)
        .post('/api/appointments')
        .send(validPayload);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/appointments/my', () => {
    it("should return user's appointments", async () => {
      Appointment.find.mockReturnValue(chainableFind([createMockAppointment()]));

      const res = await request(app)
        .get('/api/appointments/my')
        .set('Authorization', `Bearer ${USER_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app).get('/api/appointments/my');

      expect(res.status).toBe(401);
    });

    it('should return 500 on unexpected error', async () => {
      Appointment.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockRejectedValue(new Error('DB failure')),
      });

      const res = await request(app)
        .get('/api/appointments/my')
        .set('Authorization', `Bearer ${USER_TOKEN}`);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/appointments/:id', () => {
    it('should return appointment by id for the owner', async () => {
      const mockApt = createMockAppointment();
      Appointment.findOne.mockReturnValue({
        populate: jest.fn(function () { return this; }),
        then: jest.fn(function (resolve) { resolve(mockApt); }),
      });

      const res = await request(app)
        .get(`/api/appointments/${APPOINTMENT_ID}`)
        .set('Authorization', `Bearer ${USER_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 when appointment not found', async () => {
      Appointment.findOne.mockReturnValue({
        populate: jest.fn(function () { return this; }),
        then: jest.fn(function (resolve) { resolve(null); }),
      });

      const res = await request(app)
        .get(`/api/appointments/${MISSING_ID}`)
        .set('Authorization', `Bearer ${USER_TOKEN}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Không tìm thấy lịch hẹn');
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app).get(`/api/appointments/${APPOINTMENT_ID}`);

      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/appointments/:id/cancel', () => {
    it('should cancel own appointment', async () => {
      Appointment.findOne.mockResolvedValue(createMockAppointment());

      const res = await request(app)
        .patch(`/api/appointments/${APPOINTMENT_ID}/cancel`)
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ cancelReason: 'Changed mind' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Đã hủy lịch hẹn thành công');
    });

    it('should return 404 when appointment not found', async () => {
      Appointment.findOne.mockResolvedValue(null);

      const res = await request(app)
        .patch(`/api/appointments/${MISSING_ID}/cancel`)
        .set('Authorization', `Bearer ${USER_TOKEN}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Không tìm thấy lịch hẹn');
    });

    it('should return 400 when transition is invalid', async () => {
      Appointment.findOne.mockResolvedValue(
        createMockAppointment({ canTransitionTo: jest.fn(() => false) })
      );

      const res = await request(app)
        .patch(`/api/appointments/${APPOINTMENT_ID}/cancel`)
        .set('Authorization', `Bearer ${USER_TOKEN}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Không thể hủy lịch hẹn');
    });

    it('should return 400 when 24-hour rule applies', async () => {
      Appointment.findOne.mockResolvedValue(
        createMockAppointment({ canBeCancelled: jest.fn(() => false) })
      );

      const res = await request(app)
        .patch(`/api/appointments/${APPOINTMENT_ID}/cancel`)
        .set('Authorization', `Bearer ${USER_TOKEN}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Không thể hủy lịch hẹn trong vòng 24 giờ');
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app).patch(`/api/appointments/${APPOINTMENT_ID}/cancel`);

      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/appointments/admin/:id/status', () => {
    it('should update appointment status as admin', async () => {
      Appointment.findById.mockResolvedValue(createMockAppointment());

      const res = await request(app)
        .patch(`/api/appointments/admin/${APPOINTMENT_ID}/status`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ status: 'confirmed' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Đã xác nhận lịch hẹn');
    });

    it('should return 400 when status is missing', async () => {
      const res = await request(app)
        .patch(`/api/appointments/admin/${APPOINTMENT_ID}/status`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Trạng thái là bắt buộc');
    });

    it('should return 404 when appointment not found', async () => {
      Appointment.findById.mockResolvedValue(null);

      const res = await request(app)
        .patch(`/api/appointments/admin/${MISSING_ID}/status`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ status: 'confirmed' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Không tìm thấy lịch hẹn');
    });

    it('should return 400 for invalid transition', async () => {
      Appointment.findById.mockResolvedValue(
        createMockAppointment({ canTransitionTo: jest.fn(() => false) })
      );
      Appointment.getValidTransitions.mockReturnValue([]);

      const res = await request(app)
        .patch(`/api/appointments/admin/${APPOINTMENT_ID}/status`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ status: 'completed' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .patch(`/api/appointments/admin/${APPOINTMENT_ID}/status`)
        .send({ status: 'confirmed' });

      expect(res.status).toBe(401);
    });

    it('should return 403 for non-admin user', async () => {
      const res = await request(app)
        .patch(`/api/appointments/admin/${APPOINTMENT_ID}/status`)
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ status: 'confirmed' });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/appointments/admin/all', () => {
    it('should return all appointments for admin', async () => {
      Appointment.find.mockReturnValue(chainableFind([createMockAppointment()]));
      Appointment.countDocuments.mockResolvedValue(1);

      const res = await request(app)
        .get('/api/appointments/admin/all')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.total).toBe(1);
    });

    it('should return 403 for non-admin user', async () => {
      const res = await request(app)
        .get('/api/appointments/admin/all')
        .set('Authorization', `Bearer ${USER_TOKEN}`);

      expect(res.status).toBe(403);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app).get('/api/appointments/admin/all');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/appointments/admin/store/:storeId', () => {
    it('should return appointments by store for admin', async () => {
      Appointment.find.mockReturnValue(chainableFind([createMockAppointment()]));

      const res = await request(app)
        .get(`/api/appointments/admin/store/${STORE_ID}`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 403 for non-admin user', async () => {
      const res = await request(app)
        .get(`/api/appointments/admin/store/${STORE_ID}`)
        .set('Authorization', `Bearer ${USER_TOKEN}`);

      expect(res.status).toBe(403);
    });
  });

  describe('generateTimeSlots', () => {
    const { generateTimeSlots } = require('../controllers/appointmentController');

    it('should return slots within business hours', () => {
      const date = new Date('2099-12-25');
      const slots = generateTimeSlots(mockStore, date, []);
      expect(slots.length).toBeGreaterThan(0);
      expect(slots[0].start).toBe('08:00');
    });

    it('should return empty array when store is closed', () => {
      const date = new Date('2099-12-25');
      const slots = generateTimeSlots(closedStore, date, []);
      expect(slots).toHaveLength(0);
    });

    it('should exclude booked slots', () => {
      const date = new Date('2099-12-25');
      const existing = [{ timeSlot: { start: '08:00' }, status: 'pending' }];
      const slots = generateTimeSlots(mockStore, date, existing);
      expect(slots.some(s => s.start === '08:00')).toBe(false);
      expect(slots.some(s => s.start === '08:30')).toBe(true);
    });
  });
});
