const mockSocket = { handshake: { headers: { 'user-agent': 'test' }, address: '127.0.0.1' }, emit: jest.fn() };

jest.mock('../models/Product', () => ({
  aggregate: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(),
}));

jest.mock('../utils/openai', () => ({
  generateEmbedding: jest.fn(),
  generateEmbeddingsBatch: jest.fn(),
  calculateSimilarity: jest.fn(),
  testOpenAIConnection: jest.fn(),
}));

jest.mock('../models/Conversation', () => {
  const mock = { _id: 'conv1', sessionId: 'session-1', messages: [], save: jest.fn() };
  const Conversation = jest.fn(() => mock);
  Conversation.findOne = jest.fn().mockResolvedValue(mock);
  return Conversation;
});

jest.mock('../models/Complaint', () => {
  const C = jest.fn();
  C.findOne = jest.fn();
  return C;
});

const mockCapturedProducts = { value: null };

jest.mock('../utils/gemini', () => ({
  classifyIntentAndRespond: jest.fn(),
  generateChatResponse: jest.fn((_h, _m, products) => {
    mockCapturedProducts.value = products;
    return Promise.reject(new Error('AI failed'));
  }),
  generateComplaintResponse: jest.fn(),
}));

const Product = require('../models/Product');
const { generateEmbedding } = require('../utils/openai');
const { classifyIntentAndRespond } = require('../utils/gemini');
const ChatController = require('../controllers/chatController');

const allProducts = [
  { _id: 's1', name: 'Galaxy S24', brand: 'samsung', price: 18_990_000, inStock: 4, isActive: true, specs: { memory: { ram: '8 GB', storage: '256 GB' }, colors: ['Titanium Black'] }, description: 'Flagship Samsung' },
  { _id: 's2', name: 'Galaxy A15', brand: 'samsung', price: 4_990_000, inStock: 10, isActive: true, specs: { memory: { ram: '6 GB', storage: '128 GB' }, colors: ['Blue'] }, description: 'Budget Samsung' },
  { _id: 's3', name: 'Galaxy Z Fold6', brand: 'samsung', price: 42_990_000, inStock: 2, isActive: true, specs: { memory: { ram: '12 GB', storage: '512 GB' }, colors: ['Natural Titanium'] }, description: 'Foldable Samsung' },
  { _id: 's4', name: 'Galaxy A05', brand: 'samsung', price: 2_990_000, inStock: 0, isActive: true, specs: { memory: { ram: '4 GB', storage: '64 GB' }, colors: ['Black'] }, description: 'Entry Samsung' },
  { _id: 'a1', name: 'iPhone 15 Pro Max', brand: 'apple', price: 28_990_000, inStock: 1, isActive: true, specs: { memory: { ram: '8 GB', storage: '256 GB' }, colors: ['Natural Titanium'] }, description: 'Premium Apple' },
  { _id: 'a2', name: 'iPhone 16 Pro', brand: 'apple', price: 29_990_000, inStock: 3, isActive: true, specs: { memory: { ram: '8 GB', storage: '256 GB' }, colors: ['Silver'] }, description: 'New Apple' },
  { _id: 'a3', name: 'iPhone SE', brand: 'apple', price: 10_000_000, inStock: 5, isActive: true, specs: { memory: { ram: '4 GB', storage: '64 GB' }, colors: ['Midnight'] }, description: 'Budget Apple' },
  { _id: 'x1', name: 'Redmi Note 13', brand: 'xiaomi', price: 6_990_000, inStock: 8, isActive: true, specs: { memory: { ram: '8 GB', storage: '256 GB' }, colors: ['Black'] }, description: 'Xiaomi mid-range' },
  { _id: 'x2', name: 'Xiaomi 14T', brand: 'xiaomi', price: 12_990_000, inStock: 2, isActive: true, specs: { memory: { ram: '12 GB', storage: '256 GB' }, colors: ['Titanium Black'] }, description: 'Xiaomi flagship' },
  { _id: 'n1', name: 'Nokia 105', brand: 'nokia', price: 500_000, inStock: 10, isActive: true, specs: { memory: { ram: '0.5 GB', storage: '0.1 GB' }, colors: ['Blue'] }, description: 'Basic phone' },
  { _id: 'o1', name: 'OnePlus 12', brand: 'oneplus', price: 22_990_000, inStock: 2, isActive: true, specs: { memory: { ram: '16 GB', storage: '256 GB' }, colors: ['Silver'] }, description: 'Flagship OnePlus' },
  { _id: 'g1', name: 'Pixel 9 Pro', brand: 'google', price: 26_990_000, inStock: 3, isActive: true, specs: { memory: { ram: '16 GB', storage: '512 GB' }, colors: ['Gold'] }, description: 'Google flagship' },
  { _id: 'i1', name: 'Old Samsung', brand: 'samsung', price: 1_000_000, inStock: 0, isActive: false, specs: { memory: { ram: '2 GB', storage: '16 GB' }, colors: ['Red'] }, description: 'Discontinued' },
  { _id: 'm1', name: 'No Specs Phone', brand: 'xiaomi', price: 2_000_000, inStock: 5, isActive: true, specs: null, description: 'Minimal specs' },
];

