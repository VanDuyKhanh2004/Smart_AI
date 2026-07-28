const jwt = require('jsonwebtoken');
const request = require('supertest');

const TEST_SECRET = 'test-complaint-auth-secret-key';
process.env.JWT_SECRET = TEST_SECRET;

const USER_PAYLOAD = { id: '507f191e810c19729de860ea', email: 'user@test.com' };
const ADMIN_PAYLOAD = { id: '507f191e810c19729de860eb', email: 'admin@test.com' };
const USER_TOKEN = jwt.sign(USER_PAYLOAD, TEST_SECRET);
const ADMIN_TOKEN = jwt.sign(ADMIN_PAYLOAD, TEST_SECRET);

const mockUserNonAdmin = {
  _id: USER_PAYLOAD.id,
  email: 'user@test.com',
  role: 'user',
  name: 'Test User',
};
const mockAdmin = {
  _id: ADMIN_PAYLOAD.id,
  email: 'admin@test.com',
  role: 'admin',
  name: 'Admin User',
};

jest.mock('../models/User', () => {
  const mockUserNonAdmin = {
    _id: '507f191e810c19729de860ea',
    email: 'user@test.com',
    role: 'user',
    name: 'Test User',
  };
  const mockAdmin = {
    _id: '507f191e810c19729de860eb',
    email: 'admin@test.com',
    role: 'admin',
    name: 'Admin User',
  };
  return {
    findById: jest.fn((id) => {
      if (id === '507f191e810c19729de860ea') return Promise.resolve(mockUserNonAdmin);
      if (id === '507f191e810c19729de860eb') return Promise.resolve(mockAdmin);
      return Promise.resolve(null);
    }),
  };
});

const mockComplaint = {
  _id: '507f191e810c19729de860ec',
  sessionId: '550e8400-e29b-41d4-a716-446655440000',
  conversationId: '507f191e810c19729de860ed',
  complaintSummary: 'Test complaint',
  status: 'open',
  priority: 'medium',
  toJSON: () => mockComplaint,
};

function queryMock(resolvedValue) {
  const q = Promise.resolve(resolvedValue);
  q.populate = jest.fn().mockReturnValue(q);
  q.sort = jest.fn().mockReturnValue(q);
  q.skip = jest.fn().mockReturnValue(q);
  q.limit = jest.fn().mockReturnValue(q);
  q.lean = jest.fn().mockResolvedValue(resolvedValue);
  return q;
}

jest.mock('../models/Complaint', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndDelete: jest.fn(),
  countDocuments: jest.fn().mockResolvedValue(0),
  aggregate: jest.fn().mockResolvedValue([]),
  getStats: jest.fn().mockResolvedValue({
    totalComplaints: 0,
    openComplaints: 0,
    inProgressComplaints: 0,
    resolvedComplaints: 0,
    closedComplaints: 0,
    avgResolutionTime: null,
  }),
}));

const Complaint = require('../models/Complaint');
const complaintRoutes = require('../routes/complaintRoutes');
const express = require('express');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/complaints', complaintRoutes);
  app.use('*', (req, res) => res.status(404).json({ error: { message: 'Not found' } }));
  return app;
}

