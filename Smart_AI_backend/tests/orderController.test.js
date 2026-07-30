const mockEnqueueOrderConfirmationEmail = jest.fn().mockResolvedValue();
const mockCacheDel = jest.fn().mockResolvedValue();
const mockCacheInvalidatePattern = jest.fn().mockResolvedValue(0);

jest.mock('../services/emailQueueService', () => ({
  enqueueOrderConfirmationEmail: mockEnqueueOrderConfirmationEmail,
}));

jest.mock('../services/cacheService', () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: mockCacheDel,
  exists: jest.fn(),
  invalidatePattern: mockCacheInvalidatePattern,
}));

jest.mock('pino', () => {
  const mockInstance = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(() => mockInstance),
  };
  return jest.fn(() => mockInstance);
});

const mockSession = {
  startTransaction: jest.fn(),
  commitTransaction: jest.fn().mockResolvedValue(),
  abortTransaction: jest.fn().mockResolvedValue(),
  endSession: jest.fn().mockResolvedValue(),
};

jest.mock('mongoose', () => ({
  startSession: jest.fn().mockResolvedValue(mockSession),
  Types: {
    ObjectId: {
      isValid: jest.fn().mockReturnValue(true),
    },
  },
}));

const mockOrderSave = jest.fn().mockResolvedValue();
const mockOrderAddStatusHistory = jest.fn();

jest.mock('../models/Order', () => {
  const MockOrder = jest.fn().mockImplementation((data) => ({
    ...data,
    _id: 'order-123',
    save: mockOrderSave,
    addStatusHistory: mockOrderAddStatusHistory,
    statusHistory: [],
  }));
  MockOrder.generateOrderNumber = jest.fn().mockResolvedValue('ORD-20241209-001');
  MockOrder.findById = jest.fn();
  MockOrder.find = jest.fn();
  MockOrder.countDocuments = jest.fn();
  MockOrder.aggregate = jest.fn();
  return MockOrder;
});

const mockCartSave = jest.fn().mockResolvedValue();

jest.mock('../models/Cart', () => {
  const MockCart = {
    findOne: jest.fn().mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      session: jest.fn().mockResolvedValue(null),
      catch: jest.fn().mockResolvedValue(null),
    }),
  };
  return MockCart;
});

const mockProductFindByIdAndUpdate = jest.fn().mockResolvedValue({});

jest.mock('../models/Product', () => {
  const MockProduct = jest.fn();
  MockProduct.findByIdAndUpdate = mockProductFindByIdAndUpdate;
  MockProduct.find = jest.fn();
  MockProduct.findById = jest.fn();
  MockProduct.findOne = jest.fn();
  return MockProduct;
});

jest.mock('../models/Promotion', () => {
  const MockPromotion = jest.fn();
  MockPromotion.findOne = jest.fn();
  MockPromotion.findOneAndUpdate = jest.fn().mockResolvedValue({});
  return MockPromotion;
});

jest.mock('../utils/checkoutFingerprint', () => ({
  computeRequestFingerprint: jest.fn().mockReturnValue('request-fingerprint-hash'),
  computeCheckoutFingerprint: jest.fn().mockReturnValue('checkout-fingerprint-hash'),
}));

const mockIdempotencySave = jest.fn().mockResolvedValue();
const mockIdempotencyFindByIdAndUpdate = jest.fn().mockResolvedValue({});
const mockIdempotencyFindOneAndUpdate = jest.fn().mockResolvedValue({ _id: 'idempotency-123', status: 'processing', attemptId: 'mock-attempt' });

jest.mock('../models/IdempotencyRecord', () => {
  const MockIdempotencyRecord = jest.fn().mockImplementation((data) => ({
    ...data,
    _id: 'idempotency-123',
    save: mockIdempotencySave,
  }));
  MockIdempotencyRecord.findOne = jest.fn().mockResolvedValue(null);
  MockIdempotencyRecord.create = jest.fn().mockImplementation((data) =>
    Promise.resolve({ ...data, _id: 'idempotency-123', save: mockIdempotencySave })
  );
  MockIdempotencyRecord.findOneAndUpdate = mockIdempotencyFindOneAndUpdate;
  MockIdempotencyRecord.findByIdAndUpdate = mockIdempotencyFindByIdAndUpdate;
  MockIdempotencyRecord.ttlMs = jest.fn(() => 168 * 60 * 60 * 1000);
  MockIdempotencyRecord.processingTimeoutMs = jest.fn(() => 30000);
  return MockIdempotencyRecord;
});

const mongoose = require('mongoose');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const Promotion = require('../models/Promotion');
const cache = require('../services/cacheService');
const IdempotencyRecord = require('../models/IdempotencyRecord');
const { computeRequestFingerprint, computeCheckoutFingerprint } = require('../utils/checkoutFingerprint');
const logger = require('../utils/logger');
const {
  createOrder,
  cancelOrder,
  updateOrderStatus,
  getUserOrders,
  getOrderById,
  getAllOrders,
  getOrderStats,
} = require('../controllers/orderController');

const { AppError, BadRequestError, NotFoundError, ForbiddenError, ConflictError } = require('../utils/errors');

const mockJson = jest.fn();
const mockSet = jest.fn().mockReturnValue({ json: mockJson });
const mockStatus = jest.fn().mockReturnValue({ json: mockJson, set: mockSet });
function mockRes() {
  return { status: mockStatus, json: mockJson, set: mockSet };
}

function defaultCartDoc() {
  return {
    _id: 'cart-123',
    user: 'user-123',
    items: [
      {
        _id: 'cart-item-1',
        product: {
          _id: 'product-1',
          name: 'Test Product',
          price: 500000,
          inStock: 10,
          image: 'test.jpg',
          isActive: true,
        },
        quantity: 2,
        color: 'Black',
      },
      {
        _id: 'cart-item-2',
        product: {
          _id: 'product-2',
          name: 'Second Product',
          price: 300000,
          inStock: 5,
          image: 'test2.jpg',
          isActive: true,
        },
        quantity: 1,
        color: 'White',
      },
    ],
    save: mockCartSave,
  };
}

function defaultPromotionDoc(overrides = {}) {
  return {
    _id: 'promo-1',
    code: 'TEST10',
    discountType: 'percentage',
    discountValue: 10,
    minOrderValue: 0,
    maxDiscountAmount: null,
    usageLimit: 100,
    usedCount: 0,
    startDate: new Date('2024-01-01'),
    endDate: new Date('2030-12-31'),
    isActive: true,
    ...overrides,
  };
}

function defaultPopulatedOrder(overrides = {}) {
  return {
    _id: 'order-123',
    orderNumber: 'ORD-20241209-001',
    user: { name: 'Test User', email: 'test@test.com', _id: 'user-123' },
    items: [
      {
        product: 'product-1',
        name: 'Test Product',
        price: 500000,
        quantity: 2,
        color: 'Black',
        image: 'test.jpg',
      },
      {
        product: 'product-2',
        name: 'Second Product',
        price: 300000,
        quantity: 1,
        color: 'White',
        image: 'test2.jpg',
      },
    ],
    shippingAddress: {
      fullName: 'Test User',
      phone: '0123456789',
      address: '123 Test St',
      ward: 'Test Ward',
      district: 'Test District',
      city: 'Test City',
    },
    subtotal: 1300000,
    shippingFee: 30000,
    total: 1330000,
    status: 'pending',
    createdAt: new Date(),
    statusHistory: [],
    ...overrides,
  };
}

function defaultOrderDoc(overrides = {}) {
  return {
    _id: 'order-123',
    user: 'user-123',
    orderNumber: 'ORD-20241209-001',
    items: [
      { product: 'product-1', name: 'Test Product', price: 500000, quantity: 2, color: 'Black', image: 'test.jpg' },
      { product: 'product-2', name: 'Second Product', price: 300000, quantity: 1, color: 'White', image: 'test2.jpg' },
    ],
    shippingAddress: {
      fullName: 'Test User',
      phone: '0123456789',
      address: '123 Test St',
      ward: 'Test Ward',
      district: 'Test District',
      city: 'Test City',
    },
    subtotal: 1300000,
    shippingFee: 30000,
    total: 1330000,
    status: 'pending',
    save: mockOrderSave,
    addStatusHistory: mockOrderAddStatusHistory,
    statusHistory: [],
    cancelledAt: undefined,
    cancelReason: undefined,
    confirmedAt: undefined,
    shippedAt: undefined,
    deliveredAt: undefined,
    ...overrides,
  };
}

function setupCartFindOne(cartDoc) {
  Cart.findOne.mockReturnValue({
    populate: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    session: jest.fn().mockResolvedValue(cartDoc),
    catch: jest.fn().mockResolvedValue(null),
  });
}

function setupOrderFindByIdForCancel(orderDoc) {
  Order.findById.mockReturnValue({
    session: jest.fn().mockResolvedValue(orderDoc),
    populate: jest.fn().mockResolvedValue(defaultPopulatedOrder()),
  });
}

function setupOrderFindByIdForStatus(orderDoc) {
  Order.findById.mockReturnValue({
    session: jest.fn().mockResolvedValue(orderDoc),
    populate: jest.fn().mockResolvedValue({
      ...defaultPopulatedOrder(),
      status: orderDoc.status,
    }),
  });
}

function setupOrderFindByIdForCreate(populatedOrder) {
  Order.findById.mockReturnValue({
    populate: jest.fn().mockResolvedValue(populatedOrder || defaultPopulatedOrder()),
    session: jest.fn().mockResolvedValue(null),
  });
}