function setupVectorSearch(returnedProducts) {
  generateEmbedding.mockResolvedValue(new Array(1536).fill(0.1));
  Product.aggregate.mockResolvedValue(returnedProducts);
}

function setupTextFallback(vectorResults, textResults) {
  generateEmbedding.mockResolvedValue(new Array(1536).fill(0.1));
  Product.aggregate.mockResolvedValue(vectorResults);
  const mockQuery = { select: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(textResults) };
  Product.find.mockReturnValue(mockQuery);
}

function setupLatestFallback(vectorResults, textResults, latestResults) {
  generateEmbedding.mockResolvedValue(new Array(1536).fill(0.1));
  Product.aggregate.mockResolvedValue(vectorResults);
  const textQuery = { select: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(textResults) };
  Product.find.mockImplementationOnce(() => textQuery);
  const latestQuery = { sort: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(latestResults) };
  Product.find.mockImplementationOnce(() => latestQuery);
}

function setupErrorFallback(errorMessage, textResults) {
  generateEmbedding.mockResolvedValue(new Array(1536).fill(0.1));
  Product.aggregate.mockRejectedValue(new Error(errorMessage));
  const mockQuery = { select: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(textResults) };
  Product.find.mockReturnValue(mockQuery);
}

function onlyMatching(prods, constraintFn) {
  return prods.filter(constraintFn);
}

function getBrands(prods) {
  return [...new Set(prods.map(p => p.brand))];
}

function searchArg() {
  const calls = Product.aggregate.mock.calls;
  if (calls.length === 0) return null;
  return calls[0][0];
}

function verifyMongoFilter(contains) {
  const pipeline = searchArg();
  if (!pipeline) return;
  for (const key of Object.keys(contains)) {
    const hasMatch = pipeline.some(s =>
      s.$match && s.$match[key] !== undefined
    );
    expect(hasMatch).toBe(true);
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCapturedProducts.value = null;
});

