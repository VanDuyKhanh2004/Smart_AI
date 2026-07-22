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
  return MockOrder;
});

const mockCartSave = jest.fn().mockResolvedValue();

jest.mock('../models/Cart', () => {
  const MockCart = {
    findOne: jest.fn(),
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

const mongoose = require('mongoose');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const Promotion = require('../models/Promotion');
const cache = require('../services/cacheService');
const {
  createOrder,
  cancelOrder,
  updateOrderStatus,
  getUserOrders,
  getOrderById,
  getAllOrders,
  getOrderStats,
} = require('../controllers/orderController');

const mockJson = jest.fn();
const mockStatus = jest.fn().mockReturnValue({ json: mockJson });
function mockRes() {
  return { status: mockStatus, json: mockJson };
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
    session: jest.fn().mockResolvedValue(cartDoc),
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
    return {
      body: {
        shippingAddress: validShippingAddress,
        ...overrides.body,
      },
      user: { _id: 'user-123', name: 'Test User', email: 'test@test.com', role: 'user' },
      requestId: 'test-cid',
      ...overrides,
    };
  }

  describe('transaction lifecycle', () => {
    it('starts a MongoDB session and transaction', async () => {
      setupCartFindOne(defaultCartDoc());
      setupOrderFindByIdForCreate();

      await createOrder(makeReq(), mockRes());

      expect(mongoose.startSession).toHaveBeenCalled();
      expect(mockSession.startTransaction).toHaveBeenCalled();
    });

    it('commits the transaction on success', async () => {
      setupCartFindOne(defaultCartDoc());
      setupOrderFindByIdForCreate();

      await createOrder(makeReq(), mockRes());

      expect(mockSession.commitTransaction).toHaveBeenCalled();
    });

    it('aborts the transaction on validation failure', async () => {
      const req = makeReq({ body: { shippingAddress: null } });

      await createOrder(req, mockRes());

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockSession.commitTransaction).not.toHaveBeenCalled();
    });

    it('aborts the transaction on error and does not commit', async () => {
      setupCartFindOne(defaultCartDoc());
      mockOrderSave.mockRejectedValue(new Error('DB write error'));

      await createOrder(makeReq(), mockRes());

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockSession.commitTransaction).not.toHaveBeenCalled();
    });

    it('ends the session in all cases via finally block', async () => {
      setupCartFindOne(defaultCartDoc());
      setupOrderFindByIdForCreate();

      await createOrder(makeReq(), mockRes());

      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('ends session even after abort', async () => {
      const req = makeReq({ body: { shippingAddress: null } });

      await createOrder(req, mockRes());

      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('ends session even on error', async () => {
      setupCartFindOne(defaultCartDoc());
      mockOrderSave.mockRejectedValue(new Error('DB write error'));

      await createOrder(makeReq(), mockRes());

      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('does not enqueue email when transaction is aborted', async () => {
      setupCartFindOne(defaultCartDoc());
      mockOrderSave.mockRejectedValue(new Error('DB write error'));

      await createOrder(makeReq(), mockRes());

      expect(mockEnqueueOrderConfirmationEmail).not.toHaveBeenCalled();
    });
  });

  describe('validation — shipping address', () => {
    it('rejects missing shipping address with 400', async () => {
      const req = makeReq({ body: { shippingAddress: null } });

      await createOrder(req, mockRes());

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, code: 'INVALID_SHIPPING_ADDRESS' })
      );
    });

    it('rejects missing required shipping address fields', async () => {
      for (const field of ['fullName', 'phone', 'address', 'ward', 'district', 'city']) {
        const addr = { ...validShippingAddress };
        delete addr[field];
        const req = makeReq({ body: { shippingAddress: addr } });

        await createOrder(req, mockRes());

        expect(mockStatus).toHaveBeenCalledWith(400);
        expect(mockJson).toHaveBeenCalledWith(
          expect.objectContaining({ success: false, code: 'INVALID_SHIPPING_ADDRESS' })
        );
      }
    });

    it('rejects invalid phone format', async () => {
      const req = makeReq({ body: { shippingAddress: { ...validShippingAddress, phone: '123' } } });

      await createOrder(req, mockRes());

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, code: 'INVALID_SHIPPING_ADDRESS' })
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

      await createOrder(makeReq(), mockRes());

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, code: 'CART_EMPTY' })
      );
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('rejects empty items array', async () => {
      setupCartFindOne({ ...defaultCartDoc(), items: [] });

      await createOrder(makeReq(), mockRes());

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, code: 'CART_EMPTY' })
      );
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('rejects cart item with missing product (null product)', async () => {
      const cartDoc = defaultCartDoc();
      cartDoc.items[0].product = null;
      setupCartFindOne(cartDoc);

      await createOrder(makeReq(), mockRes());

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, code: 'PRODUCT_NOT_FOUND' })
      );
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('rejects cart item with inactive product', async () => {
      const cartDoc = defaultCartDoc();
      cartDoc.items[0].product.isActive = false;
      setupCartFindOne(cartDoc);

      await createOrder(makeReq(), mockRes());

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, code: 'PRODUCT_NOT_FOUND' })
      );
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('rejects insufficient stock', async () => {
      const cartDoc = defaultCartDoc();
      cartDoc.items[0].product.inStock = 1;
      cartDoc.items[0].quantity = 2;
      setupCartFindOne(cartDoc);

      await createOrder(makeReq(), mockRes());

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, code: 'INSUFFICIENT_STOCK' })
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

      await createOrder(req, mockRes());

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

      await createOrder(makeReq(), mockRes());

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

      await createOrder(makeReq(), mockRes());

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

      await createOrder(makeReq(), mockRes());

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

      await createOrder(makeReq(), mockRes());

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

      await createOrder(makeReq({ body: { shippingAddress: validShippingAddress, promotionCode: 'TEST10' } }), mockRes());

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

      await createOrder(makeReq({ body: { shippingAddress: validShippingAddress, promotionCode: 'TEST50' } }), mockRes());

      expect(Order).toHaveBeenCalledWith(expect.objectContaining({
        promotion: expect.objectContaining({ discountAmount: 50000 }),
      }));
      expect(mockStatus).toHaveBeenCalledWith(201);
    });

    it('applies valid fixed promotion', async () => {
      setupWithPromotion(defaultPromotionDoc({ code: 'FIXED50', discountType: 'fixed', discountValue: 50000 }));
      setupOrderFindByIdForCreate();

      await createOrder(makeReq({ body: { shippingAddress: validShippingAddress, promotionCode: 'FIXED50' } }), mockRes());

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

      await createOrder(makeReq({ body: { shippingAddress: validShippingAddress, promotionCode: 'HUGE' } }), mockRes());

      expect(Order).toHaveBeenCalledWith(expect.objectContaining({
        total: 30000,
        promotion: expect.objectContaining({ discountAmount: 1300000 }),
      }));
      expect(mockStatus).toHaveBeenCalledWith(201);
    });

    it('rejects non-existent promotion code', async () => {
      setupCartFindOne(defaultCartDoc());
      setupPromotionFindOne(null);

      await createOrder(makeReq({ body: { shippingAddress: validShippingAddress, promotionCode: 'INVALID' } }), mockRes());

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, code: 'INVALID_PROMOTION' })
      );
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('rejects inactive promotion', async () => {
      setupWithPromotion(defaultPromotionDoc({ isActive: false }));

      await createOrder(makeReq({ body: { shippingAddress: validShippingAddress, promotionCode: 'INACTIVE' } }), mockRes());

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, code: 'INACTIVE_PROMOTION' })
      );
    });

    it('rejects promotion that has not started yet', async () => {
      setupWithPromotion(defaultPromotionDoc({ startDate: new Date('2099-01-01') }));

      await createOrder(makeReq({ body: { shippingAddress: validShippingAddress, promotionCode: 'FUTURE' } }), mockRes());

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, code: 'PROMOTION_NOT_STARTED' })
      );
    });

    it('rejects expired promotion', async () => {
      setupWithPromotion(defaultPromotionDoc({ endDate: new Date('2023-01-01') }));

      await createOrder(makeReq({ body: { shippingAddress: validShippingAddress, promotionCode: 'EXPIRED' } }), mockRes());

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, code: 'EXPIRED_PROMOTION' })
      );
    });

    it('rejects promotion at usage limit', async () => {
      setupWithPromotion(defaultPromotionDoc({ usedCount: 100, usageLimit: 100 }));

      await createOrder(makeReq({ body: { shippingAddress: validShippingAddress, promotionCode: 'EXHAUSTED' } }), mockRes());

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, code: 'PROMOTION_USAGE_LIMIT' })
      );
    });

    it('rejects promotion when order value below minimum', async () => {
      setupWithPromotion(defaultPromotionDoc({ minOrderValue: 99999999 }));

      await createOrder(makeReq({ body: { shippingAddress: validShippingAddress, promotionCode: 'HIGHMIN' } }), mockRes());

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, code: 'MIN_ORDER_NOT_MET' })
      );
    });

    it('increments promotion usedCount when transaction succeeds', async () => {
      setupWithPromotion(defaultPromotionDoc({ discountType: 'fixed', discountValue: 50000 }));
      setupOrderFindByIdForCreate();

      await createOrder(makeReq({ body: { shippingAddress: validShippingAddress, promotionCode: 'FIXED50' } }), mockRes());

      expect(Promotion.findOneAndUpdate).toHaveBeenCalledWith(
        { code: 'FIXED50' },
        { $inc: { usedCount: 1 } },
        { session: mockSession }
      );
    });

    it('does not increment promotion usedCount on validation failure', async () => {
      setupWithPromotion(defaultPromotionDoc({ isActive: false }));

      await createOrder(makeReq({ body: { shippingAddress: validShippingAddress, promotionCode: 'INACTIVE' } }), mockRes());

      expect(Promotion.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('does not increment promotion usedCount when order save fails', async () => {
      setupWithPromotion(defaultPromotionDoc({ discountType: 'fixed', discountValue: 50000 }));
      mockOrderSave.mockRejectedValue(new Error('Save failed'));

      await createOrder(makeReq({ body: { shippingAddress: validShippingAddress, promotionCode: 'FIXED50' } }), mockRes());

      expect(Promotion.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('success response', () => {
    it('returns 201 with order data on success', async () => {
      setupCartFindOne(defaultCartDoc());
      setupOrderFindByIdForCreate();

      await createOrder(makeReq(), mockRes());

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

      await createOrder(makeReq(), mockRes());

      expect(cartDoc.items).toEqual([]);
      expect(mockCartSave).toHaveBeenCalledWith({ session: mockSession });
    });
  });

  describe('email notification', () => {
    it('enqueues order confirmation email after successful commit', async () => {
      setupCartFindOne(defaultCartDoc());
      setupOrderFindByIdForCreate();

      await createOrder(makeReq(), mockRes());

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

      await createOrder(makeReq(), mockRes());

      expect(mockEnqueueOrderConfirmationEmail).not.toHaveBeenCalled();
    });

    it('does not enqueue email when stock update fails', async () => {
      setupCartFindOne(defaultCartDoc());
      mockProductFindByIdAndUpdate.mockRejectedValue(new Error('Stock update failed'));

      await createOrder(makeReq(), mockRes());

      expect(mockEnqueueOrderConfirmationEmail).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('returns 500 when Product.findByIdAndUpdate throws', async () => {
      setupCartFindOne(defaultCartDoc());
      mockProductFindByIdAndUpdate.mockRejectedValue(new Error('DB error during stock update'));

      await createOrder(makeReq(), mockRes());

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockEnqueueOrderConfirmationEmail).not.toHaveBeenCalled();
    });

    it('returns 500 when Order.save throws', async () => {
      setupCartFindOne(defaultCartDoc());
      mockOrderSave.mockRejectedValue(new Error('DB error during order save'));

      await createOrder(makeReq(), mockRes());

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockProductFindByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('returns 500 when commitTransaction throws', async () => {
      setupCartFindOne(defaultCartDoc());
      setupOrderFindByIdForCreate();
      mockSession.commitTransaction.mockRejectedValue(new Error('Commit failed'));

      await createOrder(makeReq(), mockRes());

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockEnqueueOrderConfirmationEmail).not.toHaveBeenCalled();
    });

    it('does not expose internal error details in production NODE_ENV', async () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      setupCartFindOne(defaultCartDoc());
      mockOrderSave.mockRejectedValue(new Error('Internal DB details'));
      setupOrderFindByIdForCreate();

      await createOrder(makeReq(), mockRes());

      expect(mockJson).toHaveBeenCalledWith(
        expect.not.objectContaining({ error: expect.any(String) })
      );
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

      await createOrder(req, mockRes());

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

      await createOrder(req, mockRes());

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

      await cancelOrder(makeReq(), mockRes());

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

      await cancelOrder(makeReq({ body: { reason: 'other', customReason: 'Đổi ý' } }), mockRes());

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

      await cancelOrder(makeReq(), mockRes());

      expect(orderDoc.save).toHaveBeenCalledWith({ session: mockSession });
      expect(mockSession.commitTransaction).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('returns 200 with updated order', async () => {
      const orderDoc = defaultOrderDoc({ status: 'pending' });
      setupOrderFindByIdForCancel(orderDoc);

      await cancelOrder(makeReq(), mockRes());

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Hủy đơn hàng thành công',
          data: expect.objectContaining({ _id: 'order-123' }),
        })
      );
    });
  });

  describe('validation', () => {
    it('rejects invalid order ID format', async () => {
      mongoose.Types.ObjectId.isValid.mockReturnValue(false);

      await cancelOrder(makeReq({ params: { id: 'bad-id' } }), mockRes());

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, code: 'ORDER_NOT_FOUND' })
      );
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('rejects missing cancel reason', async () => {
      setupOrderFindByIdForCancel(defaultOrderDoc({ status: 'pending' }));

      await cancelOrder(makeReq({ body: { reason: '' } }), mockRes());

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, code: 'CANCEL_REASON_REQUIRED' })
      );
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('rejects non-existent order', async () => {
      Order.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(null),
        populate: jest.fn(),
      });

      await cancelOrder(makeReq(), mockRes());

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, code: 'ORDER_NOT_FOUND' })
      );
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('rejects unauthorized user (not order owner)', async () => {
      const orderDoc = defaultOrderDoc({ status: 'pending', user: 'other-user-456' });
      setupOrderFindByIdForCancel(orderDoc);

      await cancelOrder(makeReq(), mockRes());

      expect(mockStatus).toHaveBeenCalledWith(403);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, code: 'FORBIDDEN' })
      );
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('rejects cancellation for non-cancellable status', async () => {
      for (const status of ['processing', 'shipping', 'delivered', 'cancelled']) {
        const orderDoc = defaultOrderDoc({ status });
        setupOrderFindByIdForCancel(orderDoc);

        await cancelOrder(makeReq(), mockRes());

        expect(mockStatus).toHaveBeenCalledWith(400);
        expect(mockJson).toHaveBeenCalledWith(
          expect.objectContaining({ success: false, code: 'INVALID_STATUS_FOR_CANCEL' })
        );
        expect(mockProductFindByIdAndUpdate).not.toHaveBeenCalled();
      }
    });

    it('allows cancellation for confirmed orders', async () => {
      const orderDoc = defaultOrderDoc({ status: 'confirmed' });
      setupOrderFindByIdForCancel(orderDoc);

      await cancelOrder(makeReq(), mockRes());

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockProductFindByIdAndUpdate).toHaveBeenCalled();
    });
  });

  describe('transaction safety', () => {
    it('aborts transaction on error', async () => {
      const orderDoc = defaultOrderDoc({ status: 'pending' });
      setupOrderFindByIdForCancel(orderDoc);
      mockProductFindByIdAndUpdate.mockRejectedValue(new Error('Stock restore failed'));

      await cancelOrder(makeReq(), mockRes());

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockSession.commitTransaction).not.toHaveBeenCalled();
    });

    it('ends session on error', async () => {
      const orderDoc = defaultOrderDoc({ status: 'pending' });
      setupOrderFindByIdForCancel(orderDoc);
      mockProductFindByIdAndUpdate.mockRejectedValue(new Error('Stock restore failed'));

      await cancelOrder(makeReq(), mockRes());

      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('does not restore stock twice on duplicate cancel attempt', async () => {
      const orderDoc = defaultOrderDoc({ status: 'cancelled' });
      setupOrderFindByIdForCancel(orderDoc);

      await cancelOrder(makeReq(), mockRes());

      expect(mockProductFindByIdAndUpdate).not.toHaveBeenCalled();
      expect(mockSession.abortTransaction).toHaveBeenCalled();
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

      await updateOrderStatus(makeReq({ body: { status: 'confirmed' } }), mockRes());

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

      await updateOrderStatus(makeReq({ body: { status: 'processing' } }), mockRes());

      expect(orderDoc.status).toBe('processing');
      expect(mockStatus).toHaveBeenCalledWith(200);
    });

    it('transitions from processing to shipping', async () => {
      const orderDoc = defaultOrderDoc({ status: 'processing' });
      setupOrderFindByIdForStatus(orderDoc);

      await updateOrderStatus(makeReq({ body: { status: 'shipping' } }), mockRes());

      expect(orderDoc.status).toBe('shipping');
      expect(orderDoc.shippedAt).toBeInstanceOf(Date);
    });

    it('transitions from shipping to delivered', async () => {
      const orderDoc = defaultOrderDoc({ status: 'shipping' });
      setupOrderFindByIdForStatus(orderDoc);

      await updateOrderStatus(makeReq({ body: { status: 'delivered' } }), mockRes());

      expect(orderDoc.status).toBe('delivered');
      expect(orderDoc.deliveredAt).toBeInstanceOf(Date);
    });
  });

  describe('cancellation with stock restore', () => {
    it('restores stock when transitioning to cancelled', async () => {
      const orderDoc = defaultOrderDoc({ status: 'pending' });
      setupOrderFindByIdForStatus(orderDoc);

      await updateOrderStatus(makeReq({ body: { status: 'cancelled', cancelReason: 'Admin cancelled' } }), mockRes());

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

        await updateOrderStatus(makeReq({ body: { status: 'cancelled' } }), mockRes());

        expect(mockProductFindByIdAndUpdate).toHaveBeenCalled();
        mockProductFindByIdAndUpdate.mockClear();
      }
    });

    it('records note in status history when provided', async () => {
      const orderDoc = defaultOrderDoc({ status: 'pending' });
      setupOrderFindByIdForStatus(orderDoc);

      await updateOrderStatus(makeReq({ body: { status: 'confirmed', note: 'Payment verified' } }), mockRes());

      expect(mockOrderAddStatusHistory).toHaveBeenCalledWith('confirmed', 'Payment verified');
    });
  });

  describe('validation', () => {
    it('rejects invalid order ID', async () => {
      mongoose.Types.ObjectId.isValid.mockReturnValue(false);

      await updateOrderStatus(makeReq({ params: { id: 'bad-id' } }), mockRes());

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, code: 'ORDER_NOT_FOUND' })
      );
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('rejects invalid status value', async () => {
      await updateOrderStatus(makeReq({ body: { status: 'invalid-status' } }), mockRes());

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, code: 'INVALID_STATUS_TRANSITION' })
      );
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('rejects missing status', async () => {
      await updateOrderStatus(makeReq({ body: {} }), mockRes());

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, code: 'INVALID_STATUS_TRANSITION' })
      );
    });

    it('rejects non-existent order', async () => {
      Order.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(null),
        populate: jest.fn(),
      });

      await updateOrderStatus(makeReq({ body: { status: 'confirmed' } }), mockRes());

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, code: 'ORDER_NOT_FOUND' })
      );
    });

    it('rejects invalid transition from delivered', async () => {
      const orderDoc = defaultOrderDoc({ status: 'delivered' });
      setupOrderFindByIdForStatus(orderDoc);

      await updateOrderStatus(makeReq({ body: { status: 'processing' } }), mockRes());

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, code: 'INVALID_STATUS_TRANSITION' })
      );
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('rejects transition from cancelled', async () => {
      const orderDoc = defaultOrderDoc({ status: 'cancelled' });
      setupOrderFindByIdForStatus(orderDoc);

      await updateOrderStatus(makeReq({ body: { status: 'pending' } }), mockRes());

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, code: 'INVALID_STATUS_TRANSITION' })
      );
    });
  });

  describe('transaction safety', () => {
    it('aborts transaction on error', async () => {
      const orderDoc = defaultOrderDoc({ status: 'pending' });
      setupOrderFindByIdForStatus(orderDoc);
      mockOrderSave.mockRejectedValue(new Error('Save failed'));

      await updateOrderStatus(makeReq({ body: { status: 'confirmed' } }), mockRes());

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockSession.commitTransaction).not.toHaveBeenCalled();
    });

    it('ends session after commit', async () => {
      const orderDoc = defaultOrderDoc({ status: 'pending' });
      setupOrderFindByIdForStatus(orderDoc);

      await updateOrderStatus(makeReq({ body: { status: 'confirmed' } }), mockRes());

      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('ends session on error', async () => {
      const orderDoc = defaultOrderDoc({ status: 'pending' });
      setupOrderFindByIdForStatus(orderDoc);
      mockOrderSave.mockRejectedValue(new Error('Save failed'));

      await updateOrderStatus(makeReq({ body: { status: 'confirmed' } }), mockRes());

      expect(mockSession.endSession).toHaveBeenCalled();
    });
  });
});