function defaultIdempotencyRecord(overrides = {}) {
  return {
    _id: 'idempotency-123',
    user: 'user-123',
    idempotencyKey: '11111111-1111-4111-8111-111111111111',
    requestFingerprint: 'request-fingerprint-hash',
    status: 'processing',
    attemptId: 'test-attempt-id',
    processingExpiresAt: new Date(Date.now() + 30000),
    errorCode: null,
    order: null,
    responseStatus: null,
    responseOrderNumber: null,
    errorMessage: null,
    expiresAt: new Date(Date.now() + IdempotencyRecord.ttlMs()),
    save: mockIdempotencySave,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSession.startTransaction.mockReset();
  mockSession.commitTransaction.mockReset();
  mockSession.abortTransaction.mockReset();
  mockSession.endSession.mockReset();
  mockSession.startTransaction.mockReturnValue();
  mockSession.commitTransaction.mockResolvedValue();
  mockSession.abortTransaction.mockResolvedValue();
  mockSession.endSession.mockResolvedValue();
  mongoose.Types.ObjectId.isValid.mockReturnValue(true);
  mockOrderSave.mockResolvedValue();
  mockOrderAddStatusHistory.mockReset();
  mockProductFindByIdAndUpdate.mockResolvedValue({});
  mockSet.mockReturnValue({ json: mockJson });
  mockIdempotencySave.mockResolvedValue();
  mockIdempotencyFindByIdAndUpdate.mockResolvedValue({});
  mockIdempotencyFindOneAndUpdate.mockReset();
  mockIdempotencyFindOneAndUpdate.mockResolvedValue({ _id: 'idempotency-123', status: 'processing', attemptId: 'mock-attempt' });
  IdempotencyRecord.findOne.mockResolvedValue(null);
  IdempotencyRecord.create.mockImplementation((data) =>
    Promise.resolve({ ...data, _id: 'idempotency-123', save: mockIdempotencySave })
  );
  IdempotencyRecord.ttlMs.mockReturnValue(168 * 60 * 60 * 1000);
  IdempotencyRecord.processingTimeoutMs.mockReturnValue(30000);
  computeRequestFingerprint.mockReturnValue('request-fingerprint-hash');
  computeCheckoutFingerprint.mockReturnValue('checkout-fingerprint-hash');
});

