/* ------------------------------------------------------------------ */
/*  Cart quantity integer validation tests                              */
/*                                                                      */
/*  Verifies that addItem rejects fractional quantities at the          */
/*  controller layer, while accepting valid integer quantities.         */
/* ------------------------------------------------------------------ */

jest.mock('../models/Cart', () => {
  const mockCartDoc = {
    _id: 'cart-123',
    user: 'user-123',
    items: [],
    save: jest.fn().mockResolvedValue(true),
    toJSON: jest.fn(),
  };
  function MockCart(data) {
    Object.assign(this, data);
    this.items = data.items || [];
    this.save = jest.fn().mockResolvedValue(true);
  }
  MockCart.findOne = jest.fn();
  MockCart.create = jest.fn();
  MockCart.findById = jest.fn();
  MockCart.__mockCartDoc = mockCartDoc;
  return MockCart;
});

jest.mock('../models/Product', () => {
  return {
    findById: jest.fn(),
  };
});

const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { addItem } = require('../controllers/cartController');

function mockReqRes(overrides = {}) {
  const req = {
    user: { _id: 'user-123' },
    body: {
      productId: 'prod-001',
      quantity: 1,
      color: 'Red',
      ...overrides,
    },
  };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  return { req, res };
}

describe('Cart addItem — integer quantity validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    const mockProduct = {
      _id: 'prod-001',
      inStock: 10,
      isActive: true,
    };
    Product.findById.mockResolvedValue(mockProduct);

    Cart.findOne.mockResolvedValue(null);
    Cart.create.mockResolvedValue({ ...Cart.__mockCartDoc, items: [] });
    Cart.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue({
        _id: 'cart-123',
        user: 'user-123',
        items: [{ product: mockProduct, quantity: 1, color: 'Red' }],
      }),
    });
  });

  it('accepts integer quantity = 1', async () => {
    const { req, res } = mockReqRes({ quantity: 1 });
    await addItem(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('accepts integer quantity = 2', async () => {
    const { req, res } = mockReqRes({ quantity: 2 });
    await addItem(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('rejects fractional quantity 1.5', async () => {
    const { req, res } = mockReqRes({ quantity: 1.5 });
    await expect(addItem(req, res)).rejects.toThrow('Số lượng phải là số nguyên');
  });

  it('rejects fractional quantity 0.3', async () => {
    const { req, res } = mockReqRes({ quantity: 0.3 });
    await expect(addItem(req, res)).rejects.toThrow('Số lượng phải là số nguyên');
  });

  it('rejects fractional quantity 2.7', async () => {
    const { req, res } = mockReqRes({ quantity: 2.7 });
    await expect(addItem(req, res)).rejects.toThrow('Số lượng phải là số nguyên');
  });

  it('rejects zero quantity — caught by !quantity check', async () => {
    const { req, res } = mockReqRes({ quantity: 0 });
    await expect(addItem(req, res)).rejects.toThrow('Thiếu thông tin');
  });

  it('rejects negative quantity', async () => {
    const { req, res } = mockReqRes({ quantity: -1 });
    await expect(addItem(req, res)).rejects.toThrow('Số lượng phải lớn hơn 0');
  });
});
