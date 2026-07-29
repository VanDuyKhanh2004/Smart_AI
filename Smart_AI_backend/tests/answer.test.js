const jwt = require('jsonwebtoken');
const request = require('supertest');

const TEST_SECRET = 'test-answer-secret';
process.env.JWT_SECRET = TEST_SECRET;

const ADMIN_ID = '507f191e810c19729de860ea';
const USER_ID = '507f191e810c19729de860eb';
const ADMIN_TOKEN = jwt.sign({ id: ADMIN_ID, email: 'admin@test.com', role: 'admin' }, TEST_SECRET);
const USER_TOKEN = jwt.sign({ id: USER_ID, email: 'user@test.com', role: 'user' }, TEST_SECRET);

const QUESTION_ID = '507f191e810c19729de860e1';
const ANSWER_ID = '507f191e810c19729de860f1';
const MISSING_ID = '507f191e810c19729de860ff';

const mockAdmin = { _id: ADMIN_ID, email: 'admin@test.com', role: 'admin', name: 'Admin' };
const mockUser = { _id: USER_ID, email: 'user@test.com', role: 'user', name: 'User' };

jest.mock('../models/User', () => ({
  findById: jest.fn((id) => {
    if (id === ADMIN_ID) return Promise.resolve(mockAdmin);
    if (id === USER_ID) return Promise.resolve(mockUser);
    return Promise.resolve(null);
  }),
}));

const mockQuestion = {
  _id: QUESTION_ID,
  product: '507f191e810c19729de860e2',
  user: USER_ID,
  questionText: 'This is a valid question?',
  status: 'pending',
  save: jest.fn(function () { return Promise.resolve(this); }),
};

jest.mock('../models/Question', () => ({
  findById: jest.fn(),
}));

jest.mock('../models/Answer', () => {
  const MockAnswer = jest.fn().mockImplementation(function (data) {
    Object.assign(this, data || {});
    this._id = data?._id || ANSWER_ID;
    this.save = jest.fn(function () { return Promise.resolve(this); });
    this.toJSON = jest.fn(function () {
      return {
        _id: this._id, question: this.question, user: this.user,
        answerText: this.answerText, isOfficial: this.isOfficial,
        isAISuggestion: this.isAISuggestion,
      };
    });
    return this;
  });
  MockAnswer.find = jest.fn();
  MockAnswer.findById = jest.fn();
  MockAnswer.findByIdAndDelete = jest.fn();
  MockAnswer.deleteByQuestion = jest.fn();
  return MockAnswer;
});

// Mock aiSuggestionService before qaRoutes import to prevent
// OpenAI client initialization (no OPENAI_API_KEY in CI).
jest.mock('../services/aiSuggestionService', () => ({
  generateAISuggestion: jest.fn(),
}));

const Question = require('../models/Question');
const Answer = require('../models/Answer');
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

const chainableById = (result) => ({
  populate: jest.fn(function () { return this; }),
  then: jest.fn(function (resolve) { resolve(result); }),
});

describe('Answer Controller — centralized error handling', () => {
  let app;

  beforeEach(() => {
    app = buildApp();
    jest.clearAllMocks();
  });

  /* ============================================
   * POST /api/questions/answers (admin only)
   * ============================================ */
  describe('POST /api/questions/answers', () => {
    it('should create an answer and return 201', async () => {
      Question.findById.mockResolvedValue(mockQuestion);
      Answer.findById.mockReturnValue(chainableById({
        _id: ANSWER_ID, question: QUESTION_ID, user: ADMIN_ID,
        answerText: 'This is a valid answer text', isOfficial: true,
      }));

      const res = await request(app)
        .post('/api/questions/answers')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ questionId: QUESTION_ID, answerText: 'This is a valid answer text' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('should return 400 when questionId is missing', async () => {
      const res = await request(app)
        .post('/api/questions/answers')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ answerText: 'This is a valid answer text' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_QUESTION');
    });

    it('should return 400 when questionId is invalid', async () => {
      const res = await request(app)
        .post('/api/questions/answers')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ questionId: 'invalid', answerText: 'This is a valid answer text' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_QUESTION');
    });

    it('should return 404 when question not found', async () => {
      Question.findById.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/questions/answers')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ questionId: QUESTION_ID, answerText: 'This is a valid answer text' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('QUESTION_NOT_FOUND');
    });

    it('should return 400 when answerText is missing', async () => {
      Question.findById.mockResolvedValue(mockQuestion);

      const res = await request(app)
        .post('/api/questions/answers')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ questionId: QUESTION_ID });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('ANSWER_REQUIRED');
    });

    it('should return 400 when answerText is too short', async () => {
      Question.findById.mockResolvedValue(mockQuestion);

      const res = await request(app)
        .post('/api/questions/answers')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ questionId: QUESTION_ID, answerText: 'abc' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('ANSWER_TOO_SHORT');
    });

    it('should return 400 when answerText is too long', async () => {
      Question.findById.mockResolvedValue(mockQuestion);

      const res = await request(app)
        .post('/api/questions/answers')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ questionId: QUESTION_ID, answerText: 'x'.repeat(1001) });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('ANSWER_TOO_LONG');
    });

    it('should return 403 for non-admin users', async () => {
      const res = await request(app)
        .post('/api/questions/answers')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ questionId: QUESTION_ID, answerText: 'This is a valid answer text' });

      expect(res.status).toBe(403);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .post('/api/questions/answers')
        .send({ questionId: QUESTION_ID, answerText: 'This is a valid answer text' });

      expect(res.status).toBe(401);
    });
  });

  /* =================================================
   * DELETE /api/questions/answers/:id (admin only)
   * ================================================= */
  describe('DELETE /api/questions/answers/:id', () => {
    it('should delete an answer and return 200', async () => {
      Answer.findById.mockResolvedValue({
        _id: ANSWER_ID, question: QUESTION_ID, user: ADMIN_ID,
        answerText: 'Some answer', isOfficial: true,
      });
      Answer.findByIdAndDelete.mockResolvedValue(true);

      const res = await request(app)
        .delete(`/api/questions/answers/${ANSWER_ID}`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 for invalid answer id', async () => {
      const res = await request(app)
        .delete('/api/questions/answers/invalid')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_ANSWER');
    });

    it('should return 404 when answer not found', async () => {
      Answer.findById.mockResolvedValue(null);

      const res = await request(app)
        .delete(`/api/questions/answers/${MISSING_ID}`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('ANSWER_NOT_FOUND');
    });

    it('should return 403 for non-admin users', async () => {
      Answer.findById.mockResolvedValue({
        _id: ANSWER_ID, question: QUESTION_ID, user: ADMIN_ID,
        answerText: 'Some answer', isOfficial: true,
      });

      const res = await request(app)
        .delete(`/api/questions/answers/${ANSWER_ID}`)
        .set('Authorization', `Bearer ${USER_TOKEN}`);

      expect(res.status).toBe(403);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .delete(`/api/questions/answers/${ANSWER_ID}`);

      expect(res.status).toBe(401);
    });
  });
});