describe('createOrder', () => {
  const validShippingAddress = {
    fullName: 'Test User',
    phone: '0123456789',
    address: '123 Test St',
    ward: 'Test Ward',
    district: 'Test District',
    city: 'Test City',
  };

  function makeReq(overrides = {}) {
    const { body: bodyOverride, ...rest } = overrides;
    return {
      body: { shippingAddress: validShippingAddress, ...bodyOverride },
      user: { _id: 'user-123', name: 'Test User', email: 'test@test.com', role: 'user' },
      requestId: 'test-cid',
      headers: {},
      ...rest,
    };
  }

  function makeIdempotentReq(overrides = {}) {
    const { body: bodyOverride, ...rest } = overrides;
    return makeReq({
      body: bodyOverride,
      headers: { 'idempotency-key': '11111111-1111-4111-8111-111111111111' },
      ...rest,
    });
  }

  describe('idempotency', () => {
    it('first request succeeds and creates processing then completed record', async () => {
      setupCartFindOne(defaultCartDoc());
      setupOrderFindByIdForCreate();

      const next = jest.fn(); await createOrder(makeIdempotentReq(), mockRes(), next);

      expect(IdempotencyRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user: 'user-123',
          idempotencyKey: '11111111-1111-4111-8111-111111111111',
          requestFingerprint: 'request-fingerprint-hash',
          status: 'processing',
          attemptId: expect.any(String),
          processingExpiresAt: expect.any(Date),
          expiresAt: expect.any(Date),
        })
      );
      expect(mockIdempotencyFindOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'idempotency-123', attemptId: expect.any(String), status: 'processing', requestFingerprint: 'request-fingerprint-hash', checkoutFingerprint: 'checkout-fingerprint-hash' },
        { $set: expect.objectContaining({ status: 'completed', responseStatus: 201 }) },
        { session: mockSession }
      );
      expect(mockStatus).toHaveBeenCalledWith(201);
    });

    it('replay returns existing order (200, not 201)', async () => {
      const completedRecord = defaultIdempotencyRecord({
        status: 'completed',
        order: 'order-123',
        responseOrderNumber: 'ORD-20241209-001',
      });
      IdempotencyRecord.findOne.mockResolvedValue(completedRecord);
      setupOrderFindByIdForCreate();

      const next = jest.fn(); await createOrder(makeIdempotentReq(), mockRes(), next);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ orderNumber: 'ORD-20241209-001' }),
        })
      );
    });

    it('replay returns Idempotent-Replay header', async () => {
      const completedRecord = defaultIdempotencyRecord({
        status: 'completed',
        order: 'order-123',
        responseOrderNumber: 'ORD-20241209-001',
      });
      IdempotencyRecord.findOne.mockResolvedValue(completedRecord);
      setupOrderFindByIdForCreate();

      const next = jest.fn(); await createOrder(makeIdempotentReq(), mockRes(), next);

      expect(mockSet).toHaveBeenCalledWith('Idempotent-Replay', 'true');
    });

    it('replay does not create duplicate order or stock decrement or email', async () => {
      const completedRecord = defaultIdempotencyRecord({
        status: 'completed',
        order: 'order-123',
        responseOrderNumber: 'ORD-20241209-001',
      });
      IdempotencyRecord.findOne.mockResolvedValue(completedRecord);
      setupOrderFindByIdForCreate();

      const next = jest.fn(); await createOrder(makeIdempotentReq(), mockRes(), next);

      expect(Order).not.toHaveBeenCalled();
      expect(mockProductFindByIdAndUpdate).not.toHaveBeenCalled();
      expect(Promotion.findOneAndUpdate).not.toHaveBeenCalled();
      expect(mockEnqueueOrderConfirmationEmail).not.toHaveBeenCalled();
      expect(mockSession.commitTransaction).not.toHaveBeenCalled();
    });

    it('completed replay with mismatched requestFingerprint returns 422', async () => {
      const completedRecord = defaultIdempotencyRecord({
        status: 'completed',
        requestFingerprint: 'different-fingerprint',
        order: 'order-123',
        responseOrderNumber: 'ORD-20241209-001',
      });
      IdempotencyRecord.findOne.mockResolvedValue(completedRecord);

      const next = jest.fn(); await createOrder(makeIdempotentReq(), mockRes(), next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 422, code: 'IDEMPOTENCY_KEY_MISMATCH' })
      );
    });

    it('completed replay with matching requestFingerprint returns 200', async () => {
      const completedRecord = defaultIdempotencyRecord({
        status: 'completed',
        order: 'order-123',
        responseOrderNumber: 'ORD-20241209-001',
      });
      IdempotencyRecord.findOne.mockResolvedValue(completedRecord);
      setupOrderFindByIdForCreate();

      const next = jest.fn(); await createOrder(makeIdempotentReq(), mockRes(), next);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockSet).toHaveBeenCalledWith('Idempotent-Replay', 'true');
      expect(next).not.toHaveBeenCalled();
    });

    it('replay returns 410 when original order is gone', async () => {
      const completedRecord = defaultIdempotencyRecord({
        status: 'completed',
        order: 'order-123',
        responseOrderNumber: 'ORD-20241209-001',
      });
      IdempotencyRecord.findOne.mockResolvedValue(completedRecord);
      Order.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(null),
        session: jest.fn().mockResolvedValue(null),
      });

      const next = jest.fn(); await createOrder(makeIdempotentReq(), mockRes(), next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 410, code: 'IDEMPOTENT_ORDER_GONE' })
      );
    });

    it('processing record returns 409 with Retry-After', async () => {
      const processingRecord = defaultIdempotencyRecord({ status: 'processing' });
      IdempotencyRecord.findOne.mockResolvedValue(processingRecord);

      const next = jest.fn(); await createOrder(makeIdempotentReq(), mockRes(), next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 409, code: 'IDEMPOTENCY_IN_PROGRESS' })
      );
    });

    it('retry after failed (matching fingerprint) creates new order', async () => {
      const failedRecord = defaultIdempotencyRecord({
        status: 'failed',
        errorMessage: 'Previous failure',
      });
      IdempotencyRecord.findOne.mockResolvedValue(failedRecord);
      setupCartFindOne(defaultCartDoc());
      setupOrderFindByIdForCreate();

      const next = jest.fn(); await createOrder(makeIdempotentReq(), mockRes(), next);

      expect(mockIdempotencyFindOneAndUpdate).toHaveBeenNthCalledWith(
        1,
        { _id: 'idempotency-123', status: 'failed', requestFingerprint: 'request-fingerprint-hash' },
        { $set: expect.objectContaining({ status: 'processing', attemptId: expect.any(String), processingExpiresAt: expect.any(Date), checkoutFingerprint: null }) },
        { new: true }
      );
      expect(mockStatus).toHaveBeenCalledWith(201);
      expect(mockIdempotencyFindOneAndUpdate).toHaveBeenLastCalledWith(
        { _id: 'idempotency-123', attemptId: expect.any(String), status: 'processing', requestFingerprint: 'request-fingerprint-hash', checkoutFingerprint: 'checkout-fingerprint-hash' },
        { $set: expect.objectContaining({ status: 'completed' }) },
        { session: mockSession }
      );
    });

    it('fingerprint mismatch on failed record returns 422', async () => {
      const failedRecord = defaultIdempotencyRecord({
        status: 'failed',
        requestFingerprint: 'other-fingerprint',
      });
      IdempotencyRecord.findOne.mockResolvedValue(failedRecord);

      const next = jest.fn(); await createOrder(makeIdempotentReq(), mockRes(), next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 422, code: 'IDEMPOTENCY_KEY_MISMATCH' })
      );
    });

    it('missing idempotency key works during soft rollout', async () => {
      setupCartFindOne(defaultCartDoc());
      setupOrderFindByIdForCreate();

      const next = jest.fn(); await createOrder(makeReq(), mockRes(), next);

      expect(logger.warn).toHaveBeenCalledWith('Missing Idempotency-Key header');
      expect(IdempotencyRecord.findOne).not.toHaveBeenCalled();
      expect(mockStatus).toHaveBeenCalledWith(201);
      expect(next).not.toHaveBeenCalled();
    });

    it('invalid UUID format returns 400', async () => {
      const req = makeIdempotentReq({ headers: { 'idempotency-key': 'not-a-uuid' } });

      const next = jest.fn(); await createOrder(req, mockRes(), next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400, code: 'INVALID_IDEMPOTENCY_KEY' })
      );
    });

    it('duplicate create race condition returns 409', async () => {
      IdempotencyRecord.findOne.mockResolvedValue(null);
      IdempotencyRecord.create.mockRejectedValue({ code: 11000, message: 'Duplicate key' });

      const next = jest.fn(); await createOrder(makeIdempotentReq(), mockRes(), next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 409, code: 'IDEMPOTENCY_IN_PROGRESS' })
      );
    });

    it('creates processing record on failed retry before transaction', async () => {
      const failedRecord = defaultIdempotencyRecord({
        status: 'failed',
        errorMessage: 'Previous failure',
      });
      IdempotencyRecord.findOne.mockResolvedValue(failedRecord);
      setupCartFindOne(defaultCartDoc());
      setupOrderFindByIdForCreate();

      const next = jest.fn(); await createOrder(makeIdempotentReq(), mockRes(), next);

      expect(mockIdempotencyFindOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'idempotency-123', status: 'failed', requestFingerprint: 'request-fingerprint-hash' },
        { $set: expect.objectContaining({
          status: 'processing',
          attemptId: expect.any(String),
          processingExpiresAt: expect.any(Date),
          checkoutFingerprint: null,
          errorCode: null,
          errorMessage: null,
          order: null,
          responseStatus: null,
          responseOrderNumber: null,
        })},
        { new: true }
      );
    });

    it('updates to failed on validation error', async () => {
      IdempotencyRecord.findOne.mockResolvedValue(null);
      const req = makeIdempotentReq({ body: { shippingAddress: null } });

      const next = jest.fn(); await createOrder(req, mockRes(), next);

      expect(mockIdempotencyFindOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'idempotency-123', attemptId: expect.any(String), status: 'processing', requestFingerprint: 'request-fingerprint-hash' },
        { $set: expect.objectContaining({ status: 'failed', errorCode: 'INVALID_SHIPPING_ADDRESS' }) }
      );
    });

    it('updates to failed on server error', async () => {
      IdempotencyRecord.findOne.mockResolvedValue(null);
      setupCartFindOne(defaultCartDoc());
      mockOrderSave.mockRejectedValue(new Error('DB error'));

      const next = jest.fn(); await createOrder(makeIdempotentReq(), mockRes(), next);

      expect(mockIdempotencyFindOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'idempotency-123', attemptId: expect.any(String), status: 'processing', requestFingerprint: 'request-fingerprint-hash' },
        { $set: expect.objectContaining({ status: 'failed', errorCode: 'SERVER_ERROR' }) }
      );
    });

    it('stock decremented once on first request', async () => {
      setupCartFindOne(defaultCartDoc());
      setupOrderFindByIdForCreate();

      const next = jest.fn(); await createOrder(makeIdempotentReq(), mockRes(), next);

      expect(mockProductFindByIdAndUpdate).toHaveBeenCalledTimes(2);
    });

    it('email queued once on first request', async () => {
      setupCartFindOne(defaultCartDoc());
      setupOrderFindByIdForCreate();

      const next = jest.fn(); await createOrder(makeIdempotentReq(), mockRes(), next);

      expect(mockEnqueueOrderConfirmationEmail).toHaveBeenCalledTimes(1);
    });

    it('promotion incremented once on first request', async () => {
      setupCartFindOne(defaultCartDoc());
      setupOrderFindByIdForCreate();
      Promotion.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(defaultPromotionDoc()),
      });

      const next = jest.fn(); await createOrder(makeIdempotentReq({ body: { shippingAddress: validShippingAddress, promotionCode: 'TEST10' } }), mockRes(), next);

      expect(Promotion.findOneAndUpdate).toHaveBeenCalledTimes(1);
    });

    it('processingExpiresAt and attemptId set on create', async () => {
      setupCartFindOne(defaultCartDoc());
      setupOrderFindByIdForCreate();

      const next = jest.fn(); await createOrder(makeIdempotentReq(), mockRes(), next);

      expect(IdempotencyRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          attemptId: expect.any(String),
          processingExpiresAt: expect.any(Date),
        })
      );
    });

    it('stale processing record is reclaimed', async () => {
      const staleRecord = defaultIdempotencyRecord({
        status: 'processing',
        processingExpiresAt: new Date(Date.now() - 1000),
      });
      IdempotencyRecord.findOne.mockResolvedValue(staleRecord);
      setupCartFindOne(defaultCartDoc());
      setupOrderFindByIdForCreate();

      const next = jest.fn(); await createOrder(makeIdempotentReq(), mockRes(), next);

      expect(mockIdempotencyFindOneAndUpdate).toHaveBeenNthCalledWith(
        1,
        { _id: 'idempotency-123', status: 'processing', requestFingerprint: 'request-fingerprint-hash', $or: [{ processingExpiresAt: null }, { processingExpiresAt: { $lte: expect.any(Date) } }] },
        { $set: expect.objectContaining({ attemptId: expect.any(String), processingExpiresAt: expect.any(Date), checkoutFingerprint: null }) },
        { new: true }
      );
      expect(mockIdempotencyFindOneAndUpdate).toHaveBeenLastCalledWith(
        { _id: 'idempotency-123', attemptId: expect.any(String), status: 'processing', requestFingerprint: 'request-fingerprint-hash', checkoutFingerprint: 'checkout-fingerprint-hash' },
        { $set: expect.objectContaining({ status: 'completed' }) },
        { session: mockSession }
      );
      expect(mockStatus).toHaveBeenCalledWith(201);
    });

    it('non-stale processing record returns 409 (not reclaimed)', async () => {
      const freshRecord = defaultIdempotencyRecord({
        status: 'processing',
        processingExpiresAt: new Date(Date.now() + 60000),
      });
      IdempotencyRecord.findOne.mockResolvedValue(freshRecord);

      const next = jest.fn(); await createOrder(makeIdempotentReq(), mockRes(), next);

      expect(mockIdempotencyFindOneAndUpdate).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 409, code: 'IDEMPOTENCY_IN_PROGRESS' })
      );
    });

    it('ttlMs uses CHECKOUT_IDEMPOTENCY_TTL_HOURS env var default', async () => {
      const orig = process.env.CHECKOUT_IDEMPOTENCY_TTL_HOURS;
      delete process.env.CHECKOUT_IDEMPOTENCY_TTL_HOURS;

      const ttl = IdempotencyRecord.ttlMs();

      expect(ttl).toBe(168 * 60 * 60 * 1000);
      process.env.CHECKOUT_IDEMPOTENCY_TTL_HOURS = orig;
    });

    it('processingTimeoutMs uses CHECKOUT_IDEMPOTENCY_PROCESSING_TIMEOUT_MS env var default', async () => {
      const orig = process.env.CHECKOUT_IDEMPOTENCY_PROCESSING_TIMEOUT_MS;
      delete process.env.CHECKOUT_IDEMPOTENCY_PROCESSING_TIMEOUT_MS;

      const timeout = IdempotencyRecord.processingTimeoutMs();

      expect(timeout).toBe(30000);
      process.env.CHECKOUT_IDEMPOTENCY_PROCESSING_TIMEOUT_MS = orig;
    });

    it('atomic completion inside transaction via findOneAndUpdate with session', async () => {
      setupCartFindOne(defaultCartDoc());
      setupOrderFindByIdForCreate();

      const next = jest.fn(); await createOrder(makeIdempotentReq(), mockRes(), next);

      const call = mockIdempotencyFindOneAndUpdate.mock.calls.find(
        ([filter]) => filter?.status === 'completed' || (filter && filter.status === 'completed')
      );
      // The completion call should have session
      const completionCalls = mockIdempotencyFindOneAndUpdate.mock.calls.filter(
        ([, update]) => update?.$set?.status === 'completed'
      );
      expect(completionCalls.length).toBe(1);
      expect(completionCalls[0][2]).toEqual(expect.objectContaining({ session: mockSession }));
    });

    it('fingerprint binding inside transaction sets checkoutFingerprint', async () => {
      setupCartFindOne(defaultCartDoc());
      setupOrderFindByIdForCreate();

      const next = jest.fn(); await createOrder(makeIdempotentReq(), mockRes(), next);

      const bindingCalls = mockIdempotencyFindOneAndUpdate.mock.calls.filter(
        ([, update]) => update?.$set?.checkoutFingerprint !== undefined
      );
      expect(bindingCalls.length).toBe(1);
      expect(bindingCalls[0][0]).toEqual(
        expect.objectContaining({ status: 'processing', attemptId: expect.any(String), requestFingerprint: 'request-fingerprint-hash' })
      );
      expect(bindingCalls[0][1]).toEqual({
        $set: { checkoutFingerprint: 'checkout-fingerprint-hash' },
      });
      expect(bindingCalls[0][2]).toEqual(expect.objectContaining({ session: mockSession }));
    });

    it('fingerprint binding failure aborts transaction', async () => {
      setupCartFindOne(defaultCartDoc());
      setupOrderFindByIdForCreate();
      // Make the binding step fail by returning null for findOneAndUpdate
      mockIdempotencyFindOneAndUpdate.mockResolvedValue(null);

      const next = jest.fn(); await createOrder(makeIdempotentReq(), mockRes(), next);

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockSession.commitTransaction).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 500, code: 'IDEMPOTENCY_CONFLICT' })
      );
    });
  });

  describe('transaction lifecycle', () => {
    it('starts a MongoDB session and transaction', async () => {
      setupCartFindOne(defaultCartDoc());
      setupOrderFindByIdForCreate();

      const next = jest.fn(); await createOrder(makeReq(), mockRes(), next);

      expect(mongoose.startSession).toHaveBeenCalled();
      expect(mockSession.startTransaction).toHaveBeenCalled();
    });

    it('commits the transaction on success', async () => {
      setupCartFindOne(defaultCartDoc());
      setupOrderFindByIdForCreate();

      const next = jest.fn(); await createOrder(makeReq(), mockRes(), next);

      expect(mockSession.commitTransaction).toHaveBeenCalled();
    });

    it('aborts the transaction on validation failure', async () => {
      const req = makeReq({ body: { shippingAddress: null } });

      const next = jest.fn(); await createOrder(req, mockRes(), next);

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockSession.commitTransaction).not.toHaveBeenCalled();
    });

    it('aborts the transaction on error and does not commit', async () => {
      setupCartFindOne(defaultCartDoc());
      mockOrderSave.mockRejectedValue(new Error('DB write error'));

      const next = jest.fn(); await createOrder(makeReq(), mockRes(), next);

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockSession.commitTransaction).not.toHaveBeenCalled();
    });

    it('ends the session in all cases via finally block', async () => {
      setupCartFindOne(defaultCartDoc());
      setupOrderFindByIdForCreate();

      const next = jest.fn(); await createOrder(makeReq(), mockRes(), next);

      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('ends session even after abort', async () => {
      const req = makeReq({ body: { shippingAddress: null } });

      const next = jest.fn(); await createOrder(req, mockRes(), next);

      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('ends session even on error', async () => {
      setupCartFindOne(defaultCartDoc());
      mockOrderSave.mockRejectedValue(new Error('DB write error'));

      const next = jest.fn(); await createOrder(makeReq(), mockRes(), next);

      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('does not enqueue email when transaction is aborted', async () => {
      setupCartFindOne(defaultCartDoc());
      mockOrderSave.mockRejectedValue(new Error('DB write error'));

      const next = jest.fn(); await createOrder(makeReq(), mockRes(), next);

      expect(mockEnqueueOrderConfirmationEmail).not.toHaveBeenCalled();
    });
  });

  describe('validation — shipping address', () => {
    it('rejects missing shipping address with 400', async () => {
      const req = makeReq({ body: { shippingAddress: null } });

      const next = jest.fn(); await createOrder(req, mockRes(), next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400, code: 'INVALID_SHIPPING_ADDRESS' })
      );
    });

    it('rejects missing required shipping address fields', async () => {
      for (const field of ['fullName', 'phone', 'address', 'ward', 'district', 'city']) {
        const addr = { ...validShippingAddress };
        delete addr[field];
        const req = makeReq({ body: { shippingAddress: addr } });

        const next = jest.fn(); await createOrder(req, mockRes(), next);

        expect(next).toHaveBeenCalledWith(
          expect.objectContaining({ statusCode: 400, code: 'INVALID_SHIPPING_ADDRESS' })
        );
      }
    });

    it('rejects invalid phone format', async () => {
      const req = makeReq({ body: { shippingAddress: { ...validShippingAddress, phone: '123' } } });

      const next = jest.fn(); await createOrder(req, mockRes(), next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400, code: 'INVALID_SHIPPING_ADDRESS' })
      );
    });
  });

  describe('validation — cart and products', () => {
    it('rejects empty cart with 400', async () => {
      setupCartFindOne(defaultCartDoc());
      Cart.findOne.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        session: jest.fn().mockResolvedValue(null),
      });

      const next = jest.fn(); await createOrder(makeReq(), mockRes(), next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400, code: 'CART_EMPTY' })
      );
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('rejects empty items array', async () => {
      setupCartFindOne({ ...defaultCartDoc(), items: [] });

      const next = jest.fn(); await createOrder(makeReq(), mockRes(), next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400, code: 'CART_EMPTY' })
      );
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('rejects cart item with missing product (null product)', async () => {
      const cartDoc = defaultCartDoc();
      cartDoc.items[0].product = null;
      setupCartFindOne(cartDoc);

      const next = jest.fn(); await createOrder(makeReq(), mockRes(), next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400, code: 'PRODUCT_NOT_FOUND' })
      );
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('rejects cart item with inactive product', async () => {
      const cartDoc = defaultCartDoc();
      cartDoc.items[0].product.isActive = false;
      setupCartFindOne(cartDoc);

      const next = jest.fn(); await createOrder(makeReq(), mockRes(), next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400, code: 'PRODUCT_NOT_FOUND' })
      );
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('rejects insufficient stock', async () => {
      const cartDoc = defaultCartDoc();
      cartDoc.items[0].product.inStock = 1;
      cartDoc.items[0].quantity = 2;
      setupCartFindOne(cartDoc);

      const next = jest.fn(); await createOrder(makeReq(), mockRes(), next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400, code: 'INSUFFICIENT_STOCK' })
      );
      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockProductFindByIdAndUpdate).not.toHaveBeenCalled();
      expect(mockEnqueueOrderConfirmationEmail).not.toHaveBeenCalled();
    });
  });

  describe('pricing integrity', () => {
    it('uses product.price from database, not from request body', async () => {
      setupCartFindOne(defaultCartDoc());
      setupOrderFindByIdForCreate();

      const req = makeReq({ body: { shippingAddress: validShippingAddress, clientPrice: 100 } });

      const next = jest.fn(); await createOrder(req, mockRes(), next);

      expect(Order).toHaveBeenCalledWith(expect.objectContaining({
        subtotal: 1300000,
        total: 1330000,
      }));
      expect(mockStatus).toHaveBeenCalledWith(201);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('calculates correct subtotal from DB prices', async () => {
      setupCartFindOne(defaultCartDoc());
      setupOrderFindByIdForCreate();

      const next = jest.fn(); await createOrder(makeReq(), mockRes(), next);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            subtotal: 500000 * 2 + 300000 * 1,
          }),
        })
      );
    });

    it('includes shipping fee in total', async () => {
      setupCartFindOne(defaultCartDoc());
      setupOrderFindByIdForCreate();

      const next = jest.fn(); await createOrder(makeReq(), mockRes(), next);

      expect(Order).toHaveBeenCalledWith(expect.objectContaining({
        subtotal: 1300000,
        shippingFee: 30000,
        total: 1330000,
      }));
      expect(mockStatus).toHaveBeenCalledWith(201);
    });
  });

  describe('inventory management', () => {
    it('decrements inStock for each item inside the transaction', async () => {
      setupCartFindOne(defaultCartDoc());
      setupOrderFindByIdForCreate();

      const next = jest.fn(); await createOrder(makeReq(), mockRes(), next);

      expect(mockProductFindByIdAndUpdate).toHaveBeenCalledWith(
        'product-1',
        { $inc: { inStock: -2 } },
        { session: mockSession }
      );
      expect(mockProductFindByIdAndUpdate).toHaveBeenCalledWith(
        'product-2',
        { $inc: { inStock: -1 } },
        { session: mockSession }
      );
    });

    it('does not decrement stock when validation fails', async () => {
      setupCartFindOne(defaultCartDoc());
      Cart.findOne.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        session: jest.fn().mockResolvedValue(null),
      });

      const next = jest.fn(); await createOrder(makeReq(), mockRes(), next);

      expect(mockProductFindByIdAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('promotion', () => {
    function setupWithPromotion(promotionDoc) {
      const cartDoc = defaultCartDoc();
      setupCartFindOne(cartDoc);
      Promotion.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(promotionDoc),
      });
    }

    function setupPromotionFindOne(promotionDoc) {
      Promotion.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(promotionDoc),
      });
    }

    it('applies valid percentage promotion', async () => {
      setupWithPromotion(defaultPromotionDoc({ discountType: 'percentage', discountValue: 10 }));
      setupOrderFindByIdForCreate();

      const next = jest.fn(); await createOrder(makeReq({ body: { shippingAddress: validShippingAddress, promotionCode: 'TEST10' } }), mockRes(), next);

      expect(Order).toHaveBeenCalledWith(expect.objectContaining({
        subtotal: 1300000,
        total: 1200000,
        promotion: expect.objectContaining({
          code: 'TEST10',
          discountType: 'percentage',
          discountValue: 10,
          discountAmount: 130000,
        }),
      }));
      expect(mockStatus).toHaveBeenCalledWith(201);
    });

    it('capped percentage discount at maxDiscountAmount', async () => {
      setupWithPromotion(defaultPromotionDoc({
        discountType: 'percentage',
        discountValue: 50,
        maxDiscountAmount: 50000,
      }));
      setupOrderFindByIdForCreate();

      const next = jest.fn(); await createOrder(makeReq({ body: { shippingAddress: validShippingAddress, promotionCode: 'TEST50' } }), mockRes(), next);

      expect(Order).toHaveBeenCalledWith(expect.objectContaining({
        promotion: expect.objectContaining({ discountAmount: 50000 }),
      }));
      expect(mockStatus).toHaveBeenCalledWith(201);
      expect(next).not.toHaveBeenCalled();
    });

    it('applies valid fixed promotion', async () => {
      setupWithPromotion(defaultPromotionDoc({ code: 'FIXED50', discountType: 'fixed', discountValue: 50000 }));
      setupOrderFindByIdForCreate();

      const next = jest.fn(); await createOrder(makeReq({ body: { shippingAddress: validShippingAddress, promotionCode: 'FIXED50' } }), mockRes(), next);

      expect(Order).toHaveBeenCalledWith(expect.objectContaining({
        total: 1280000,
        promotion: expect.objectContaining({
          code: 'FIXED50',
          discountType: 'fixed',
          discountValue: 50000,
          discountAmount: 50000,
        }),
      }));
      expect(mockStatus).toHaveBeenCalledWith(201);
    });

    it('caps fixed discount at subtotal', async () => {
      setupWithPromotion(defaultPromotionDoc({ discountType: 'fixed', discountValue: 99999999 }));
      setupOrderFindByIdForCreate();

      const next = jest.fn(); await createOrder(makeReq({ body: { shippingAddress: validShippingAddress, promotionCode: 'HUGE' } }), mockRes(), next);

      expect(Order).toHaveBeenCalledWith(expect.objectContaining({
        total: 30000,
        promotion: expect.objectContaining({ discountAmount: 1300000 }),
      }));
      expect(mockStatus).toHaveBeenCalledWith(201);
    });

    it('rejects non-existent promotion code', async () => {
      setupCartFindOne(defaultCartDoc());
      setupPromotionFindOne(null);

      const next = jest.fn(); await createOrder(makeReq({ body: { shippingAddress: validShippingAddress, promotionCode: 'INVALID' } }), mockRes(), next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404, code: 'INVALID_PROMOTION' })
      );
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('rejects inactive promotion', async () => {
      setupWithPromotion(defaultPromotionDoc({ isActive: false }));

      const next = jest.fn(); await createOrder(makeReq({ body: { shippingAddress: validShippingAddress, promotionCode: 'INACTIVE' } }), mockRes(), next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400, code: 'INACTIVE_PROMOTION' })
      );
    });

    it('rejects promotion that has not started yet', async () => {
      setupWithPromotion(defaultPromotionDoc({ startDate: new Date('2099-01-01') }));

      const next = jest.fn(); await createOrder(makeReq({ body: { shippingAddress: validShippingAddress, promotionCode: 'FUTURE' } }), mockRes(), next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400, code: 'PROMOTION_NOT_STARTED' })
      );
    });

    it('rejects expired promotion', async () => {
      setupWithPromotion(defaultPromotionDoc({ endDate: new Date('2023-01-01') }));

      const next = jest.fn(); await createOrder(makeReq({ body: { shippingAddress: validShippingAddress, promotionCode: 'EXPIRED' } }), mockRes(), next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400, code: 'EXPIRED_PROMOTION' })
      );
    });

    it('rejects promotion at usage limit', async () => {
      setupWithPromotion(defaultPromotionDoc({ usedCount: 100, usageLimit: 100 }));

      const next = jest.fn(); await createOrder(makeReq({ body: { shippingAddress: validShippingAddress, promotionCode: 'EXHAUSTED' } }), mockRes(), next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400, code: 'PROMOTION_USAGE_LIMIT' })
      );
    });

    it('rejects promotion when order value below minimum', async () => {
      setupWithPromotion(defaultPromotionDoc({ minOrderValue: 99999999 }));

      const next = jest.fn(); await createOrder(makeReq({ body: { shippingAddress: validShippingAddress, promotionCode: 'HIGHMIN' } }), mockRes(), next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400, code: 'MIN_ORDER_NOT_MET' })
      );
    });

    it('increments promotion usedCount when transaction succeeds', async () => {
      setupWithPromotion(defaultPromotionDoc({ discountType: 'fixed', discountValue: 50000 }));
      setupOrderFindByIdForCreate();

      const next = jest.fn(); await createOrder(makeReq({ body: { shippingAddress: validShippingAddress, promotionCode: 'FIXED50' } }), mockRes(), next);

      expect(Promotion.findOneAndUpdate).toHaveBeenCalledWith(
        { code: 'FIXED50' },
        { $inc: { usedCount: 1 } },
        { session: mockSession }
      );
    });

    it('does not increment promotion usedCount on validation failure', async () => {
      setupWithPromotion(defaultPromotionDoc({ isActive: false }));

      const next = jest.fn(); await createOrder(makeReq({ body: { shippingAddress: validShippingAddress, promotionCode: 'INACTIVE' } }), mockRes(), next);

      expect(Promotion.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('does not increment promotion usedCount when order save fails', async () => {
      setupWithPromotion(defaultPromotionDoc({ discountType: 'fixed', discountValue: 50000 }));
      mockOrderSave.mockRejectedValue(new Error('Save failed'));

      const next = jest.fn(); await createOrder(makeReq({ body: { shippingAddress: validShippingAddress, promotionCode: 'FIXED50' } }), mockRes(), next);

      expect(Promotion.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('success response', () => {
    it('returns 201 with order data on success', async () => {
      setupCartFindOne(defaultCartDoc());
      setupOrderFindByIdForCreate();

      const next = jest.fn(); await createOrder(makeReq(), mockRes(), next);

      expect(mockStatus).toHaveBeenCalledWith(201);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Đặt hàng thành công',
          data: expect.objectContaining({
            orderNumber: 'ORD-20241209-001',
            status: 'pending',
          }),
        })
      );
      expect(Order).toHaveBeenCalledWith(expect.objectContaining({
        subtotal: 1300000,
        shippingFee: 30000,
        total: 1330000,
      }));
    });

    it('clears the cart after successful order', async () => {
      const cartDoc = defaultCartDoc();
      setupCartFindOne(cartDoc);
      setupOrderFindByIdForCreate();

      const next = jest.fn(); await createOrder(makeReq(), mockRes(), next);

      expect(cartDoc.items).toEqual([]);
      expect(mockCartSave).toHaveBeenCalledWith({ session: mockSession });
    });
  });

  describe('email notification', () => {
    it('enqueues order confirmation email after successful commit', async () => {
      setupCartFindOne(defaultCartDoc());
      setupOrderFindByIdForCreate();

      const next = jest.fn(); await createOrder(makeReq(), mockRes(), next);

      expect(mockEnqueueOrderConfirmationEmail).toHaveBeenCalledWith(
        { name: 'Test User', email: 'test@test.com', _id: 'user-123' },
        expect.objectContaining({ _id: 'order-123' }),
        'test-cid'
      );
    });

    it('does not enqueue email when transaction aborts', async () => {
      setupCartFindOne(defaultCartDoc());
      Cart.findOne.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        session: jest.fn().mockResolvedValue(null),
      });

      const next = jest.fn(); await createOrder(makeReq(), mockRes(), next);

      expect(mockEnqueueOrderConfirmationEmail).not.toHaveBeenCalled();
    });

    it('does not enqueue email when stock update fails', async () => {
      setupCartFindOne(defaultCartDoc());
      mockProductFindByIdAndUpdate.mockRejectedValue(new Error('Stock update failed'));

      const next = jest.fn(); await createOrder(makeReq(), mockRes(), next);

      expect(mockEnqueueOrderConfirmationEmail).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('returns 500 when Product.findByIdAndUpdate throws', async () => {
      setupCartFindOne(defaultCartDoc());
      mockProductFindByIdAndUpdate.mockRejectedValue(new Error('DB error during stock update'));

      const next = jest.fn(); await createOrder(makeReq(), mockRes(), next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 500, code: 'SERVER_ERROR' })
      );
      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockEnqueueOrderConfirmationEmail).not.toHaveBeenCalled();
    });

    it('returns 500 when Order.save throws', async () => {
      setupCartFindOne(defaultCartDoc());
      mockOrderSave.mockRejectedValue(new Error('DB error during order save'));

      const next = jest.fn(); await createOrder(makeReq(), mockRes(), next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 500, code: 'SERVER_ERROR' })
      );
      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockProductFindByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('returns 500 when commitTransaction throws', async () => {
      setupCartFindOne(defaultCartDoc());
      setupOrderFindByIdForCreate();
      mockSession.commitTransaction.mockRejectedValue(new Error('Commit failed'));

      const next = jest.fn(); await createOrder(makeReq(), mockRes(), next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 500, code: 'SERVER_ERROR' })
      );
      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockEnqueueOrderConfirmationEmail).not.toHaveBeenCalled();
    });

    it('does not expose internal error details in production NODE_ENV', async () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      setupCartFindOne(defaultCartDoc());
      mockOrderSave.mockRejectedValue(new Error('Internal DB details'));
      setupOrderFindByIdForCreate();

      const next = jest.fn(); await createOrder(makeReq(), mockRes(), next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 500, code: 'SERVER_ERROR', message: 'Lỗi server khi tạo đơn hàng' })
      );
      const calledWithError = next.mock.calls[0][0];
      expect(calledWithError).toBeInstanceOf(AppError);
      expect(calledWithError.message).toBe('Lỗi server khi tạo đơn hàng');
      process.env.NODE_ENV = origEnv;
    });
  });

  describe('security', () => {
    it('does not trust client-supplied price — price comes from Product document', async () => {
      setupCartFindOne(defaultCartDoc());
      setupOrderFindByIdForCreate();

      const req = makeReq({
        body: {
          shippingAddress: validShippingAddress,
          items: [{ product: 'product-1', price: 1, quantity: 1 }],
        },
      });

      const next = jest.fn(); await createOrder(req, mockRes(), next);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            items: expect.arrayContaining([
              expect.objectContaining({ price: 500000 }),
            ]),
          }),
        })
      );
    });

    it('uses userId from authenticated request context, not from body', async () => {
      setupCartFindOne(defaultCartDoc());
      setupOrderFindByIdForCreate();

      const req = makeReq({
        body: { shippingAddress: validShippingAddress, userId: 'hacker-user-id' },
      });

      const next = jest.fn(); await createOrder(req, mockRes(), next);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            user: expect.objectContaining({ _id: 'user-123' }),
          }),
        })
      );
    });
  });
});

