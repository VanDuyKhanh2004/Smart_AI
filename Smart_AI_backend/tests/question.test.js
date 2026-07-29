const jwt = require('jsonwebtoken');
const request = require('supertest');

const TEST_SECRET = 'test-question-secret';
process.env.JWT_SECRET = TEST_SECRET;

const USER_ID = '507f191e810c19729de860ea';
const ADMIN_ID = '507f191e810c19729de860eb';
const OTHER_USER_ID = '507f191e810c19729de860ec';
const USER_TOKEN = jwt.sign({ id: USER_ID, email: 'user@test.com', role: 'user' }, TEST_SECRET);
const ADMIN_TOKEN = jwt.sign({ id: ADMIN_ID, email: 'admin@test.com', role: 'admin' }, TEST_SECRET);
const OTHER_TOKEN = jwt.sign({ id: OTHER_USER_ID, email: 'other@test.com', role: 'user' }, TEST_SECRET);

const PRODUCT_ID = '507f191e810c19729de860e1';
const QUESTION_ID = '507f191e810c19729de860f1';
const MISSING_ID = '507f191e810c19729de860ff';

const mockUser = { _id: USER_ID, email: 'user@test.com', role: 'user', name: 'User' };
const mockAdmin = { _id: ADMIN_ID, email: 'admin@test.com', role: 'admin', name: 'Admin' };
const mockOther = { _id: OTHER_USER_ID, email: 'other@test.com', role: 'user', name: 'Other' };

jest.mock('../models/User', () => ({
  findById: jest.fn((id) => {
    if (id === USER_ID) return Promise.resolve(mockUser);
    if (id === ADMIN_ID) return Promise.resolve(mockAdmin);
    if (id === OTHER_USER_ID) return Promise.resolve(mockOther);
    return Promise.resolve(null);
  }),
}));

const mockProduct = { _id: PRODUCT_ID, name: 'Test Product', image: 'img.jpg', price: 100, toJSON: function () { return { _id: this._id, name: this.name, image: this.image, price: this.price }; } };

jest.mock('../models/Product', () => ({
  findById: jest.fn(),
  find: jest.fn(),
}));

let mockQuestionInstance;

function makeQuestionInstance(overrides = {}) {
  return {
    _id: QUESTION_ID,
    product: PRODUCT_ID,
    user: USER_ID,
    questionText: 'This is a valid question text',
    status: 'pending',
    upvotes: [],
    upvoteCount: 0,
    toJSON: jest.fn(function () { return { _id: this._id, product: this.product, user: this.user, questionText: this.questionText, status: this.status, upvotes: this.upvotes, upvoteCount: this.upvoteCount }; }),
    save: jest.fn(function () { return Promise.resolve(this); }),
    hasUserUpvoted: jest.fn(function () { return false; }),
    toggleUpvote: jest.fn(function () { this.upvoteCount = this.upvotes.length; return Promise.resolve(this); }),
    ...overrides,
  };
}

const mockAnswer = {
  _id: '507f191e810c19729de860f2',
  question: QUESTION_ID,
  user: ADMIN_ID,
  answerText: 'This is an answer',
  isOfficial: true,
  isAISuggestion: false,
  toJSON: jest.fn(function () { return { _id: this._id, answerText: this.answerText, user: this.user }; }),
};

jest.mock('../models/Question', () => {
  const MockQuestion = jest.fn().mockImplementation(function (data) {
    Object.assign(this, data || {});
    this._id = data?._id || '507f191e810c19729de860f1';
    this.save = jest.fn(function () { return Promise.resolve(this); });
    this.toJSON = jest.fn(function () { return { _id: this._id, product: this.product, user: this.user, questionText: this.questionText, status: this.status, upvotes: this.upvotes || [], upvoteCount: this.upvoteCount || 0 }; });
    this.hasUserUpvoted = jest.fn(function () { return false; });
    this.toggleUpvote = jest.fn(function () { this.upvoteCount = (this.upvotes || []).length; return Promise.resolve(this); });
    return this;
  });
  MockQuestion.find = jest.fn();
  MockQuestion.findById = jest.fn();
  MockQuestion.findByIdAndDelete = jest.fn();
  MockQuestion.countDocuments = jest.fn();
  return MockQuestion;
});

jest.mock('../models/Answer', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  deleteByQuestion: jest.fn(),
}));

jest.mock('../services/aiSuggestionService', () => ({
  generateAISuggestion: jest.fn(),
}));

const Question = require('../models/Question');
const Answer = require('../models/Answer');
const Product = require('../models/Product');
const { generateAISuggestion } = require('../services/aiSuggestionService');
const qaRoutes = require('../routes/qaRoutes');
const errorHandler = require('../middlewares/errorHandler');
const express = require('express');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/questions', qaRoutes);
  app.use(errorHandler);
  return app;
}