describe('Product constraint integration — pipeline enforcement', () => {

  describe('1. Brand: "điện thoại Samsung dưới 15 triệu"', () => {
    beforeEach(() => setupVectorSearch(allProducts));

    it('returns only Samsung products under 15M', async () => {
      const result = await ChatController.searchRelevantProducts('điện thoại Samsung dưới 15 triệu');
      for (const p of result) {
        expect(p.brand).toBe('samsung');
        expect(p.price).toBeLessThan(15_000_000);
      }
      expect(result.every(p => p.brand === 'samsung')).toBe(true);
      expect(getBrands(result)).toEqual(['samsung']);
    });

    it('excludes non-Samsung brands', async () => {
      const result = await ChatController.searchRelevantProducts('điện thoại Samsung dưới 15 triệu');
      const ids = result.map(p => p._id);
      expect(ids).not.toContain('a1');
      expect(ids).not.toContain('x1');
      expect(ids).not.toContain('n1');
    });

    it('includes correct Samsung models (S24=18.99M excluded, A15=4.99M included)', async () => {
      const result = await ChatController.searchRelevantProducts('điện thoại Samsung dưới 15 triệu');
      const ids = result.map(p => p._id);
      expect(ids).toContain('s2');
      expect(ids).not.toContain('s1');
    });
  });

  describe('2. Multiple brands: "Samsung hoặc Xiaomi tối đa 12 triệu"', () => {
    beforeEach(() => setupVectorSearch(allProducts));

    it('returns only Samsung or Xiaomi products <= 12M', async () => {
      const result = await ChatController.searchRelevantProducts('Samsung hoặc Xiaomi tối đa 12 triệu');
      for (const p of result) {
        expect(['samsung', 'xiaomi']).toContain(p.brand);
        expect(p.price).toBeLessThanOrEqual(12_000_000);
      }
    });

    it('includes Samsung A15 and Redmi Note 13, excludes Galaxy S24 and iPhone', async () => {
      const result = await ChatController.searchRelevantProducts('Samsung hoặc Xiaomi tối đa 12 triệu');
      const ids = result.map(p => p._id);
      expect(ids).toContain('s2');
      expect(ids).toContain('x1');
      expect(ids).not.toContain('s1');
      expect(ids).not.toContain('a1');
    });
  });

  describe('3. Excluded brand: "điện thoại dưới 20 triệu không lấy iPhone"', () => {
    beforeEach(() => setupVectorSearch(allProducts));

    it('excludes all Apple products', async () => {
      const result = await ChatController.searchRelevantProducts('điện thoại dưới 20 triệu không lấy iPhone');
      for (const p of result) {
        expect(p.brand).not.toBe('apple');
        expect(p.price).toBeLessThan(20_000_000);
      }
    });

    it('includes Samsung, Xiaomi, Nokia products under 20M', async () => {
      const result = await ChatController.searchRelevantProducts('điện thoại dưới 20 triệu không lấy iPhone');
      const ids = result.map(p => p._id);
      expect(ids).toContain('s1');
      expect(ids).toContain('s2');
      expect(ids).toContain('x1');
      expect(ids).toContain('n1');
      expect(ids).not.toContain('a1');
      expect(ids).not.toContain('a2');
      expect(ids).not.toContain('a3');
    });

    it('supplemental fallback also excludes Apple', async () => {
      jest.clearAllMocks();
      setupLatestFallback([], [], allProducts);
      const result = await ChatController.searchRelevantProducts('điện thoại dưới 20 triệu không lấy iPhone');
      for (const p of result) {
        expect(p.brand).not.toBe('apple');
        expect(p.price).toBeLessThan(20_000_000);
      }
    });
  });

  describe('4. Stock: "điện thoại Samsung còn hàng"', () => {
    beforeEach(() => setupVectorSearch(allProducts));

    it('all returned products have inStock > 0', async () => {
      const result = await ChatController.searchRelevantProducts('điện thoại Samsung còn hàng');
      for (const p of result) {
        expect(p.inStock).toBeGreaterThan(0);
      }
    });

    it('excludes Galaxy A05 (zero stock) and Old Samsung (inactive)', async () => {
      const result = await ChatController.searchRelevantProducts('điện thoại Samsung còn hàng');
      const ids = result.map(p => p._id);
      expect(ids).not.toContain('s4');
      expect(ids).not.toContain('i1');
    });

    it('includes in-stock Samsung products', async () => {
      const result = await ChatController.searchRelevantProducts('điện thoại Samsung còn hàng');
      const ids = result.map(p => p._id);
      expect(ids).toContain('s1');
      expect(ids).toContain('s2');
      expect(ids).toContain('s3');
    });
  });

  describe('5. RAM: "điện thoại RAM ít nhất 8GB"', () => {
    beforeEach(() => setupVectorSearch(allProducts));

    it('all returned products have RAM >= 8GB', async () => {
      const result = await ChatController.searchRelevantProducts('điện thoại RAM ít nhất 8GB');
      for (const p of result) {
        const ram = parseInt((p.specs?.memory?.ram || '').match(/(\d+)/)?.[1] || '0', 10);
        expect(ram).toBeGreaterThanOrEqual(8);
      }
    });

    it('excludes products with RAM below 8GB or missing specs', async () => {
      const result = await ChatController.searchRelevantProducts('điện thoại RAM ít nhất 8GB');
      const ids = result.map(p => p._id);
      expect(ids).not.toContain('s2');
      expect(ids).not.toContain('s4');
      expect(ids).not.toContain('a3');
      expect(ids).not.toContain('n1');
      expect(ids).not.toContain('m1');
    });

    it('includes Galaxy S24, Z Fold6, iPhone 15 Pro Max, Redmi Note 13, etc.', async () => {
      const result = await ChatController.searchRelevantProducts('điện thoại RAM ít nhất 8GB');
      const ids = result.map(p => p._id);
      expect(ids).toContain('s1');
      expect(ids).toContain('s3');
      expect(ids).toContain('a1');
      expect(ids).toContain('x1');
      expect(ids).toContain('o1');
      expect(ids).toContain('g1');
    });
  });

  describe('6. RAM alternatives: "điện thoại RAM 8 hoặc 12GB"', () => {
    beforeEach(() => setupVectorSearch(allProducts));

    it('returns only products with exactly 8GB or 12GB RAM', async () => {
      const result = await ChatController.searchRelevantProducts('điện thoại RAM 8 hoặc 12GB');
      for (const p of result) {
        const ram = parseInt((p.specs?.memory?.ram || '').match(/(\d+)/)?.[1] || '0', 10);
        expect([8, 12]).toContain(ram);
      }
    });

    it('excludes 16GB products like Pixel 9 Pro and OnePlus 12', async () => {
      const result = await ChatController.searchRelevantProducts('điện thoại RAM 8 hoặc 12GB');
      const ids = result.map(p => p._id);
      expect(ids).not.toContain('g1');
      expect(ids).not.toContain('o1');
    });

    it('includes 8GB and 12GB products', async () => {
      const result = await ChatController.searchRelevantProducts('điện thoại RAM 8 hoặc 12GB');
      const ids = result.map(p => p._id);
      expect(ids).toContain('s1');
      expect(ids).toContain('s3');
      expect(ids).toContain('a1');
      expect(ids).toContain('x1');
      expect(ids).toContain('x2');
    });
  });

  describe('7. Storage: "điện thoại bộ nhớ 256GB"', () => {
    beforeEach(() => setupVectorSearch(allProducts));

    it('returns only products with exactly 256GB storage', async () => {
      const result = await ChatController.searchRelevantProducts('điện thoại bộ nhớ 256GB');
      for (const p of result) {
        const storage = parseInt((p.specs?.memory?.storage || '').match(/(\d+)/)?.[1] || '0', 10);
        expect(storage).toBe(256);
      }
    });

    it('includes Galaxy S24, Redmi Note 13, Xiaomi 14T, OnePlus 12', async () => {
      const result = await ChatController.searchRelevantProducts('điện thoại bộ nhớ 256GB');
      const ids = result.map(p => p._id);
      expect(ids).toContain('s1');
      expect(ids).toContain('x1');
      expect(ids).toContain('x2');
      expect(ids).toContain('o1');
    });
  });

  describe('8. Storage alternatives: "điện thoại 128GB hoặc 256GB"', () => {
    beforeEach(() => setupVectorSearch(allProducts));

    it('returns products with exactly 128GB or 256GB storage', async () => {
      const result = await ChatController.searchRelevantProducts('điện thoại 128GB hoặc 256GB');
      for (const p of result) {
        const storage = parseInt((p.specs?.memory?.storage || '').match(/(\d+)/)?.[1] || '0', 10);
        expect([128, 256]).toContain(storage);
      }
    });

    it('excludes 64GB and 512GB products', async () => {
      const result = await ChatController.searchRelevantProducts('điện thoại 128GB hoặc 256GB');
      const ids = result.map(p => p._id);
      expect(ids).not.toContain('s4');
      expect(ids).not.toContain('a3');
      expect(ids).not.toContain('s3');
      expect(ids).not.toContain('g1');
    });

    it('includes Galaxy A15 (128GB) and various 256GB products', async () => {
      const result = await ChatController.searchRelevantProducts('điện thoại 128GB hoặc 256GB');
      const ids = result.map(p => p._id);
      expect(ids).toContain('s2');
      expect(ids).toContain('s1');
      expect(ids).toContain('x1');
    });
  });

  describe('9. Color: "điện thoại màu đen"', () => {
    beforeEach(() => setupVectorSearch(allProducts));

    it('returns only black-compatible color products', async () => {
      const result = await ChatController.searchRelevantProducts('điện thoại màu đen');
      const ids = result.map(p => p._id);
      const blackCompatible = ['s1', 's4', 'x1', 'x2', 'a3'];
      for (const id of ids) {
        expect(blackCompatible).toContain(id);
      }
    });

    it('includes Titanium Black, Black, Midnight variants', async () => {
      const result = await ChatController.searchRelevantProducts('điện thoại màu đen');
      const ids = result.map(p => p._id);
      expect(ids).toContain('s1');
      expect(ids).toContain('s4');
      expect(ids).toContain('x1');
      expect(ids).toContain('x2');
      expect(ids).toContain('a3');
    });

    it('excludes Blue, Silver, Natural Titanium, Gold, Red products', async () => {
      const result = await ChatController.searchRelevantProducts('điện thoại màu đen');
      const ids = result.map(p => p._id);
      expect(ids).not.toContain('s2');
      expect(ids).not.toContain('s3');
      expect(ids).not.toContain('a2');
      expect(ids).not.toContain('g1');
      expect(ids).not.toContain('i1');
    });
  });

  describe('10. Combined constraints: all fields simultaneously', () => {
    beforeEach(() => setupVectorSearch(allProducts));

    it('returns only products satisfying ALL constraints', async () => {
      const result = await ChatController.searchRelevantProducts(
        'Samsung hoặc Xiaomi tối đa 12 triệu RAM ít nhất 8GB bộ nhớ 256GB màu đen còn hàng'
      );
      for (const p of result) {
        expect(['samsung', 'xiaomi']).toContain(p.brand);
        expect(p.price).toBeLessThanOrEqual(12_000_000);
        const ram = parseInt((p.specs?.memory?.ram || '').match(/(\d+)/)?.[1] || '0', 10);
        expect(ram).toBeGreaterThanOrEqual(8);
        const storage = parseInt((p.specs?.memory?.storage || '').match(/(\d+)/)?.[1] || '0', 10);
        expect(storage).toBe(256);
        expect(p.specs?.colors?.some(c => /black/i.test(c) || /đen/i.test(c))).toBe(true);
        expect(p.inStock).toBeGreaterThan(0);
      }
    });

    it('returns only Redmi Note 13 (x1) as the sole matching product', async () => {
      const result = await ChatController.searchRelevantProducts(
        'Samsung hoặc Xiaomi tối đa 12 triệu RAM ít nhất 8GB bộ nhớ 256GB màu đen còn hàng'
      );
      const ids = result.map(p => p._id);
      expect(ids).toEqual(['x1']);
    });
  });

  describe('11. No matches: query with no satisfying products', () => {
    beforeEach(() => setupVectorSearch(allProducts));

    it('returns empty array when no product satisfies constraints', async () => {
      const result = await ChatController.searchRelevantProducts('điện thoại RAM ít nhất 100GB');
      expect(result).toEqual([]);
    });

    it('deterministic fallback receives empty products list', async () => {
      jest.clearAllMocks();
      classifyIntentAndRespond.mockResolvedValue({
        intent: 'product_query',
        clarified_query: 'điện thoại RAM ít nhất 100GB Samsung còn hàng',
      });
      setupVectorSearch(allProducts);

      await expect(
        ChatController.processMessage(mockSocket, {
          sessionId: 'test-session',
          message: 'RAM ít nhất 100GB Samsung còn hàng',
        })
      ).rejects.toThrow('AI failed');

      expect(mockCapturedProducts.value).toEqual([]);
    });
  });

  describe('12. All search tiers enforce constraints', () => {
    const samsungUnder15 = (p) => p.brand === 'samsung' && p.price < 15_000_000;
    const matching = () => onlyMatching(allProducts, samsungUnder15);

    it('vector search: returned products satisfy constraints', async () => {
      setupVectorSearch(allProducts);
      const result = await ChatController.searchRelevantProducts('điện thoại Samsung dưới 15 triệu');
      expect(result.length).toBeGreaterThan(0);
      for (const p of result) {
        expect(samsungUnder15(p)).toBe(true);
      }
    });

    it('text fallback: constraints enforced', async () => {
      setupTextFallback([], allProducts);
      const result = await ChatController.searchRelevantProducts('điện thoại Samsung dưới 15 triệu');
      expect(result.length).toBeGreaterThan(0);
      for (const p of result) {
        expect(samsungUnder15(p)).toBe(true);
      }
    });

    it('latest fallback: constraints enforced', async () => {
      setupLatestFallback([], [], allProducts);
      const result = await ChatController.searchRelevantProducts('điện thoại Samsung dưới 15 triệu');
      expect(result.length).toBeGreaterThan(0);
      for (const p of result) {
        expect(samsungUnder15(p)).toBe(true);
      }
    });

    it('error fallback: constraints enforced', async () => {
      setupErrorFallback('vector failed', allProducts);
      const result = await ChatController.searchRelevantProducts('điện thoại Samsung dưới 15 triệu');
      expect(result.length).toBeGreaterThan(0);
      for (const p of result) {
        expect(samsungUnder15(p)).toBe(true);
      }
    });
  });

  describe('13. Gemini/provider failure: deterministic fallback receives filtered products', () => {
    beforeEach(() => {
      classifyIntentAndRespond.mockResolvedValue({
        intent: 'product_query',
        clarified_query: 'điện thoại Samsung dưới 15 triệu',
      });
      setupVectorSearch(allProducts);
    });

    it('deterministic fallback receives only constraint-satisfying products', async () => {
      await expect(
        ChatController.processMessage(mockSocket, {
          sessionId: 'test-session',
          message: 'Samsung dưới 15 triệu',
        })
      ).rejects.toThrow('AI failed');

      const products = mockCapturedProducts.value;
      expect(products.length).toBeGreaterThan(0);
      for (const p of products) {
        expect(p.brand).toBe('samsung');
        expect(p.price).toBeLessThan(15_000_000);
      }
    });
  });

  describe('14. Backward compatibility: no hard constraints', () => {
    it('returns products from semantic search without constraint filtering', async () => {
      setupVectorSearch(allProducts);
      const result = await ChatController.searchRelevantProducts('điện thoại mới');
      expect(result.length).toBeGreaterThan(0);
    });

    it('passes limit to vector search pipeline', async () => {
      setupVectorSearch(allProducts);
      await ChatController.searchRelevantProducts('điện thoại mới', 3);
      const pipeline = Product.aggregate.mock.calls[0][0];
      const vectorStage = pipeline.find(s => s.$vectorSearch);
      expect(vectorStage.$vectorSearch.limit).toBe(3);
    });

    it('does not alter result count with no constraints', async () => {
      const subset = allProducts.slice(0, 3);
      setupVectorSearch(subset);
      const result = await ChatController.searchRelevantProducts('điện thoại mới');
      expect(result.length).toBe(3);
    });
  });
});