describe('cancelOrder', () => {
  function makeReq(overrides = {}) {
    return {
      params: { id: 'order-123' },
      body: { reason: 'Tôi không muốn mua nữa' },
      user: { _id: 'user-123', name: 'Test User', email: 'test@test.com', role: 'user' },
      requestId: 'test-cid',
      ...overrides,
    };
  }

  describe('success', () => {
    it('cancels a pending order and restores stock inside the transaction', async () => {
      const orderDoc = defaultOrderDoc({ status: 'pending' });
      setupOrderFindByIdForCancel(orderDoc);

      const next = jest.fn();
      await cancelOrder(makeReq(), mockRes(), next);

      expect(mockProductFindByIdAndUpdate).toHaveBeenCalledWith(
        'product-1',
        { $inc: { inStock: 2 } },
        { session: mockSession }
      );
      expect(mockProductFindByIdAndUpdate).toHaveBeenCalledWith(
        'product-2',
        { $inc: { inStock: 1 } },
        { session: mockSession }
      );
    });

    it('updates order status to cancelled with reason and timestamp', async () => {
      const orderDoc = defaultOrderDoc({ status: 'pending' });
      setupOrderFindByIdForCancel(orderDoc);

      const next = jest.fn();
      await cancelOrder(makeReq({ body: { reason: 'other', customReason: 'Đổi ý' } }), mockRes(), next);

      expect(orderDoc.status).toBe('cancelled');
      expect(orderDoc.cancelReason).toBe('Đổi ý');
      expect(orderDoc.cancelledAt).toBeInstanceOf(Date);
      expect(mockOrderAddStatusHistory).toHaveBeenCalledWith(
        'cancelled',
        'Khách hàng hủy đơn: Đổi ý'
      );
    });

    it('commits the transaction and ends session', async () => {
      const orderDoc = defaultOrderDoc({ status: 'pending' });
      setupOrderFindByIdForCancel(orderDoc);

      const next = jest.fn();
      await cancelOrder(makeReq(), mockRes(), next);

      expect(orderDoc.save).toHaveBeenCalledWith({ session: mockSession });
      expect(mockSession.commitTransaction).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('returns 200 with updated order', async () => {
      const orderDoc = defaultOrderDoc({ status: 'pending' });
      setupOrderFindByIdForCancel(orderDoc);

      const next = jest.fn();
      await cancelOrder(makeReq(), mockRes(), next);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Hủy đơn hàng thành công',
          data: expect.objectContaining({ _id: 'order-123' }),
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('validation', () => {
    it('rejects invalid order ID format', async () => {
      mongoose.Types.ObjectId.isValid.mockReturnValue(false);
      const next = jest.fn();

      await cancelOrder(makeReq({ params: { id: 'bad-id' } }), mockRes(), next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
      expect(next.mock.calls[0][0].statusCode).toBe(400);
      expect(next.mock.calls[0][0].code).toBe('ORDER_NOT_FOUND');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('rejects missing cancel reason', async () => {
      setupOrderFindByIdForCancel(defaultOrderDoc({ status: 'pending' }));
      const next = jest.fn();

      await cancelOrder(makeReq({ body: { reason: '' } }), mockRes(), next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
      expect(next.mock.calls[0][0].statusCode).toBe(400);
      expect(next.mock.calls[0][0].code).toBe('CANCEL_REASON_REQUIRED');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('rejects non-existent order', async () => {
      Order.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(null),
        populate: jest.fn(),
      });
      const next = jest.fn();

      await cancelOrder(makeReq(), mockRes(), next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
      expect(next.mock.calls[0][0].statusCode).toBe(404);
      expect(next.mock.calls[0][0].code).toBe('ORDER_NOT_FOUND');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('rejects unauthorized user (not order owner)', async () => {
      const orderDoc = defaultOrderDoc({ status: 'pending', user: 'other-user-456' });
      setupOrderFindByIdForCancel(orderDoc);
      const next = jest.fn();

      await cancelOrder(makeReq(), mockRes(), next);

      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
      expect(next.mock.calls[0][0].statusCode).toBe(403);
      expect(next.mock.calls[0][0].code).toBe('FORBIDDEN');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('rejects cancellation for non-cancellable status', async () => {
      for (const status of ['processing', 'shipping', 'delivered', 'cancelled']) {
        const orderDoc = defaultOrderDoc({ status });
        setupOrderFindByIdForCancel(orderDoc);
        const next = jest.fn();

        await cancelOrder(makeReq(), mockRes(), next);

        expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
        expect(next.mock.calls[0][0].statusCode).toBe(400);
        expect(next.mock.calls[0][0].code).toBe('INVALID_STATUS_FOR_CANCEL');
        expect(mockProductFindByIdAndUpdate).not.toHaveBeenCalled();
      }
    });

    it('allows cancellation for confirmed orders', async () => {
      const orderDoc = defaultOrderDoc({ status: 'confirmed' });
      setupOrderFindByIdForCancel(orderDoc);

      const next = jest.fn();
      await cancelOrder(makeReq(), mockRes(), next);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockProductFindByIdAndUpdate).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('transaction safety', () => {
    it('aborts transaction on error', async () => {
      const orderDoc = defaultOrderDoc({ status: 'pending' });
      setupOrderFindByIdForCancel(orderDoc);
      mockProductFindByIdAndUpdate.mockRejectedValue(new Error('Stock restore failed'));

      const next = jest.fn();
      await cancelOrder(makeReq(), mockRes(), next);

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockSession.commitTransaction).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('ends session on error', async () => {
      const orderDoc = defaultOrderDoc({ status: 'pending' });
      setupOrderFindByIdForCancel(orderDoc);
      mockProductFindByIdAndUpdate.mockRejectedValue(new Error('Stock restore failed'));

      const next = jest.fn();
      await cancelOrder(makeReq(), mockRes(), next);

      expect(mockSession.endSession).toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('does not restore stock twice on duplicate cancel attempt', async () => {
      const orderDoc = defaultOrderDoc({ status: 'cancelled' });
      setupOrderFindByIdForCancel(orderDoc);

      const next = jest.fn();
      await cancelOrder(makeReq(), mockRes(), next);

      expect(mockProductFindByIdAndUpdate).not.toHaveBeenCalled();
      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
      expect(next.mock.calls[0][0].statusCode).toBe(400);
      expect(next.mock.calls[0][0].code).toBe('INVALID_STATUS_FOR_CANCEL');
    });
  });
});

describe('updateOrderStatus', () => {
  function makeReq(overrides = {}) {
    return {
      params: { id: 'order-123' },
      body: { status: 'confirmed' },
      user: { _id: 'user-123', name: 'Test User', email: 'test@test.com', role: 'admin' },
      requestId: 'test-cid',
      ...overrides,
    };
  }

  describe('valid transitions', () => {
    it('transitions from pending to confirmed', async () => {
      const orderDoc = defaultOrderDoc({ status: 'pending' });
      setupOrderFindByIdForStatus(orderDoc);

      const next = jest.fn();
      await updateOrderStatus(makeReq({ body: { status: 'confirmed' } }), mockRes(), next);

      expect(orderDoc.status).toBe('confirmed');
      expect(orderDoc.confirmedAt).toBeInstanceOf(Date);
      expect(mockOrderAddStatusHistory).toHaveBeenCalledWith('confirmed', '');
      expect(orderDoc.save).toHaveBeenCalledWith({ session: mockSession });
      expect(mockSession.commitTransaction).toHaveBeenCalled();
      expect(mockStatus).toHaveBeenCalledWith(200);
    });

    it('transitions from confirmed to processing', async () => {
      const orderDoc = defaultOrderDoc({ status: 'confirmed' });
      setupOrderFindByIdForStatus(orderDoc);

      const next = jest.fn();
      await updateOrderStatus(makeReq({ body: { status: 'processing' } }), mockRes(), next);

      expect(orderDoc.status).toBe('processing');
      expect(mockStatus).toHaveBeenCalledWith(200);
    });

    it('transitions from processing to shipping', async () => {
      const orderDoc = defaultOrderDoc({ status: 'processing' });
      setupOrderFindByIdForStatus(orderDoc);

      const next = jest.fn();
      await updateOrderStatus(makeReq({ body: { status: 'shipping' } }), mockRes(), next);

      expect(orderDoc.status).toBe('shipping');
      expect(orderDoc.shippedAt).toBeInstanceOf(Date);
    });

    it('transitions from shipping to delivered', async () => {
      const orderDoc = defaultOrderDoc({ status: 'shipping' });
      setupOrderFindByIdForStatus(orderDoc);

      const next = jest.fn();
      await updateOrderStatus(makeReq({ body: { status: 'delivered' } }), mockRes(), next);

      expect(orderDoc.status).toBe('delivered');
      expect(orderDoc.deliveredAt).toBeInstanceOf(Date);
    });
  });

  describe('cancellation with stock restore', () => {
    it('restores stock when transitioning to cancelled', async () => {
      const orderDoc = defaultOrderDoc({ status: 'pending' });
      setupOrderFindByIdForStatus(orderDoc);

      const next = jest.fn();
      await updateOrderStatus(makeReq({ body: { status: 'cancelled', cancelReason: 'Admin cancelled' } }), mockRes(), next);

      expect(orderDoc.status).toBe('cancelled');
      expect(orderDoc.cancelReason).toBe('Admin cancelled');
      expect(mockProductFindByIdAndUpdate).toHaveBeenCalledWith(
        'product-1',
        { $inc: { inStock: 2 } },
        { session: mockSession }
      );
      expect(mockProductFindByIdAndUpdate).toHaveBeenCalledWith(
        'product-2',
        { $inc: { inStock: 1 } },
        { session: mockSession }
      );
    });

    it('restores stock from confirmed or processing states too', async () => {
      for (const status of ['confirmed', 'processing', 'shipping']) {
        const orderDoc = defaultOrderDoc({ status });
        setupOrderFindByIdForStatus(orderDoc);

        const next = jest.fn();
        await updateOrderStatus(makeReq({ body: { status: 'cancelled' } }), mockRes(), next);

        expect(mockProductFindByIdAndUpdate).toHaveBeenCalled();
        mockProductFindByIdAndUpdate.mockClear();
      }
    });

    it('records note in status history when provided', async () => {
      const orderDoc = defaultOrderDoc({ status: 'pending' });
      setupOrderFindByIdForStatus(orderDoc);

      const next = jest.fn();
      await updateOrderStatus(makeReq({ body: { status: 'confirmed', note: 'Payment verified' } }), mockRes(), next);

      expect(mockOrderAddStatusHistory).toHaveBeenCalledWith('confirmed', 'Payment verified');
    });
  });

  describe('validation', () => {
    it('rejects invalid order ID', async () => {
      mongoose.Types.ObjectId.isValid.mockReturnValue(false);
      const next = jest.fn();

      await updateOrderStatus(makeReq({ params: { id: 'bad-id' } }), mockRes(), next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
      expect(next.mock.calls[0][0].statusCode).toBe(400);
      expect(next.mock.calls[0][0].code).toBe('ORDER_NOT_FOUND');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('rejects invalid status value', async () => {
      const next = jest.fn();
      await updateOrderStatus(makeReq({ body: { status: 'invalid-status' } }), mockRes(), next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
      expect(next.mock.calls[0][0].statusCode).toBe(400);
      expect(next.mock.calls[0][0].code).toBe('INVALID_STATUS_TRANSITION');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('rejects missing status', async () => {
      const next = jest.fn();
      await updateOrderStatus(makeReq({ body: {} }), mockRes(), next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
      expect(next.mock.calls[0][0].statusCode).toBe(400);
      expect(next.mock.calls[0][0].code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('rejects non-existent order', async () => {
      Order.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(null),
        populate: jest.fn(),
      });
      const next = jest.fn();

      await updateOrderStatus(makeReq({ body: { status: 'confirmed' } }), mockRes(), next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
      expect(next.mock.calls[0][0].statusCode).toBe(404);
      expect(next.mock.calls[0][0].code).toBe('ORDER_NOT_FOUND');
    });

    it('rejects invalid transition from delivered', async () => {
      const orderDoc = defaultOrderDoc({ status: 'delivered' });
      setupOrderFindByIdForStatus(orderDoc);
      const next = jest.fn();

      await updateOrderStatus(makeReq({ body: { status: 'processing' } }), mockRes(), next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
      expect(next.mock.calls[0][0].statusCode).toBe(400);
      expect(next.mock.calls[0][0].code).toBe('INVALID_STATUS_TRANSITION');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('rejects transition from cancelled', async () => {
      const orderDoc = defaultOrderDoc({ status: 'cancelled' });
      setupOrderFindByIdForStatus(orderDoc);
      const next = jest.fn();

      await updateOrderStatus(makeReq({ body: { status: 'pending' } }), mockRes(), next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
      expect(next.mock.calls[0][0].statusCode).toBe(400);
      expect(next.mock.calls[0][0].code).toBe('INVALID_STATUS_TRANSITION');
    });
  });

  describe('transaction safety', () => {
    it('aborts transaction on error', async () => {
      const orderDoc = defaultOrderDoc({ status: 'pending' });
      setupOrderFindByIdForStatus(orderDoc);
      mockOrderSave.mockRejectedValue(new Error('Save failed'));

      const next = jest.fn();
      await updateOrderStatus(makeReq({ body: { status: 'confirmed' } }), mockRes(), next);

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockSession.commitTransaction).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('ends session after commit', async () => {
      const orderDoc = defaultOrderDoc({ status: 'pending' });
      setupOrderFindByIdForStatus(orderDoc);

      const next = jest.fn();
      await updateOrderStatus(makeReq({ body: { status: 'confirmed' } }), mockRes(), next);

      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('ends session on error', async () => {
      const orderDoc = defaultOrderDoc({ status: 'pending' });
      setupOrderFindByIdForStatus(orderDoc);
      mockOrderSave.mockRejectedValue(new Error('Save failed'));

      const next = jest.fn();
      await updateOrderStatus(makeReq({ body: { status: 'confirmed' } }), mockRes(), next);

      expect(mockSession.endSession).toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('status transition hardening', () => {
    it('rejects same-status update', async () => {
      const orderDoc = defaultOrderDoc({ status: 'confirmed' });
      setupOrderFindByIdForStatus(orderDoc);
      const next = jest.fn();

      await updateOrderStatus(makeReq({ body: { status: 'confirmed' } }), mockRes(), next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
      expect(next.mock.calls[0][0].statusCode).toBe(400);
      expect(next.mock.calls[0][0].code).toBe('INVALID_STATUS_TRANSITION');
      expect(mockOrderAddStatusHistory).not.toHaveBeenCalled();
      expect(orderDoc.save).not.toHaveBeenCalled();
    });

    it('rejects pending -> delivered directly', async () => {
      const orderDoc = defaultOrderDoc({ status: 'pending' });
      setupOrderFindByIdForStatus(orderDoc);
      const next = jest.fn();

      await updateOrderStatus(makeReq({ body: { status: 'delivered' } }), mockRes(), next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
      expect(next.mock.calls[0][0].statusCode).toBe(400);
      expect(next.mock.calls[0][0].code).toBe('INVALID_STATUS_TRANSITION');
      expect(mockOrderAddStatusHistory).not.toHaveBeenCalled();
    });

    it('returns allowedNextStatuses in the error response', async () => {
      const orderDoc = defaultOrderDoc({ status: 'pending' });
      setupOrderFindByIdForStatus(orderDoc);
      const next = jest.fn();

      await updateOrderStatus(makeReq({ body: { status: 'delivered' } }), mockRes(), next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
      expect(next.mock.calls[0][0].details).toEqual({ allowedNextStatuses: ['confirmed', 'cancelled'] });
    });

    it('trims whitespace from note', async () => {
      const orderDoc = defaultOrderDoc({ status: 'pending' });
      setupOrderFindByIdForStatus(orderDoc);

      const next = jest.fn();
      await updateOrderStatus(makeReq({ body: { status: 'confirmed', note: '  payment verified  ' } }), mockRes(), next);

      expect(mockOrderAddStatusHistory).toHaveBeenCalledWith('confirmed', 'payment verified');
      expect(mockStatus).toHaveBeenCalledWith(200);
    });

    it('stores empty string note when note is whitespace only', async () => {
      const orderDoc = defaultOrderDoc({ status: 'pending' });
      setupOrderFindByIdForStatus(orderDoc);

      const next = jest.fn();
      await updateOrderStatus(makeReq({ body: { status: 'confirmed', note: '   ' } }), mockRes(), next);

      expect(mockOrderAddStatusHistory).toHaveBeenCalledWith('confirmed', '');
      expect(mockStatus).toHaveBeenCalledWith(200);
    });

    it('does not append status history on failed transition', async () => {
      const orderDoc = defaultOrderDoc({ status: 'pending' });
      setupOrderFindByIdForStatus(orderDoc);
      mockOrderSave.mockRejectedValue(new Error('Save failed'));

      const next = jest.fn();
      await updateOrderStatus(makeReq({ body: { status: 'confirmed' } }), mockRes(), next);

      expect(mockOrderAddStatusHistory).toHaveBeenCalledTimes(1);
      expect(orderDoc.save).toHaveBeenCalled();
      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('does not change order status on invalid transition', async () => {
      const orderDoc = defaultOrderDoc({ status: 'pending' });
      setupOrderFindByIdForStatus(orderDoc);
      const next = jest.fn();

      await updateOrderStatus(makeReq({ body: { status: 'delivered' } }), mockRes(), next);

      expect(orderDoc.status).toBe('pending');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });

    it('does not enqueue email on failed transition', async () => {
      const orderDoc = defaultOrderDoc({ status: 'pending' });
      setupOrderFindByIdForStatus(orderDoc);
      const next = jest.fn();

      await updateOrderStatus(makeReq({ body: { status: 'delivered' } }), mockRes(), next);

      expect(mockEnqueueOrderConfirmationEmail).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });

    it('correctly allows transitions per status', async () => {
      const transitionMap = {
        pending: ['confirmed', 'cancelled'],
        confirmed: ['processing', 'cancelled'],
        processing: ['shipping', 'cancelled'],
        shipping: ['delivered', 'cancelled'],
        delivered: [],
        cancelled: [],
      };

      for (const [current, allowed] of Object.entries(transitionMap)) {
        const orderDoc = defaultOrderDoc({ status: current });
        for (const target of allowed) {
          orderDoc.status = current; // reset
          setupOrderFindByIdForStatus({ ...orderDoc, status: current });
          const next = jest.fn();
          await updateOrderStatus(makeReq({ body: { status: target } }), mockRes(), next);
          expect(mockStatus).toHaveBeenCalledWith(200);
          mockStatus.mockClear();
          mockJson.mockClear();
        }
        // test reject unexpected
        const notAllowed = ['pending', 'confirmed', 'processing', 'shipping', 'delivered', 'cancelled']
          .filter(s => s !== current && !allowed.includes(s));
        for (const target of notAllowed) {
          const doc = defaultOrderDoc({ status: current });
          setupOrderFindByIdForStatus(doc);
          const next = jest.fn();
          await updateOrderStatus(makeReq({ body: { status: target } }), mockRes(), next);
          expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
          mockStatus.mockClear();
          mockJson.mockClear();
        }
      }
    });
  });
});

describe('getUserOrders', () => {
  function makeReq(overrides = {}) {
    return {
      user: { _id: 'user-123', name: 'Test User', email: 'test@test.com', role: 'user' },
      query: {},
      requestId: 'test-cid',
      ...overrides,
    };
  }

  it('returns paginated orders for the authenticated user', async () => {
    const orders = [
      { _id: 'o1', orderNumber: 'ORD-001', status: 'pending' },
      { _id: 'o2', orderNumber: 'ORD-002', status: 'delivered' },
    ];
    Order.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockResolvedValue(orders),
    });
    Order.countDocuments.mockResolvedValue(2);

    const next = jest.fn();
    await getUserOrders(makeReq(), mockRes(), next);

    expect(mockStatus).toHaveBeenCalledWith(200);
    expect(mockJson).toHaveBeenCalledWith({
      success: true,
      data: orders,
      pagination: { page: 1, limit: 10, total: 2, totalPages: 1 },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards unexpected errors to next', async () => {
    const error = new Error('DB error');
    Order.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockRejectedValue(error),
    });
    const next = jest.fn();

    await getUserOrders(makeReq(), mockRes(), next);

    expect(next).toHaveBeenCalledWith(error);
  });
});

describe('getOrderById', () => {
  function makeReq(overrides = {}) {
    return {
      params: { id: 'order-123' },
      user: { _id: 'user-123', name: 'Test User', email: 'test@test.com', role: 'user' },
      query: {},
      requestId: 'test-cid',
      ...overrides,
    };
  }

  it('returns the order for a valid ID', async () => {
    const order = { _id: 'order-123', orderNumber: 'ORD-001', user: { _id: 'user-123', name: 'Test User', email: 'test@test.com' } };
    Order.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(order),
    });

    const next = jest.fn();
    await getOrderById(makeReq(), mockRes(), next);

    expect(mockStatus).toHaveBeenCalledWith(200);
    expect(mockJson).toHaveBeenCalledWith({
      success: true,
      data: order,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('throws BadRequestError for invalid order ID', async () => {
    mongoose.Types.ObjectId.isValid.mockReturnValue(false);
    const next = jest.fn();

    await getOrderById(makeReq({ params: { id: 'bad-id' } }), mockRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    expect(next.mock.calls[0][0].statusCode).toBe(400);
    expect(next.mock.calls[0][0].code).toBe('ORDER_NOT_FOUND');
  });

  it('throws NotFoundError when order does not exist', async () => {
    Order.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(null),
    });
    const next = jest.fn();

    await getOrderById(makeReq(), mockRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    expect(next.mock.calls[0][0].statusCode).toBe(404);
    expect(next.mock.calls[0][0].code).toBe('ORDER_NOT_FOUND');
  });

  it('throws ForbiddenError when user does not own the order and is not admin', async () => {
    const order = { _id: 'order-123', user: { _id: 'other-user', name: 'Other', email: 'other@test.com' } };
    Order.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(order),
    });
    const next = jest.fn();

    await getOrderById(makeReq(), mockRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    expect(next.mock.calls[0][0].statusCode).toBe(403);
    expect(next.mock.calls[0][0].code).toBe('FORBIDDEN');
  });

  it('allows admin to view any order', async () => {
    const order = { _id: 'order-123', user: { _id: 'other-user', name: 'Other', email: 'other@test.com' } };
    Order.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(order),
    });

    const next = jest.fn();
    await getOrderById(makeReq({ user: { _id: 'admin-id', name: 'Admin', email: 'admin@test.com', role: 'admin' } }), mockRes(), next);

    expect(mockStatus).toHaveBeenCalledWith(200);
    expect(mockJson).toHaveBeenCalledWith({
      success: true,
      data: order,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards unexpected errors to next', async () => {
    const error = new Error('DB error');
    Order.findById.mockReturnValue({
      populate: jest.fn().mockRejectedValue(error),
    });
    const next = jest.fn();

    await getOrderById(makeReq(), mockRes(), next);

    expect(next).toHaveBeenCalledWith(error);
  });
});

describe('getAllOrders', () => {
  function makeReq(overrides = {}) {
    return {
      user: { _id: 'admin-id', name: 'Admin', email: 'admin@test.com', role: 'admin' },
      query: {},
      requestId: 'test-cid',
      ...overrides,
    };
  }

  it('returns paginated orders with filters', async () => {
    const orders = [
      { _id: 'o1', orderNumber: 'ORD-001', status: 'pending', user: { _id: 'u1', name: 'User 1', email: 'u1@test.com' } },
      { _id: 'o2', orderNumber: 'ORD-002', status: 'delivered', user: { _id: 'u2', name: 'User 2', email: 'u2@test.com' } },
    ];
    Order.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(orders),
    });

    const next = jest.fn();
    await getAllOrders(makeReq(), mockRes(), next);

    expect(mockStatus).toHaveBeenCalledWith(200);
    expect(mockJson).toHaveBeenCalledWith({
      success: true,
      data: orders,
      pagination: { page: 1, limit: 10, total: 2, totalPages: 1 },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards unexpected errors to next', async () => {
    const error = new Error('DB error');
    Order.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      exec: jest.fn().mockRejectedValue(error),
    });
    const next = jest.fn();

    await getAllOrders(makeReq(), mockRes(), next);

    expect(next).toHaveBeenCalledWith(error);
  });
});

describe('getOrderStats', () => {
  function makeReq(overrides = {}) {
    return {
      user: { _id: 'admin-id', name: 'Admin', email: 'admin@test.com', role: 'admin' },
      query: {},
      requestId: 'test-cid',
      ...overrides,
    };
  }

  it('returns total count and breakdown by status', async () => {
    Order.countDocuments.mockResolvedValue(10);
    Order.aggregate.mockResolvedValue([
      { _id: 'pending', count: 4 },
      { _id: 'confirmed', count: 3 },
      { _id: 'processing', count: 1 },
      { _id: 'shipping', count: 1 },
      { _id: 'delivered', count: 1 },
    ]);

    const next = jest.fn();
    await getOrderStats(makeReq(), mockRes(), next);

    expect(mockStatus).toHaveBeenCalledWith(200);
    expect(mockJson).toHaveBeenCalledWith({
      success: true,
      data: {
        total: 10,
        byStatus: {
          pending: 4,
          confirmed: 3,
          processing: 1,
          shipping: 1,
          delivered: 1,
          cancelled: 0,
        },
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards unexpected errors to next', async () => {
    const error = new Error('DB error');
    Order.countDocuments.mockRejectedValue(error);
    const next = jest.fn();

    await getOrderStats(makeReq(), mockRes(), next);

    expect(next).toHaveBeenCalledWith(error);
  });
});

describe('updateOrderStatus regression', () => {
  function makeReq(overrides = {}) {
    return {
      params: { id: 'order-123' },
      body: { status: 'confirmed' },
      user: { _id: 'user-123', name: 'Test User', email: 'test@test.com', role: 'admin' },
      requestId: 'test-cid',
      ...overrides,
    };
  }

  it('handles success with centralized error handling', async () => {
    const orderDoc = defaultOrderDoc({ status: 'pending' });
    setupOrderFindByIdForStatus(orderDoc);
    const next = jest.fn();

    await updateOrderStatus(makeReq({ body: { status: 'confirmed' } }), mockRes(), next);

    expect(mockStatus).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('throws BadRequestError for invalid order ID', async () => {
    mongoose.Types.ObjectId.isValid.mockReturnValue(false);
    const next = jest.fn();

    await updateOrderStatus(makeReq({ params: { id: 'bad-id' } }), mockRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    expect(next.mock.calls[0][0].statusCode).toBe(400);
    expect(next.mock.calls[0][0].code).toBe('ORDER_NOT_FOUND');
  });

  it('throws BadRequestError for invalid transition', async () => {
    const orderDoc = defaultOrderDoc({ status: 'delivered' });
    setupOrderFindByIdForStatus(orderDoc);
    const next = jest.fn();

    await updateOrderStatus(makeReq({ body: { status: 'processing' } }), mockRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    expect(next.mock.calls[0][0].statusCode).toBe(400);
    expect(next.mock.calls[0][0].code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('throws NotFoundError when order does not exist', async () => {
    Order.findById.mockReturnValue({
      session: jest.fn().mockResolvedValue(null),
      populate: jest.fn(),
    });
    const next = jest.fn();

    await updateOrderStatus(makeReq(), mockRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    expect(next.mock.calls[0][0].statusCode).toBe(404);
    expect(next.mock.calls[0][0].code).toBe('ORDER_NOT_FOUND');
  });

  it('forwards unexpected errors to centralized handler', async () => {
    const orderDoc = defaultOrderDoc({ status: 'pending' });
    setupOrderFindByIdForStatus(orderDoc);
    const error = new Error('Unexpected DB error');
    mockOrderSave.mockRejectedValue(error);
    const next = jest.fn();

    await updateOrderStatus(makeReq({ body: { status: 'confirmed' } }), mockRes(), next);

    expect(next).toHaveBeenCalledWith(error);
  });
});

describe('cancelOrder regression', () => {
  function makeReq(overrides = {}) {
    return {
      params: { id: 'order-123' },
      body: { reason: 'Tôi không muốn mua nữa' },
      user: { _id: 'user-123', name: 'Test User', email: 'test@test.com', role: 'user' },
      requestId: 'test-cid',
      ...overrides,
    };
  }

  it('handles success with centralized error handling', async () => {
    const orderDoc = defaultOrderDoc({ status: 'pending' });
    setupOrderFindByIdForCancel(orderDoc);
    const next = jest.fn();

    await cancelOrder(makeReq(), mockRes(), next);

    expect(mockStatus).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('throws BadRequestError for invalid cancellation status', async () => {
    const orderDoc = defaultOrderDoc({ status: 'shipping' });
    setupOrderFindByIdForCancel(orderDoc);
    const next = jest.fn();

    await cancelOrder(makeReq(), mockRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    expect(next.mock.calls[0][0].statusCode).toBe(400);
    expect(next.mock.calls[0][0].code).toBe('INVALID_STATUS_FOR_CANCEL');
  });

  it('throws BadRequestError when cancel reason is missing', async () => {
    setupOrderFindByIdForCancel(defaultOrderDoc({ status: 'pending' }));
    const next = jest.fn();

    await cancelOrder(makeReq({ body: { reason: '' } }), mockRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    expect(next.mock.calls[0][0].statusCode).toBe(400);
    expect(next.mock.calls[0][0].code).toBe('CANCEL_REASON_REQUIRED');
  });

  it('throws NotFoundError when order does not exist', async () => {
    Order.findById.mockReturnValue({
      session: jest.fn().mockResolvedValue(null),
      populate: jest.fn(),
    });
    const next = jest.fn();

    await cancelOrder(makeReq(), mockRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    expect(next.mock.calls[0][0].statusCode).toBe(404);
    expect(next.mock.calls[0][0].code).toBe('ORDER_NOT_FOUND');
  });

  it('forwards unexpected errors to centralized handler', async () => {
    const orderDoc = defaultOrderDoc({ status: 'pending' });
    setupOrderFindByIdForCancel(orderDoc);
    const error = new Error('Unexpected stock error');
    mockProductFindByIdAndUpdate.mockRejectedValue(error);
    const next = jest.fn();

    await cancelOrder(makeReq(), mockRes(), next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