describe('Complaint Auth & Authorization', () => {
  let app;
  let spyController;

  beforeAll(() => {
    app = buildApp();
    spyController = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    spyController.mockRestore();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    Complaint.find.mockReturnValue(queryMock([]));
    Complaint.findById.mockReturnValue(queryMock(null));
    Complaint.findByIdAndDelete.mockResolvedValue(null);
    Complaint.countDocuments.mockResolvedValue(0);
    Complaint.aggregate.mockResolvedValue([]);
  });

  const adminOnlyPaths = [
    ['GET', '/api/complaints'],
    ['GET', '/api/complaints/search'],
    ['GET', '/api/complaints/stats'],
    ['GET', '/api/complaints/507f191e810c19729de860ec'],
    ['PUT', '/api/complaints/507f191e810c19729de860ec'],
    ['DELETE', '/api/complaints/507f191e810c19729de860ec'],
    ['PUT', '/api/complaints/507f191e810c19729de860ec/resolve'],
    ['PUT', '/api/complaints/507f191e810c19729de860ec/escalate'],
  ];

  describe('Unauthenticated access returns 401', () => {
    test.each(adminOnlyPaths)('%s %s returns 401 when no token', async (method, path) => {
      const res = await request(app)
        [method.toLowerCase()](path)
        .expect(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Unauthenticated access with invalid token returns 401', () => {
    test.each(adminOnlyPaths)('%s %s returns 401 with invalid token', async (method, path) => {
      const res = await request(app)
        [method.toLowerCase()](path)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });
  });

  describe('Non-admin user cannot access admin-only routes (403)', () => {
    test.each(adminOnlyPaths)('%s %s returns 403 for non-admin user', async (method, path) => {
      const res = await request(app)
        [method.toLowerCase()](path)
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .expect(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Admin can access complaint routes', () => {
    test('GET /api/complaints returns 200 for admin', async () => {
      const res = await request(app)
        .get('/api/complaints')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    test('GET /api/complaints/stats returns 200 for admin', async () => {
      Complaint.aggregate.mockResolvedValue([]);
      Complaint.getStats.mockResolvedValue({
        totalComplaints: 5,
        openComplaints: 2,
        inProgressComplaints: 1,
        resolvedComplaints: 1,
        closedComplaints: 1,
        avgResolutionTime: null,
      });
      const res = await request(app)
        .get('/api/complaints/stats')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    test('GET /api/complaints/search returns 200 for admin', async () => {
      const res = await request(app)
        .get('/api/complaints/search?q=test')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    test('GET /api/complaints/:id returns 200 for admin when found', async () => {
      Complaint.findById.mockReturnValue(queryMock(mockComplaint));
      const res = await request(app)
        .get('/api/complaints/507f191e810c19729de860ec')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    test('PUT /api/complaints/:id returns 200 for admin when found', async () => {
      const saveMock = jest.fn().mockResolvedValue({ ...mockComplaint, status: 'resolved' });
      Complaint.findById.mockResolvedValue({ ...mockComplaint, save: saveMock });
      const res = await request(app)
        .put('/api/complaints/507f191e810c19729de860ec')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ status: 'resolved' })
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    test('DELETE /api/complaints/:id returns 200 for admin when found', async () => {
      Complaint.findByIdAndDelete.mockResolvedValue(mockComplaint);
      const res = await request(app)
        .delete('/api/complaints/507f191e810c19729de860ec')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    test('PUT /api/complaints/:id/resolve returns 200 for admin when found', async () => {
      const resolveMethod = jest.fn().mockResolvedValue({ ...mockComplaint, status: 'resolved' });
      Complaint.findById.mockResolvedValue({ ...mockComplaint, resolve: resolveMethod });
      const res = await request(app)
        .put('/api/complaints/507f191e810c19729de860ec/resolve')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ resolutionNotes: 'Resolved' })
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    test('PUT /api/complaints/:id/escalate returns 200 for admin when found', async () => {
      const escalateMethod = jest.fn().mockResolvedValue({ ...mockComplaint, priority: 'high' });
      Complaint.findById.mockResolvedValue({ ...mockComplaint, escalate: escalateMethod, metadata: { escalationLevel: 0 } });
      const res = await request(app)
        .put('/api/complaints/507f191e810c19729de860ec/escalate')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .expect(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Side-effect safety — denied requests do not call controller methods', () => {
    test('non-admin user triggers no Complaint model calls', async () => {
      await request(app)
        .get('/api/complaints')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .expect(403);

      expect(Complaint.find).not.toHaveBeenCalled();
      expect(Complaint.countDocuments).not.toHaveBeenCalled();
    });

    test('unauthenticated request triggers no Complaint model calls', async () => {
      await request(app)
        .get('/api/complaints')
        .expect(401);

      expect(Complaint.find).not.toHaveBeenCalled();
      expect(Complaint.countDocuments).not.toHaveBeenCalled();
    });
  });

  describe('404 handling for non-existent complaint', () => {
    test('admin gets 404 for non-existent complaint by ID', async () => {
      Complaint.findById.mockReturnValue(queryMock(null));
      const res = await request(app)
        .get('/api/complaints/507f191e810c19729de860ee')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .expect(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('COMPLAINT_NOT_FOUND');
    });
  });
});