const chainableFind = (result) => ({
  populate: jest.fn(function () { return this; }),
  sort: jest.fn(function () { return this; }),
  skip: jest.fn(function () { return this; }),
  limit: jest.fn(function () { return this; }),
  then: jest.fn(function (resolve) { resolve(result); }),
});

const chainableFindById = (result) => ({
  populate: jest.fn(function () { return this; }),
  then: jest.fn(function (resolve) { resolve(result); }),
});

describe('Question Controller — centralized error handling', () => {
  let app;

  beforeEach(() => {
    app = buildApp();
    jest.clearAllMocks();
    mockQuestionInstance = makeQuestionInstance();
  });

  /* ==================================
   * POST /api/questions (auth)
   * ================================== */
  describe('POST /api/questions', () => {
    it('should create a question and return 201', async () => {
      Product.findById.mockResolvedValue(mockProduct);
      generateAISuggestion.mockResolvedValue(null);
      Question.findById.mockReturnValue(chainableFindById({ ...mockQuestionInstance.toJSON(), toJSON: function () { return this; } }));
      Answer.findById.mockReturnValue(chainableFindById(null));

      const res = await request(app)
        .post('/api/questions')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ productId: PRODUCT_ID, questionText: 'This is a valid question text' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('should return 400 when productId is invalid', async () => {
      const res = await request(app)
        .post('/api/questions')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ productId: 'invalid', questionText: 'This is a valid question text' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_PRODUCT');
    });

    it('should return 404 when product not found', async () => {
      Product.findById.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/questions')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ productId: PRODUCT_ID, questionText: 'This is a valid question text' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
    });

    it('should return 400 when questionText is missing', async () => {
      Product.findById.mockResolvedValue(mockProduct);

      const res = await request(app)
        .post('/api/questions')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ productId: PRODUCT_ID });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('QUESTION_REQUIRED');
    });

    it('should return 400 when questionText is too short', async () => {
      Product.findById.mockResolvedValue(mockProduct);

      const res = await request(app)
        .post('/api/questions')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ productId: PRODUCT_ID, questionText: 'Short' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('QUESTION_TOO_SHORT');
    });

    it('should return 400 when questionText is too long', async () => {
      Product.findById.mockResolvedValue(mockProduct);

      const res = await request(app)
        .post('/api/questions')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ productId: PRODUCT_ID, questionText: 'x'.repeat(501) });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('QUESTION_TOO_LONG');
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .post('/api/questions')
        .send({ productId: PRODUCT_ID, questionText: 'This is a valid question text' });

      expect(res.status).toBe(401);
    });
  });

  /* ==================================================
   * GET /api/questions/product/:productId (public)
   * ================================================== */
  describe('GET /api/questions/product/:productId', () => {
    it('should return questions for a product', async () => {
      Product.findById.mockResolvedValue(mockProduct);
      const mockQs = [{ ...mockQuestionInstance, toJSON: function () { return { _id: this._id, questionText: this.questionText, upvotes: this.upvotes, upvoteCount: this.upvoteCount }; }, hasUserUpvoted: jest.fn(() => false) }];
      Question.find.mockReturnValue(chainableFind(mockQs));
      Question.countDocuments.mockResolvedValue(1);
      Answer.find.mockReturnValue(chainableFind([]));

      const res = await request(app)
        .get(`/api/questions/product/${PRODUCT_ID}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.questions).toHaveLength(1);
    });

    it('should return 400 when productId is invalid', async () => {
      const res = await request(app)
        .get('/api/questions/product/invalid');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_PRODUCT');
    });

    it('should return 404 when product is not found', async () => {
      Product.findById.mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/questions/product/${PRODUCT_ID}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
    });
  });

  /* =============================================
   * POST /api/questions/:id/upvote (auth)
   * ============================================= */
  describe('POST /api/questions/:id/upvote', () => {
    it('should toggle upvote on a question', async () => {
      Question.findById.mockResolvedValue(mockQuestionInstance);

      const res = await request(app)
        .post(`/api/questions/${QUESTION_ID}/upvote`)
        .set('Authorization', `Bearer ${USER_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.hasUpvoted).toBe(true);
    });

    it('should return 400 for invalid question id', async () => {
      const res = await request(app)
        .post('/api/questions/invalid/upvote')
        .set('Authorization', `Bearer ${USER_TOKEN}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_QUESTION');
    });

    it('should return 404 when question not found', async () => {
      Question.findById.mockResolvedValue(null);

      const res = await request(app)
        .post(`/api/questions/${MISSING_ID}/upvote`)
        .set('Authorization', `Bearer ${USER_TOKEN}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('QUESTION_NOT_FOUND');
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .post(`/api/questions/${QUESTION_ID}/upvote`);

      expect(res.status).toBe(401);
    });
  });

  /* =============================================
   * DELETE /api/questions/:id (auth)
   * ============================================= */
  describe('DELETE /api/questions/:id', () => {
    it('should delete own question', async () => {
      Question.findById.mockResolvedValue(mockQuestionInstance);
      Answer.deleteByQuestion.mockResolvedValue({ deletedCount: 0 });
      Question.findByIdAndDelete.mockResolvedValue(true);

      const res = await request(app)
        .delete(`/api/questions/${QUESTION_ID}`)
        .set('Authorization', `Bearer ${USER_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should allow admin to delete any question', async () => {
      const adminQuestion = makeQuestionInstance({ user: OTHER_USER_ID });
      Question.findById.mockResolvedValue(adminQuestion);
      Answer.deleteByQuestion.mockResolvedValue({ deletedCount: 0 });
      Question.findByIdAndDelete.mockResolvedValue(true);

      const res = await request(app)
        .delete(`/api/questions/${QUESTION_ID}`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 403 when not owner and not admin', async () => {
      const otherQuestion = makeQuestionInstance({ user: OTHER_USER_ID });
      Question.findById.mockResolvedValue(otherQuestion);

      const res = await request(app)
        .delete(`/api/questions/${QUESTION_ID}`)
        .set('Authorization', `Bearer ${USER_TOKEN}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('NOT_OWNER');
    });

    it('should return 400 for invalid question id', async () => {
      const res = await request(app)
        .delete('/api/questions/invalid')
        .set('Authorization', `Bearer ${USER_TOKEN}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_QUESTION');
    });

    it('should return 404 when question not found', async () => {
      Question.findById.mockResolvedValue(null);

      const res = await request(app)
        .delete(`/api/questions/${MISSING_ID}`)
        .set('Authorization', `Bearer ${USER_TOKEN}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('QUESTION_NOT_FOUND');
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .delete(`/api/questions/${QUESTION_ID}`);

      expect(res.status).toBe(401);
    });
  });

  /* =============================================
   * GET /api/questions/admin (auth + admin)
   * ============================================= */
  describe('GET /api/questions/admin', () => {
    it('should return all questions for admin', async () => {
      const mockQs = [{ ...mockQuestionInstance, toJSON: function () { return { _id: this._id, questionText: this.questionText, status: this.status }; } }];
      Question.find.mockReturnValue(chainableFind(mockQs));
      Question.countDocuments.mockResolvedValue(1);
      Answer.find.mockReturnValue(chainableFind([]));

      const res = await request(app)
        .get('/api/questions/admin')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.questions).toHaveLength(1);
    });

    it('should return 403 for non-admin users', async () => {
      const res = await request(app)
        .get('/api/questions/admin')
        .set('Authorization', `Bearer ${USER_TOKEN}`);

      expect(res.status).toBe(403);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app).get('/api/questions/admin');

      expect(res.status).toBe(401);
    });
  });

  /* =============================================
   * PUT /api/questions/admin/:id/status (auth + admin)
   * ============================================= */
  describe('PUT /api/questions/admin/:id/status', () => {
    it('should update question status', async () => {
      Question.findById
        .mockResolvedValueOnce(mockQuestionInstance)
        .mockReturnValueOnce(chainableFindById({ ...mockQuestionInstance.toJSON(), status: 'approved' }));

      const res = await request(app)
        .put(`/api/questions/admin/${QUESTION_ID}/status`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ status: 'approved' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 for invalid question id', async () => {
      const res = await request(app)
        .put('/api/questions/admin/invalid/status')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ status: 'approved' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_QUESTION');
    });

    it('should return 400 for invalid status value', async () => {
      const res = await request(app)
        .put(`/api/questions/admin/${QUESTION_ID}/status`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ status: 'invalid-status' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS');
    });

    it('should return 404 when question not found', async () => {
      Question.findById.mockResolvedValue(null);

      const res = await request(app)
        .put(`/api/questions/admin/${MISSING_ID}/status`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ status: 'approved' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('QUESTION_NOT_FOUND');
    });

    it('should return 403 for non-admin users', async () => {
      const res = await request(app)
        .put(`/api/questions/admin/${QUESTION_ID}/status`)
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ status: 'approved' });

      expect(res.status).toBe(403);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .put(`/api/questions/admin/${QUESTION_ID}/status`)
        .send({ status: 'approved' });

      expect(res.status).toBe(401);
    });
  });
});
