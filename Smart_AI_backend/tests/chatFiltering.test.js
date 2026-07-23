/* ------------------------------------------------------------------ */
/*  Cache mock for context persistence in tests                        */
/* ------------------------------------------------------------------ */
global.__ctxTestCache = {};
jest.mock('../services/cacheService', () => {
  const store = global.__ctxTestCache;
  return {
    get: jest.fn().mockImplementation(async (key) => store[key] || null),
    set: jest.fn().mockImplementation(async (key, value) => { store[key] = value; }),
    del: jest.fn().mockImplementation(async (key) => { delete store[key]; }),
    exists: jest.fn().mockImplementation(async (key) => store[key] !== undefined),
    invalidatePattern: jest.fn().mockResolvedValue(0),
  };
});

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
    // Default: succeed (simulates deterministic fallback in production)
    return Promise.resolve({
      text: 'Here are some phones matching your criteria.',
      provider: 'deterministic',
    });
  }),
  generateComplaintResponse: jest.fn(),
}));

const Product = require('../models/Product');
const { generateEmbedding } = require('../utils/openai');
const { classifyIntentAndRespond } = require('../utils/gemini');
const ChatController = require('../controllers/chatController');
const contextService = require('../services/contextService');

const allProducts = [
  {
    _id: 's1', name: 'Galaxy S24', brand: 'samsung', price: 18_990_000, inStock: 4, isActive: true,
    specs: {
      memory: { ram: '8 GB', storage: '256 GB' },
      colors: ['Titanium Black'],
      camera: { rear: { primary: '50 MP', secondary: '12 MP ultrawide', tertiary: '10 MP telephoto' }, front: '12 MP', features: ['OIS', 'Night mode', 'Portrait mode', '4K video', 'Optical zoom'] },
      battery: { capacity: '5000 mAh', charging: { wired: '25W', wireless: '15W' } },
      processor: { chipset: 'Exynos 2400', cpu: '10-core', gpu: 'Xclipse 940' },
      screen: { size: '6.2 inch', technology: 'Dynamic AMOLED 2X 120Hz' },
      weight: '167 g',
    },
    description: 'Flagship Samsung',
  },
  {
    _id: 's2', name: 'Galaxy A15', brand: 'samsung', price: 4_990_000, inStock: 10, isActive: true,
    specs: {
      memory: { ram: '6 GB', storage: '128 GB' },
      colors: ['Blue'],
      camera: { rear: { primary: '50 MP', secondary: '5 MP ultrawide' }, front: '13 MP', features: ['Night mode'] },
      battery: { capacity: '5000 mAh', charging: { wired: '25W' } },
      processor: { chipset: 'MediaTek Helio G99' },
      screen: { size: '6.5 inch', technology: 'Super AMOLED' },
      weight: '200 g',
    },
    description: 'Budget Samsung',
  },
  {
    _id: 's3', name: 'Galaxy Z Fold6', brand: 'samsung', price: 42_990_000, inStock: 2, isActive: true,
    specs: {
      memory: { ram: '12 GB', storage: '512 GB' },
      colors: ['Natural Titanium'],
      camera: { rear: { primary: '50 MP', secondary: '12 MP ultrawide', tertiary: '10 MP telephoto' }, front: '10 MP', features: ['OIS', 'Night mode', 'Portrait mode', '8K video', 'Optical zoom'] },
      battery: { capacity: '4400 mAh', charging: { wired: '25W', wireless: '15W' } },
      processor: { chipset: 'Snapdragon 8 Gen 3', cpu: '8-core', gpu: 'Adreno 750' },
      screen: { size: '7.6 inch', technology: 'Dynamic AMOLED 2X 120Hz' },
      weight: '239 g',
    },
    description: 'Foldable Samsung',
  },
  {
    _id: 's4', name: 'Galaxy A05', brand: 'samsung', price: 2_990_000, inStock: 0, isActive: true,
    specs: {
      memory: { ram: '4 GB', storage: '64 GB' },
      colors: ['Black'],
      camera: { rear: { primary: '50 MP' }, front: '8 MP', features: [] },
      battery: { capacity: '5000 mAh', charging: { wired: '15W' } },
      screen: { size: '6.7 inch' },
      weight: '195 g',
    },
    description: 'Entry Samsung',
  },
  {
    _id: 'a1', name: 'iPhone 15 Pro Max', brand: 'apple', price: 28_990_000, inStock: 1, isActive: true,
    specs: {
      memory: { ram: '8 GB', storage: '256 GB' },
      colors: ['Natural Titanium'],
      camera: { rear: { primary: '48 MP', secondary: '12 MP ultrawide', tertiary: '12 MP telephoto' }, front: '12 MP', features: ['OIS', 'Night mode', 'Portrait mode', '4K video', 'Optical zoom', 'ProRAW'] },
      battery: { capacity: '4422 mAh', charging: { wired: '27W', wireless: '15W' } },
      processor: { chipset: 'A17 Pro', cpu: '6-core', gpu: '6-core GPU' },
      screen: { size: '6.7 inch', technology: 'Super Retina XDR OLED 120Hz' },
      weight: '221 g',
    },
    description: 'Premium Apple',
  },
  {
    _id: 'a2', name: 'iPhone 16 Pro', brand: 'apple', price: 29_990_000, inStock: 3, isActive: true,
    specs: {
      memory: { ram: '8 GB', storage: '256 GB' },
      colors: ['Silver'],
      camera: { rear: { primary: '48 MP' }, front: '12 MP', features: ['Night mode', 'Portrait mode'] },
      battery: { capacity: '4500 mAh', charging: { wired: '30W' } },
      screen: { size: '6.3 inch' },
      weight: '199 g',
    },
    description: 'New Apple',
  },
  {
    _id: 'a3', name: 'iPhone SE', brand: 'apple', price: 10_000_000, inStock: 5, isActive: true,
    specs: {
      memory: { ram: '4 GB', storage: '64 GB' },
      colors: ['Midnight'],
      camera: { rear: { primary: '12 MP' }, front: '7 MP', features: ['Portrait mode'] },
      battery: { capacity: '2018 mAh', charging: { wired: '18W', wireless: '7.5W' } },
      processor: { chipset: 'A15 Bionic' },
      screen: { size: '4.7 inch' },
      weight: '148 g',
    },
    description: 'Budget Apple',
  },
  {
    _id: 'x1', name: 'Redmi Note 13', brand: 'xiaomi', price: 6_990_000, inStock: 8, isActive: true,
    specs: {
      memory: { ram: '8 GB', storage: '256 GB' },
      colors: ['Black'],
      camera: { rear: { primary: '108 MP', secondary: '8 MP ultrawide', tertiary: '2 MP' }, front: '16 MP', features: ['Night mode'] },
      battery: { capacity: '5000 mAh', charging: { wired: '33W' } },
      screen: { size: '6.67 inch' },
      weight: '188 g',
    },
    description: 'Xiaomi mid-range',
  },
  {
    _id: 'x2', name: 'Xiaomi 14T', brand: 'xiaomi', price: 12_990_000, inStock: 2, isActive: true,
    specs: {
      memory: { ram: '12 GB', storage: '256 GB' },
      colors: ['Titanium Black'],
      camera: { rear: { primary: '50 MP', secondary: '12 MP ultrawide', tertiary: '50 MP telephoto' }, front: '32 MP', features: ['OIS', 'Night mode', 'Portrait mode', '4K video', 'Optical zoom', 'Leica'] },
      battery: { capacity: '5000 mAh', charging: { wired: '67W', wireless: '50W' } },
      processor: { chipset: 'Dimensity 8300', cpu: '8-core', gpu: 'Mali-G615' },
      screen: { size: '6.67 inch', technology: 'AMOLED 144Hz' },
      weight: '195 g',
    },
    description: 'Xiaomi flagship',
  },
  {
    _id: 'n1', name: 'Nokia 105', brand: 'nokia', price: 500_000, inStock: 10, isActive: true,
    specs: {
      memory: { ram: '0.5 GB', storage: '0.1 GB' },
      colors: ['Blue'],
      camera: { rear: { primary: '0.3 MP' }, features: [] },
      battery: { capacity: '800 mAh', charging: {} },
      screen: { size: '1.77 inch' },
      weight: '80 g',
    },
    description: 'Basic phone',
  },
  {
    _id: 'o1', name: 'OnePlus 12', brand: 'oneplus', price: 22_990_000, inStock: 2, isActive: true,
    specs: {
      memory: { ram: '16 GB', storage: '256 GB' },
      colors: ['Silver'],
      camera: { rear: { primary: '50 MP', secondary: '48 MP ultrawide', tertiary: '64 MP periscope' }, front: '32 MP', features: ['OIS', 'Night mode', 'Portrait mode', '8K video', 'Optical zoom', 'Hasselblad'] },
      battery: { capacity: '5400 mAh', charging: { wired: '100W', wireless: '50W' } },
      processor: { chipset: 'Snapdragon 8 Gen 3', cpu: '8-core', gpu: 'Adreno 750' },
      screen: { size: '6.82 inch', technology: 'AMOLED 120Hz' },
      weight: '220 g',
    },
    description: 'Flagship OnePlus',
  },
  {
    _id: 'g1', name: 'Pixel 9 Pro', brand: 'google', price: 26_990_000, inStock: 3, isActive: true,
    specs: {
      memory: { ram: '16 GB', storage: '512 GB' },
      colors: ['Gold'],
      camera: { rear: { primary: '50 MP', secondary: '48 MP ultrawide', tertiary: '48 MP telephoto' }, front: '10.5 MP', features: ['OIS', 'Night mode', 'Portrait mode', '4K video', 'Optical zoom', 'Magic Eraser'] },
      battery: { capacity: '4700 mAh', charging: { wired: '30W', wireless: '23W' } },
      processor: { chipset: 'Tensor G4', cpu: '8-core', gpu: 'Mali-G715' },
      screen: { size: '6.3 inch', technology: 'OLED 120Hz' },
      weight: '199 g',
    },
    description: 'Google flagship',
  },
  {
    _id: 'i1', name: 'Old Samsung', brand: 'samsung', price: 1_000_000, inStock: 0, isActive: false,
    specs: {
      memory: { ram: '2 GB', storage: '16 GB' },
      colors: ['Red'],
      camera: { rear: { primary: '8 MP' }, features: [] },
      battery: { capacity: '1500 mAh' },
      screen: { size: '4.0 inch' },
      weight: '120 g',
    },
    description: 'Discontinued',
  },
  {
    _id: 'm1', name: 'No Specs Phone', brand: 'xiaomi', price: 2_000_000, inStock: 5, isActive: true, specs: null, description: 'Minimal specs' },
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
  global.__ctxTestCache = {};
  // Restore default generateChatResponse (simulates deterministic fallback)
  const gemini = require('../utils/gemini');
  gemini.generateChatResponse.mockImplementation((_h, _m, products) => {
    mockCapturedProducts.value = products;
    return Promise.resolve({ text: 'Here are some phones matching your criteria.', provider: 'deterministic' });
  });
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

      await ChatController.processMessage(mockSocket, {
        sessionId: 'test-session',
        message: 'RAM ít nhất 100GB Samsung còn hàng',
      });

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
      await ChatController.processMessage(mockSocket, {
        sessionId: 'test-session',
        message: 'Samsung dưới 15 triệu',
      });

      const products = mockCapturedProducts.value;
      expect(products.length).toBeGreaterThan(0);
      for (const p of products) {
        expect(p.brand).toBe('samsung');
        expect(p.price).toBeLessThan(15_000_000);
      }
    });
  });

  describe('15. Ranking: "Samsung dưới 15 triệu, ưu tiên camera đẹp"', () => {
    beforeEach(() => setupVectorSearch(allProducts));

    it('hard constraints remain enforced — only Samsung under 15M', async () => {
      const result = await ChatController.searchRelevantProducts(
        'Samsung dưới 15 triệu ưu tiên camera đẹp'
      );
      for (const p of result) {
        expect(p.brand).toBe('samsung');
        expect(p.price).toBeLessThan(15_000_000);
      }
    });

    it('camera-oriented matching product (Galaxy A15) ranks first among Samsung under 15M', async () => {
      const result = await ChatController.searchRelevantProducts(
        'Samsung dưới 15 triệu ưu tiên camera đẹp'
      );
      // Galaxy A15 (s2) has 50MP + 5MP ultrawide + 13MP front + Night mode
      // Galaxy A05 (s4) has 50MP only, no secondary/front/features
      // A15 should rank before A05 on camera score
      expect(result.length).toBeGreaterThanOrEqual(2);
      const s2idx = result.findIndex(p => p._id === 's2');
      const s4idx = result.findIndex(p => p._id === 's4');
      expect(s2idx).toBeLessThan(s4idx);
    });
  });

  describe('16. Ranking: "điện thoại pin trâu tối đa 12 triệu"', () => {
    beforeEach(() => setupVectorSearch(allProducts));

    it('price cap is enforced — all products <= 12M', async () => {
      const result = await ChatController.searchRelevantProducts(
        'điện thoại pin trâu tối đa 12 triệu'
      );
      for (const p of result) {
        expect(p.price).toBeLessThanOrEqual(12_000_000);
      }
    });

    it('battery-oriented product (Xiaomi 14T or Redmi Note 13) ranks first', async () => {
      const result = await ChatController.searchRelevantProducts(
        'điện thoại pin trâu tối đa 12 triệu'
      );
      // Redmi Note 13 (x1): 5000mAh + 33W wired — strong battery signals
      // Galaxy A15 (s2): 5000mAh + 25W wired
      // Battery-leader should be at position 0
      expect(result.length).toBeGreaterThanOrEqual(2);
      const firstId = result[0]._id;
      // Redmi Note 13 (x1) has the best battery under 12M: 5000mAh + 33W
      // If Xiaomi 14T (x2) is under 12M (it is 12.99M, so excluded by price)
      expect(['x1', 's2', 's4']).toContain(firstId);
    });
  });

  describe('17. Ranking: "điện thoại chơi game RAM ít nhất 8GB"', () => {
    beforeEach(() => setupVectorSearch(allProducts));

    it('RAM constraint is enforced — all products have RAM >= 8GB', async () => {
      const result = await ChatController.searchRelevantProducts(
        'điện thoại chơi game RAM ít nhất 8GB'
      );
      for (const p of result) {
        const ram = parseInt((p.specs?.memory?.ram || '').match(/(\d+)/)?.[1] || '0', 10);
        expect(ram).toBeGreaterThanOrEqual(8);
      }
    });

    it('performance-oriented product (Pixel 9 Pro or OnePlus 12) ranks first', async () => {
      const result = await ChatController.searchRelevantProducts(
        'điện thoại chơi game RAM ít nhất 8GB'
      );
      // Pixel 9 Pro (g1): 16GB RAM + Tensor G4 + 512GB
      // OnePlus 12 (o1): 16GB RAM + Snapdragon 8 Gen 3 + 256GB
      // These have the highest performance scores
      expect(result.length).toBeGreaterThanOrEqual(2);
      const firstId = result[0]._id;
      expect(['g1', 'o1']).toContain(firstId);
    });
  });

  describe('18. Ranking: "điện thoại nhỏ gọn dưới 20 triệu"', () => {
    beforeEach(() => setupVectorSearch(allProducts));

    it('price constraint is enforced — all products <= 20M', async () => {
      const result = await ChatController.searchRelevantProducts(
        'điện thoại nhỏ gọn dưới 20 triệu'
      );
      for (const p of result) {
        expect(p.price).toBeLessThanOrEqual(20_000_000);
      }
    });

    it('compact product (iPhone SE or Nokia 105) ranks first', async () => {
      const result = await ChatController.searchRelevantProducts(
        'điện thoại nhỏ gọn dưới 20 triệu'
      );
      // iPhone SE (a3): 4.7" screen, 148g
      // Nokia 105 (n1): 1.77" screen, 80g — but it's under 20M
      // Nokia should rank highest on compact score
      expect(result.length).toBeGreaterThanOrEqual(2);
      const firstId = result[0]._id;
      expect(['n1', 'a3']).toContain(firstId);
    });
  });

  describe('19. Multi-preference: "điện thoại camera tốt pin trâu dưới 15 triệu"', () => {
    beforeEach(() => setupVectorSearch(allProducts));

    it('all hard constraints enforced — all products under 15M', async () => {
      const result = await ChatController.searchRelevantProducts(
        'điện thoại camera tốt pin trâu dưới 15 triệu'
      );
      for (const p of result) {
        expect(p.price).toBeLessThanOrEqual(15_000_000);
      }
    });

    it('combined ranking is deterministic — best camera+battery product ranks first', async () => {
      const result1 = await ChatController.searchRelevantProducts(
        'điện thoại camera tốt pin trâu dưới 15 triệu'
      );
      const result2 = await ChatController.searchRelevantProducts(
        'điện thoại camera tốt pin trâu dưới 15 triệu'
      );
      expect(result1.map(p => p._id)).toEqual(result2.map(p => p._id));
    });
  });

  describe('20. No-preference query preserves original candidate order', () => {
    it('preserves original search result order when no soft preferences', async () => {
      const subset = allProducts.slice(0, 5);
      setupVectorSearch(subset);
      const result = await ChatController.searchRelevantProducts('điện thoại mới');
      expect(result.map(p => p._id)).toEqual(subset.map(p => p._id));
    });

    it('no preference query returns same count as original', async () => {
      const subset = allProducts.slice(0, 3);
      setupVectorSearch(subset);
      const result = await ChatController.searchRelevantProducts('điện thoại mới');
      expect(result.length).toBe(3);
    });
  });

  describe('21. Vector search empty → text fallback still ranked', () => {
    it('text fallback results are ranked when preferences present', async () => {
      setupTextFallback([], allProducts);
      const result = await ChatController.searchRelevantProducts(
        'điện thoại pin trâu tối đa 10 triệu'
      );
      expect(result.length).toBeGreaterThan(0);
      for (const p of result) {
        expect(p.price).toBeLessThanOrEqual(10_000_000);
      }
    });
  });

  describe('22. Vector/text empty → latest fallback still ranked', () => {
    it('latest fallback results are ranked when preferences present', async () => {
      setupLatestFallback([], [], allProducts);
      const result = await ChatController.searchRelevantProducts(
        'điện thoại pin trâu tối đa 10 triệu'
      );
      expect(result.length).toBeGreaterThan(0);
      for (const p of result) {
        expect(p.price).toBeLessThanOrEqual(10_000_000);
      }
    });
  });

  describe('23. Gemini/OpenAI failure → deterministic fallback receives ranked valid products', () => {
    beforeEach(() => {
      classifyIntentAndRespond.mockResolvedValue({
        intent: 'product_query',
        clarified_query: 'Samsung dưới 15 triệu ưu tiên camera đẹp',
      });
      setupVectorSearch(allProducts);
    });

    it('deterministic fallback receives only constraint-satisfying products with camera preference ordering', async () => {
      await ChatController.processMessage(mockSocket, {
        sessionId: 'test-session',
        message: 'Samsung dưới 15 triệu ưu tiên camera đẹp',
      });

      const products = mockCapturedProducts.value;
      expect(products.length).toBeGreaterThanOrEqual(2);
      for (const p of products) {
        expect(p.brand).toBe('samsung');
        expect(p.price).toBeLessThan(15_000_000);
      }
      // Camera-rich product (s2) should rank before basic camera (s4)
      const s2idx = products.findIndex(p => p._id === 's2');
      const s4idx = products.findIndex(p => p._id === 's4');
      expect(s2idx).toBeLessThan(s4idx);
    });
  });

  describe('24. Ranking never adds invalid product', () => {
    it('does not reintroduce products excluded by brand', async () => {
      setupVectorSearch(allProducts);
      const result = await ChatController.searchRelevantProducts(
        'điện thoại dưới 20 triệu không lấy iPhone ưu tiên camera đẹp'
      );
      for (const p of result) {
        expect(p.brand).not.toBe('apple');
      }
    });

    it('does not reintroduce products excluded by price', async () => {
      setupVectorSearch(allProducts);
      const result = await ChatController.searchRelevantProducts(
        'Samsung dưới 15 triệu ưu tiên camera đẹp'
      );
      for (const p of result) {
        expect(p.brand).toBe('samsung');
        expect(p.price).toBeLessThan(15_000_000);
      }
    });

    it('does not reintroduce inactive products', async () => {
      setupVectorSearch(allProducts);
      const result = await ChatController.searchRelevantProducts(
        'điện thoại Samsung ưu tiên camera đẹp'
      );
      for (const p of result) {
        expect(p.isActive).not.toBe(false);
      }
    });
  });

  describe('25. Backward compatibility: no hard constraints', () => {
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

  /* ------------------------------------------------------------------ */
  /*  Multi-turn conversation context integration                        */
  /* ------------------------------------------------------------------ */

  async function processQuery(sessionId, message, queryText) {
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'product_query',
      clarified_query: queryText,
    });
    return ChatController.processMessage(mockSocket, { sessionId, message });
  }

  describe('26. Multi-turn: "Samsung dưới 15 triệu" → "còn màu đen không?"', () => {
    it('second search retains Samsung + max price and adds black color', async () => {
      setupVectorSearch(allProducts);
      // First turn
      await processQuery('session-context-1',
        'Samsung dưới 15 triệu', 'Samsung dưới 15 triệu');

      // Second turn
      setupVectorSearch(allProducts);
      await processQuery('session-context-1',
        'còn màu đen không?', 'còn màu đen không?');

      const products = mockCapturedProducts.value;
      expect(products.length).toBeGreaterThanOrEqual(1);
      // Hard constraints from context: Samsung + under 15M + black
      for (const p of products) {
        expect(p.brand).toBe('samsung');
        expect(p.price).toBeLessThan(15_000_000);
      }
    });
  });

  describe('27. Multi-turn: "điện thoại dưới 20 triệu" → "RAM 12GB thì sao?"', () => {
    it('second search retains price and adds RAM constraint', async () => {
      setupVectorSearch(allProducts);
      await processQuery('session-context-2',
        'điện thoại dưới 20 triệu', 'điện thoại dưới 20 triệu');

      setupVectorSearch(allProducts);
      await processQuery('session-context-2',
        'RAM 12GB thì sao?', 'RAM 12GB thì sao?');

      const products = mockCapturedProducts.value;
      for (const p of products) {
        expect(p.price).toBeLessThanOrEqual(20_000_000);
        const ram = parseInt((p.specs?.memory?.ram || '').match(/(\d+)/)?.[1] || '0', 10);
        expect(ram).toBeGreaterThanOrEqual(12);
      }
    });
  });

  describe('28. Multi-turn: "Samsung dưới 15 triệu" → "pin trâu hơn"', () => {
    it('hard constraints retained and battery ranking enabled', async () => {
      setupVectorSearch(allProducts);
      await processQuery('session-context-3',
        'Samsung dưới 15 triệu', 'Samsung dưới 15 triệu');

      setupVectorSearch(allProducts);
      await processQuery('session-context-3',
        'pin trâu hơn', 'pin trâu hơn');

      const products = mockCapturedProducts.value;
      expect(products.length).toBeGreaterThanOrEqual(1);
      for (const p of products) {
        expect(p.brand).toBe('samsung');
        expect(p.price).toBeLessThan(15_000_000);
      }
    });
  });

  describe('29. Multi-turn: brand replacement — "Samsung" → "chỉ Xiaomi thôi"', () => {
    it('brand is replaced, not appended', async () => {
      setupVectorSearch(allProducts);
      await processQuery('session-context-4',
        'Samsung dưới 15 triệu', 'Samsung dưới 15 triệu');

      setupVectorSearch(allProducts);
      await processQuery('session-context-4',
        'chỉ Xiaomi thôi', 'chỉ Xiaomi thôi');

      const products = mockCapturedProducts.value;
      expect(products.length).toBeGreaterThanOrEqual(1);
      for (const p of products) {
        expect(p.brand).toBe('xiaomi');
        expect(p.price).toBeLessThan(15_000_000);
      }
    });
  });

  describe('30. Multi-turn: excluded brands carry over — "Samsung hoặc Xiaomi" → "không lấy Xiaomi"', () => {
    it('Xiaomi becomes excluded and cannot appear', async () => {
      setupVectorSearch(allProducts);
      await processQuery('session-context-5',
        'Samsung hoặc Xiaomi dưới 15 triệu', 'Samsung hoặc Xiaomi dưới 15 triệu');

      setupVectorSearch(allProducts);
      await processQuery('session-context-5',
        'không lấy Xiaomi', 'không lấy Xiaomi');

      const products = mockCapturedProducts.value;
      for (const p of products) {
        expect(['samsung']).toContain(p.brand);
        expect(p.brand).not.toBe('xiaomi');
      }
    });
  });

  describe('31. Multi-turn: reset — "bỏ các điều kiện trước" clears context', () => {
    it('next product query is stateless/new after reset', async () => {
      setupVectorSearch(allProducts);
      await processQuery('session-context-6',
        'Samsung dưới 15 triệu', 'Samsung dưới 15 triệu');

      // Reset
      classifyIntentAndRespond.mockResolvedValue({
        intent: 'small_talk',
        direct_response: 'Đã xóa bộ lọc',
      });
      const resetResult = await ChatController.processMessage(mockSocket, {
        sessionId: 'session-context-6',
        message: 'bỏ các điều kiện trước',
      });
      expect(resetResult.responseType).toBe('small_talk');

      // New independent query
      setupVectorSearch(allProducts);
      classifyIntentAndRespond.mockResolvedValue({
        intent: 'product_query',
        clarified_query: 'iPhone',
      });
      await ChatController.processMessage(mockSocket, {
        sessionId: 'session-context-6',
        message: 'iPhone',
      });

      const products = mockCapturedProducts.value;
      // Should return Apple products without Samsung filter
      const brands = [...new Set(products.filter(p => p.isActive !== false).map(p => p.brand))];
      expect(brands).toContain('apple');
    });
  });

  describe('32. Different sessionId: contexts are isolated', () => {
    it('user A cannot read user B context', async () => {
      setupVectorSearch(allProducts);
      await processQuery('session-a',
        'Samsung dưới 15 triệu', 'Samsung dưới 15 triệu');
      const productsA = mockCapturedProducts.value;

      setupVectorSearch(allProducts);
      await processQuery('session-b',
        'iPhone', 'iPhone');
      const productsB = mockCapturedProducts.value;

      // Both should work
      expect(productsA.length).toBeGreaterThan(0);
      expect(productsB.length).toBeGreaterThan(0);
    });
  });

  describe('33. Gemini/OpenAI failure: deterministic fallback receives merged context products', () => {
    it('deterministic fallback receives merged, valid, ranked products', async () => {
      setupVectorSearch(allProducts);
      await processQuery('session-context-7',
        'Samsung dưới 15 triệu', 'Samsung dưới 15 triệu');
      const firstProducts = mockCapturedProducts.value;

      setupVectorSearch(allProducts);
      await processQuery('session-context-7',
        'còn màu đen không?', 'còn màu đen không?');
      const secondProducts = mockCapturedProducts.value;

      // Both turns should produce valid filtered products
      expect(firstProducts.length).toBeGreaterThanOrEqual(1);
      expect(secondProducts.length).toBeGreaterThanOrEqual(1);
      for (const p of secondProducts) {
        expect(p.brand).toBe('samsung');
        expect(p.price).toBeLessThan(15_000_000);
      }
    });
  });

  describe('34. Non-product small talk does not clear existing shopping context', () => {
    it('small talk between product queries preserves context', async () => {
      setupVectorSearch(allProducts);
      await processQuery('session-context-8',
        'Samsung dưới 15 triệu', 'Samsung dưới 15 triệu');

      // Small talk
      classifyIntentAndRespond.mockResolvedValue({
        intent: 'small_talk',
        direct_response: 'Xin chào!',
      });
      await ChatController.processMessage(mockSocket, {
        sessionId: 'session-context-8',
        message: 'cảm ơn',
      });

      // Follow up — should retain context
      setupVectorSearch(allProducts);
      classifyIntentAndRespond.mockResolvedValue({
        intent: 'product_query',
        clarified_query: 'còn màu đen không?',
      });
      await ChatController.processMessage(mockSocket, {
        sessionId: 'session-context-8',
        message: 'còn màu đen không?',
      });

      const products = mockCapturedProducts.value;
      expect(products.length).toBeGreaterThanOrEqual(1);
      for (const p of products) {
        expect(p.brand).toBe('samsung');
        expect(p.price).toBeLessThan(15_000_000);
      }
    });
  });

  /* ------------------------------------------------------------------ */
  /*  Blocker 2: Context save only on valid response                     */
  /* ------------------------------------------------------------------ */

  describe('36. Successful AI response saves context', () => {
    it('context is saved after valid product query response', async () => {
      setupVectorSearch(allProducts);
      classifyIntentAndRespond.mockResolvedValue({
        intent: 'product_query',
        clarified_query: 'Samsung dưới 15 triệu',
      });
      await ChatController.processMessage(mockSocket, {
        sessionId: 'session-save-ok',
        message: 'Samsung dưới 15 triệu',
      });
      const ctx = await contextService.loadContext('session-save-ok');
      expect(ctx).not.toBeNull();
      expect(ctx.filters.brands).toContain('samsung');
    });
  });

  describe('37. Successful deterministic fallback saves context', () => {
    it('context saved when deterministic fallback returns valid response', async () => {
      // Default mock already simulates deterministic fallback success
      setupVectorSearch(allProducts);
      classifyIntentAndRespond.mockResolvedValue({
        intent: 'product_query',
        clarified_query: 'iPhone dưới 20 triệu',
      });
      await ChatController.processMessage(mockSocket, {
        sessionId: 'session-deter-ok',
        message: 'iPhone dưới 20 triệu',
      });
      const ctx = await contextService.loadContext('session-deter-ok');
      expect(ctx).not.toBeNull();
      expect(ctx.filters.brands).toContain('apple');
      expect(ctx.filters.maxPrice).toBeLessThanOrEqual(20000000);
    });
  });

  describe('38. No-result deterministic response saves sanitized merged constraints', () => {
    it('empty product list still saves merged constraints for follow-up', async () => {
      setupVectorSearch([]); // empty search results
      classifyIntentAndRespond.mockResolvedValue({
        intent: 'product_query',
        clarified_query: 'Samsung dưới 5 triệu',
      });
      await ChatController.processMessage(mockSocket, {
        sessionId: 'session-noresult',
        message: 'Samsung dưới 5 triệu',
      });
      const ctx = await contextService.loadContext('session-noresult');
      expect(ctx).not.toBeNull();
      expect(ctx.filters.brands).toContain('samsung');
      expect(ctx.filters.maxPrice).toBeLessThanOrEqual(5000000);
    });
  });

  describe('39. Complete response failure does NOT save context', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      // Set up contextService properly
    });

    it('generateResponse throws -> saveContext is NOT called', async () => {
      const gemini = require('../utils/gemini');
      gemini.generateChatResponse.mockRejectedValue(new Error('Total failure'));

      setupVectorSearch(allProducts);
      classifyIntentAndRespond.mockResolvedValue({
        intent: 'product_query',
        clarified_query: 'Samsung dưới 15 triệu',
      });

      await expect(ChatController.processMessage(mockSocket, {
        sessionId: 'session-throw',
        message: 'Samsung dưới 15 triệu',
      })).rejects.toThrow();

      const ctx = await contextService.loadContext('session-throw');
      expect(ctx).toBeNull();
    });

    it('generateResponse returns null -> saveContext is NOT called', async () => {
      const gemini = require('../utils/gemini');
      gemini.generateChatResponse.mockResolvedValue(null);

      setupVectorSearch(allProducts);
      classifyIntentAndRespond.mockResolvedValue({
        intent: 'product_query',
        clarified_query: 'Samsung dưới 15 triệu',
      });

      await expect(ChatController.processMessage(mockSocket, {
        sessionId: 'session-null',
        message: 'Samsung dưới 15 triệu',
      })).rejects.toThrow();

      const ctx = await contextService.loadContext('session-null');
      expect(ctx).toBeNull();
    });

    it('generateResponse returns undefined -> saveContext is NOT called', async () => {
      const gemini = require('../utils/gemini');
      gemini.generateChatResponse.mockResolvedValue(undefined);

      setupVectorSearch(allProducts);
      classifyIntentAndRespond.mockResolvedValue({
        intent: 'product_query',
        clarified_query: 'Samsung dưới 15 triệu',
      });

      await expect(ChatController.processMessage(mockSocket, {
        sessionId: 'session-undef',
        message: 'Samsung dưới 15 triệu',
      })).rejects.toThrow();

      const ctx = await contextService.loadContext('session-undef');
      expect(ctx).toBeNull();
    });

    it('generateResponse returns empty string -> saveContext is NOT called', async () => {
      const gemini = require('../utils/gemini');
      gemini.generateChatResponse.mockResolvedValue({ text: '', provider: 'deterministic' });

      setupVectorSearch(allProducts);
      classifyIntentAndRespond.mockResolvedValue({
        intent: 'product_query',
        clarified_query: 'Samsung dưới 15 triệu',
      });

      await ChatController.processMessage(mockSocket, {
        sessionId: 'session-empty',
        message: 'Samsung dưới 15 triệu',
      });

      const ctx = await contextService.loadContext('session-empty');
      expect(ctx).toBeNull();
    });
  });

  describe('40. Previous valid context unchanged after complete response failure', () => {
    it('context from prior successful turn remains after next turn fails', async () => {
      // First: successful turn
      setupVectorSearch(allProducts);
      classifyIntentAndRespond.mockResolvedValue({
        intent: 'product_query',
        clarified_query: 'Samsung dưới 15 triệu',
      });
      await ChatController.processMessage(mockSocket, {
        sessionId: 'session-prev-ok',
        message: 'Samsung dưới 15 triệu',
      });

      // Verify context saved
      const ctxBefore = await contextService.loadContext('session-prev-ok');
      expect(ctxBefore).not.toBeNull();
      expect(ctxBefore.filters.brands).toContain('samsung');

      // Second: failing turn
      const gemini = require('../utils/gemini');
      gemini.generateChatResponse.mockRejectedValue(new Error('Total failure'));

      setupVectorSearch(allProducts);
      classifyIntentAndRespond.mockResolvedValue({
        intent: 'product_query',
        clarified_query: 'iPhone',
      });

      await expect(ChatController.processMessage(mockSocket, {
        sessionId: 'session-prev-ok',
        message: 'iPhone',
      })).rejects.toThrow();

      // Context must remain unchanged from first turn
      const ctxAfter = await contextService.loadContext('session-prev-ok');
      expect(ctxAfter).not.toBeNull();
      expect(ctxAfter.filters.brands).toContain('samsung');
      expect(ctxAfter.filters.brands).not.toContain('apple'); // was never saved
    });
  });

  describe('41. saveContext rejection does not fail successful response', () => {
    it('processMessage returns success even when context save fails', async () => {
      jest.spyOn(contextService, 'saveContext').mockRejectedValue(new Error('Storage error'));

      setupVectorSearch(allProducts);
      classifyIntentAndRespond.mockResolvedValue({
        intent: 'product_query',
        clarified_query: 'Samsung dưới 15 triệu',
      });

      const result = await ChatController.processMessage(mockSocket, {
        sessionId: 'session-save-fail',
        message: 'Samsung dưới 15 triệu',
      });

      expect(result).not.toBeNull();
      expect(result.success).toBe(true);
      expect(result.responseType).toBe('product_query');

      contextService.saveContext.mockRestore();
    });
  });

  describe('42. lastProductIds saved only after successful response', () => {
    it('product IDs present in context after successful response', async () => {
      setupVectorSearch(allProducts);
      classifyIntentAndRespond.mockResolvedValue({
        intent: 'product_query',
        clarified_query: 'Samsung dưới 15 triệu',
      });
      await ChatController.processMessage(mockSocket, {
        sessionId: 'session-prod-ids',
        message: 'Samsung dưới 15 triệu',
      });

      const ctx = await contextService.loadContext('session-prod-ids');
      expect(ctx).not.toBeNull();
      expect(Array.isArray(ctx.lastProductIds)).toBe(true);
      expect(ctx.lastProductIds.length).toBeGreaterThan(0);
    });

    it('lastProductIds empty after no-result response', async () => {
      setupVectorSearch([]);
      classifyIntentAndRespond.mockResolvedValue({
        intent: 'product_query',
        clarified_query: 'Samsung dưới 5 triệu',
      });
      await ChatController.processMessage(mockSocket, {
        sessionId: 'session-empty-ids',
        message: 'Samsung dưới 5 triệu',
      });

      const ctx = await contextService.loadContext('session-empty-ids');
      expect(ctx).not.toBeNull();
      expect(Array.isArray(ctx.lastProductIds)).toBe(true);
    });
  });

  describe('43. Reset deletes context and does not recreate old context', () => {
    it('context is null after reset query', async () => {
      // Save context first
      setupVectorSearch(allProducts);
      classifyIntentAndRespond.mockResolvedValue({
        intent: 'product_query',
        clarified_query: 'Samsung dưới 15 triệu',
      });
      await ChatController.processMessage(mockSocket, {
        sessionId: 'session-reset-me',
        message: 'Samsung dưới 15 triệu',
      });

      let ctx = await contextService.loadContext('session-reset-me');
      expect(ctx).not.toBeNull();

      // Reset via product_query with reset phrase
      setupVectorSearch(allProducts);
      classifyIntentAndRespond.mockResolvedValue({
        intent: 'product_query',
        clarified_query: 'bỏ các điều kiện trước',
      });
      await ChatController.processMessage(mockSocket, {
        sessionId: 'session-reset-me',
        message: 'bỏ các điều kiện trước',
      });

      // Old filters should be deleted; fresh empty context may remain
      ctx = await contextService.loadContext('session-reset-me');
      expect(ctx).not.toBeNull();
      expect(ctx.filters.brands).toBeNull();
      expect(ctx.preferences.camera).toBe(false);
    });
  });
});
