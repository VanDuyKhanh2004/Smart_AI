jest.mock('../services/productSearchService', () => ({
  search: jest.fn(),
}));

jest.mock('../models/Product', () => ({
  aggregate: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(),
}));

jest.mock('../models/Review', () => ({
  getProductStats: jest.fn(),
}));

jest.mock('../utils/openai', () => ({
  generateEmbedding: jest.fn(),
  generateEmbeddingsBatch: jest.fn(),
  calculateSimilarity: jest.fn(),
  testOpenAIConnection: jest.fn(),
}));

jest.mock('../services/cacheService', () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  invalidatePattern: jest.fn(),
}));

const { searchSemantic } = require('../controllers/productController');
const { search: mockSearch } = require('../services/productSearchService');

const mockReq = (overrides = {}) => ({
  query: { q: 'iphone', limit: '10', ...overrides },
  ...overrides,
});

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('GET /api/products/search/semantic — searchSemantic()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 with products when query is valid', async () => {
    const products = [{ _id: 'p1', name: 'iPhone 15' }];
    mockSearch.mockResolvedValue({ products, searchMode: 'vector' });
    const req = mockReq();
    const res = mockRes();

    await searchSemantic(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Tìm kiếm ngữ nghĩa thành công',
      data: {
        products,
        query: 'iphone',
        searchMode: 'vector',
      },
    });
  });

  it('returns 400 when q is missing', async () => {
    const req = mockReq({ q: undefined });
    const res = mockRes();

    await searchSemantic(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Vui lòng cung cấp từ khóa tìm kiếm (q)',
    });
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('returns 400 when q is empty string', async () => {
    const req = mockReq({ q: '' });
    const res = mockRes();

    await searchSemantic(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('returns 400 when q is only whitespace', async () => {
    const req = mockReq({ q: '   ' });
    const res = mockRes();

    await searchSemantic(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('defaults limit to 10', async () => {
    mockSearch.mockResolvedValue({ products: [], searchMode: 'vector' });
    const req = mockReq({ limit: undefined });
    const res = mockRes();

    await searchSemantic(req, res);

    expect(mockSearch).toHaveBeenCalledWith('iphone', 10);
  });

  it('clamps limit to 50 when above maximum', async () => {
    mockSearch.mockResolvedValue({ products: [], searchMode: 'vector' });
    const req = mockReq({ limit: '100' });
    const res = mockRes();

    await searchSemantic(req, res);

    expect(mockSearch).toHaveBeenCalledWith('iphone', 50);
  });

  it('uses limit=10 when limit is below 1', async () => {
    mockSearch.mockResolvedValue({ products: [], searchMode: 'vector' });
    const req = mockReq({ limit: '0' });
    const res = mockRes();

    await searchSemantic(req, res);

    expect(mockSearch).toHaveBeenCalledWith('iphone', 10);
  });

  it('reports searchMode from the service result', async () => {
    mockSearch.mockResolvedValue({ products: [{ _id: 'p1' }], searchMode: 'text' });
    const req = mockReq();
    const res = mockRes();

    await searchSemantic(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ searchMode: 'text' }),
      })
    );
  });

  it('handles service throwing an error', async () => {
    mockSearch.mockRejectedValue(new Error('Unexpected error'));
    const req = mockReq();
    const res = mockRes();

    await searchSemantic(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Lỗi server khi tìm kiếm sản phẩm',
    });
  });
});
