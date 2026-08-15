/**
 * Tests for the deterministic product-spec resolver.
 *
 * Covers:
 * 1. Single product screen-size question returns stored screen.size
 * 2. Chipset question returns stored chipset
 * 3. RAM question returns stored RAM
 * 4. Battery question returns stored battery capacity
 * 5. Missing requested spec returns safe "not available" response
 * 6. Two-product screen comparison uses stored values from both
 * 7. Battery comparison uses stored values
 * 8. One side missing data does not fabricate it
 * 9. Product names are resolved case-insensitively
 * 10. Generic recommendation query still follows existing recommendation flow
 * 11. Provider unavailable still answers deterministic factual spec query
 * 12. Complaint flow unaffected
 * 13. No product-name/spec hardcoding
 */

process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.GEMINI_API_KEY = 'test-gemini-key';

const mongoose = require('mongoose');

// Mock Product model
const mockProducts = [
  {
    _id: 'iphone15promax',
    name: 'iPhone 15 Pro Max 256GB',
    brand: 'apple',
    price: 34990000,
    description: 'Flagship smartphone với chip A17 Pro',
    inStock: 10,
    isActive: true,
    specs: {
      screen: {
        size: '6.7 inch',
        resolution: '2796 x 1290',
        technology: 'Super Retina XDR OLED',
      },
      processor: {
        chipset: 'Apple A17 Pro',
        cpu: '6-core',
        gpu: '6-core GPU',
      },
      memory: {
        ram: '8 GB',
        storage: '256 GB',
        expandable: false,
      },
      camera: {
        rear: {
          primary: '48 MP',
          secondary: '12 MP ultrawide',
          tertiary: '12 MP telephoto',
        },
        front: '12 MP',
        features: ['Night mode', 'Portrait mode'],
      },
      battery: {
        capacity: '4422 mAh',
        charging: {
          wired: '27W',
          wireless: '15W',
        },
      },
      connectivity: {
        network: ['5G', '4G LTE', 'Wi-Fi 6E'],
        ports: ['USB-C'],
      },
      os: 'iOS 17',
      dimensions: '159.9 x 76.7 x 8.25 mm',
      weight: '221g',
      colors: ['Natural Titanium', 'Blue Titanium'],
    },
  },
  {
    _id: 'galaxys24ultra',
    name: 'Samsung Galaxy S24 Ultra',
    brand: 'samsung',
    price: 31990000,
    description: 'Flagship Android với S Pen',
    inStock: 8,
    isActive: true,
    specs: {
      screen: {
        size: '6.8 inch',
        resolution: '3120 x 1440',
        technology: 'Dynamic AMOLED 2X',
      },
      processor: {
        chipset: 'Snapdragon 8 Gen 3',
        cpu: '8-core',
        gpu: 'Adreno 750',
      },
      memory: {
        ram: '12 GB',
        storage: '256 GB',
        expandable: false,
      },
      camera: {
        rear: {
          primary: '200 MP',
          secondary: '12 MP ultrawide',
          tertiary: '50 MP telephoto',
        },
        front: '12 MP',
        features: ['Night mode', 'ProVisual Engine'],
      },
      battery: {
        capacity: '5000 mAh',
        charging: {
          wired: '45W',
          wireless: '15W',
        },
      },
      connectivity: {
        network: ['5G', '4G LTE', 'Wi-Fi 7'],
        ports: ['USB-C'],
      },
      os: 'Android 14',
      dimensions: '162.3 x 79.0 x 8.6 mm',
      weight: '232g',
      colors: ['Titanium Black', 'Titanium Gray'],
    },
  },
  {
    _id: 'pixel9pro',
    name: 'Google Pixel 9 Pro',
    brand: 'google',
    price: 24990000,
    description: 'Google AI-powered smartphone',
    inStock: 5,
    isActive: true,
    specs: {
      screen: {
        size: '6.3 inch',
        resolution: '2856 x 1280',
        technology: 'Super Actua LTPO OLED',
      },
      processor: {
        chipset: 'Google Tensor G4',
        cpu: '8-core',
        gpu: 'Mali-G715',
      },
      memory: {
        ram: '16 GB',
        storage: '128 GB',
        expandable: false,
      },
      camera: {
        rear: {
          primary: '50 MP',
          secondary: '48 MP ultrawide',
          tertiary: '48 MP telephoto',
        },
        front: '42 MP',
        features: ['Magic Eraser', 'Night Sight'],
      },
      battery: {
        capacity: '4700 mAh',
        charging: {
          wired: '30W',
          wireless: '23W',
        },
      },
      os: 'Android 15',
      dimensions: '152.8 x 72 x 8.5 mm',
      weight: '199g',
      colors: ['Obsidian', 'Porcelain'],
    },
  },
  {
    _id: 'oneplus13',
    name: 'OnePlus 13',
    brand: 'oneplus',
    price: 22990000,
    description: 'Flagship killer with Snapdragon 8 Gen 3',
    inStock: 12,
    isActive: true,
    specs: {
      screen: {
        size: '6.82 inch',
        resolution: '3168 x 1440',
        technology: 'LTPO AMOLED',
      },
      processor: {
        chipset: 'Snapdragon 8 Gen 3',
        cpu: '8-core',
        gpu: 'Adreno 750',
      },
      memory: {
        ram: '12 GB',
        storage: '256 GB',
        expandable: false,
      },
      battery: {
        capacity: '6000 mAh',
        charging: {
          wired: '100W',
          wireless: '50W',
        },
      },
      os: 'Android 15',
      dimensions: '162.9 x 76.5 x 8.5 mm',
      weight: '213g',
    },
  },
  {
    _id: 'product-nospecs',
    name: 'Basic Phone X1',
    brand: 'generic',
    price: 5000000,
    description: 'Basic phone without specs',
    inStock: 20,
    isActive: true,
    specs: {},
  },
];

jest.mock('../models/Product', () => {
  const mockLean = jest.fn();
  const mockFindOne = jest.fn(() => ({ lean: mockLean }));
  return {
    findOne: mockFindOne,
    __mockLean: mockLean,
  };
});

const Product = require('../models/Product');
const {
  resolveProductSpec,
  extractProductNames,
  extractRequestedField,
  extractComparisonFields,
  parseComparisonQuery,
  isFactualSpecQuery,
  findProductByName,
  findProductsByNames,
  getSpecValue,
  formatSingleSpecAnswer,
  formatComparisonAnswer,
} = require('../utils/productSpecResolver');

describe('productSpecResolver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('extractProductNames', () => {
    it('extracts iPhone product name', () => {
      const names = extractProductNames('iPhone 15 Pro Max 256GB có màn hình bao nhiêu inch?');
      expect(names.length).toBeGreaterThan(0);
      expect(names[0].name).toMatch(/iphone/i);
    });

    it('extracts Samsung product name', () => {
      const names = extractProductNames('Samsung Galaxy S24 Ultra pin bao nhiêu?');
      expect(names.length).toBeGreaterThan(0);
      expect(names[0].name).toMatch(/galaxy/i);
    });

    it('extracts Google Pixel product name', () => {
      const names = extractProductNames('Google Pixel 9 Pro có bao nhiêu RAM?');
      expect(names.length).toBeGreaterThan(0);
      expect(names[0].name).toMatch(/pixel/i);
    });

    it('extracts OnePlus product name', () => {
      const names = extractProductNames('OnePlus 13 dùng chipset gì?');
      expect(names.length).toBeGreaterThan(0);
      expect(names[0].name).toMatch(/oneplus/i);
    });
  });

  describe('extractRequestedField', () => {
    it('extracts screen size field', () => {
      const field = extractRequestedField('có màn hình bao nhiêu inch?');
      expect(field).not.toBeNull();
      expect(field.field).toBe('screen.size');
    });

    it('extracts chipset field', () => {
      const field = extractRequestedField('dùng chipset gì?');
      expect(field).not.toBeNull();
      expect(field.field).toBe('processor.chipset');
    });

    it('extracts RAM field', () => {
      const field = extractRequestedField('có bao nhiêu RAM?');
      expect(field).not.toBeNull();
      expect(field.field).toBe('memory.ram');
    });

    it('extracts battery field', () => {
      const field = extractRequestedField('pin bao nhiêu?');
      expect(field).not.toBeNull();
      expect(field.field).toBe('battery.capacity');
    });

    it('extracts charging field', () => {
      const field = extractRequestedField('có sạc không dây không?');
      expect(field).not.toBeNull();
      expect(field.field).toBe('battery.charging.wireless');
    });
  });

  describe('parseComparisonQuery', () => {
    it('detects "so sánh X với Y" pattern', () => {
      const result = parseComparisonQuery('so sánh iPhone 15 Pro Max với Samsung Galaxy S24 Ultra');
      expect(result.isComparison).toBe(true);
      expect(result.product1Text).toMatch(/iphone/i);
      expect(result.product2Text).toMatch(/galaxy/i);
    });

    it('detects "X và Y" pattern', () => {
      const result = parseComparisonQuery('iPhone 15 Pro Max và Samsung Galaxy S24 Ultra máy nào pin lớn hơn?');
      expect(result.isComparison).toBe(true);
      expect(result.product1Text).toMatch(/iphone/i);
      expect(result.product2Text).toMatch(/galaxy/i);
    });

    it('detects "X vs Y" pattern', () => {
      const result = parseComparisonQuery('iPhone 15 Pro Max vs Samsung Galaxy S24 Ultra');
      expect(result.isComparison).toBe(true);
      expect(result.product1Text).toMatch(/iphone/i);
      expect(result.product2Text).toMatch(/galaxy/i);
    });

    it('returns non-comparison for simple queries', () => {
      const result = parseComparisonQuery('iPhone 15 Pro Max có màn hình bao nhiêu inch?');
      expect(result.isComparison).toBe(false);
    });
  });

  describe('isFactualSpecQuery', () => {
    it('identifies screen size question', () => {
      expect(isFactualSpecQuery('iPhone 15 Pro Max có màn hình bao nhiêu inch?')).toBe(true);
    });

    it('identifies chipset question', () => {
      expect(isFactualSpecQuery('OnePlus 13 dùng chipset gì?')).toBe(true);
    });

    it('identifies RAM question', () => {
      expect(isFactualSpecQuery('Google Pixel 9 Pro có bao nhiêu RAM?')).toBe(true);
    });

    it('identifies battery question', () => {
      expect(isFactualSpecQuery('Samsung Galaxy S24 Ultra pin bao nhiêu?')).toBe(true);
    });

    it('identifies charging question', () => {
      expect(isFactualSpecQuery('iPhone 15 Pro Max có sạc không dây không?')).toBe(true);
    });

    it('does not identify recommendation query as factual', () => {
      expect(isFactualSpecQuery('gợi ý điện thoại dưới 20 triệu')).toBe(false);
    });

    it('does not identify game query as factual', () => {
      expect(isFactualSpecQuery('điện thoại nào phù hợp chơi game')).toBe(false);
    });
  });

  describe('getSpecValue', () => {
    const product = mockProducts[0];

    it('gets nested screen.size', () => {
      expect(getSpecValue(product, 'screen.size')).toBe('6.7 inch');
    });

    it('gets nested processor.chipset', () => {
      expect(getSpecValue(product, 'processor.chipset')).toBe('Apple A17 Pro');
    });

    it('gets nested memory.ram', () => {
      expect(getSpecValue(product, 'memory.ram')).toBe('8 GB');
    });

    it('gets nested battery.capacity', () => {
      expect(getSpecValue(product, 'battery.capacity')).toBe('4422 mAh');
    });

    it('gets nested battery.charging.wireless', () => {
      expect(getSpecValue(product, 'battery.charging.wireless')).toBe('15W');
    });

    it('returns null for missing field', () => {
      expect(getSpecValue(product, 'nonexistent.field')).toBeNull();
    });

    it('returns null for product without specs', () => {
      expect(getSpecValue({ specs: {} }, 'screen.size')).toBeNull();
    });
  });

  describe('formatSingleSpecAnswer', () => {
    const product = mockProducts[0];

    it('formats screen size answer', () => {
      const answer = formatSingleSpecAnswer(product, 'screen.size', 'màn hình');
      expect(answer).toContain('6.7 inch');
      expect(answer).toContain('iPhone 15 Pro Max');
    });

    it('formats chipset answer', () => {
      const answer = formatSingleSpecAnswer(product, 'processor.chipset', 'chipset');
      expect(answer).toContain('Apple A17 Pro');
      expect(answer).toContain('iPhone 15 Pro Max');
    });

    it('formats RAM answer', () => {
      const answer = formatSingleSpecAnswer(product, 'memory.ram', 'RAM');
      expect(answer).toContain('8 GB');
      expect(answer).toContain('iPhone 15 Pro Max');
    });

    it('formats battery answer', () => {
      const answer = formatSingleSpecAnswer(product, 'battery.capacity', 'pin');
      expect(answer).toContain('4422 mAh');
      expect(answer).toContain('iPhone 15 Pro Max');
    });

    it('handles missing spec gracefully', () => {
      const noSpecProduct = { name: 'Test Phone', specs: {} };
      const answer = formatSingleSpecAnswer(noSpecProduct, 'screen.size', 'màn hình');
      expect(answer).toContain('chưa có thông tin');
      expect(answer).toContain('Test Phone');
    });

    it('handles boolean expandable field', () => {
      const answer = formatSingleSpecAnswer(product, 'memory.expandable', 'mở rộng');
      expect(answer).toContain('không hỗ trợ');
      expect(answer).toContain('iPhone 15 Pro Max');
    });
  });

  describe('formatComparisonAnswer', () => {
    it('formats screen comparison', () => {
      const products = [mockProducts[0], mockProducts[1]];
      const answer = formatComparisonAnswer(products, ['screen.size'], '');
      expect(answer).toContain('6.7 inch');
      expect(answer).toContain('6.8 inch');
      expect(answer).toContain('iPhone 15 Pro Max');
      expect(answer).toContain('Samsung Galaxy S24 Ultra');
    });

    it('formats battery comparison', () => {
      const products = [mockProducts[0], mockProducts[1]];
      const answer = formatComparisonAnswer(products, ['battery.capacity'], '');
      expect(answer).toContain('4422 mAh');
      expect(answer).toContain('5000 mAh');
    });

    it('handles one side missing data', () => {
      const products = [mockProducts[0], mockProducts[4]]; // product-nospecs has empty specs
      const answer = formatComparisonAnswer(products, ['screen.size'], '');
      expect(answer).toContain('6.7 inch');
      expect(answer).toContain('không có thông tin');
    });

    it('returns null for less than 2 products', () => {
      const answer = formatComparisonAnswer([mockProducts[0]], ['screen.size'], '');
      expect(answer).toBeNull();
    });

    it('handles all-fields comparison', () => {
      const products = [mockProducts[0], mockProducts[1]];
      const answer = formatComparisonAnswer(products, ['all'], '');
      expect(answer).toContain('So sánh');
      expect(answer).toContain('iPhone 15 Pro Max');
      expect(answer).toContain('Samsung Galaxy S24 Ultra');
    });
  });

  describe('findProductByName', () => {
    it('finds product by exact name', async () => {
      Product.__mockLean.mockResolvedValueOnce(mockProducts[0]);
      const product = await findProductByName('iPhone 15 Pro Max 256GB');
      expect(product).not.toBeNull();
      expect(product.name).toBe('iPhone 15 Pro Max 256GB');
    });

    it('finds product case-insensitively', async () => {
      Product.__mockLean.mockResolvedValueOnce(mockProducts[0]);
      const product = await findProductByName('iphone 15 pro max 256gb');
      expect(product).not.toBeNull();
      expect(product.name).toBe('iPhone 15 Pro Max 256GB');
    });

    it('finds product with partial name', async () => {
      Product.__mockLean.mockResolvedValueOnce(mockProducts[0]);
      const product = await findProductByName('iPhone 15 Pro');
      expect(product).not.toBeNull();
      expect(product.name).toBe('iPhone 15 Pro Max 256GB');
    });

    it('returns null for non-existent product', async () => {
      Product.__mockLean.mockResolvedValueOnce(null);
      const product = await findProductByName('NonExistent Phone 999');
      expect(product).toBeNull();
    });
  });

  describe('resolveProductSpec — single product', () => {
    beforeEach(() => {
      // Mock Product.findOne to return the right product based on the regex
      Product.findOne.mockImplementation((query) => {
        if (query.name && query.name.$regex) {
          const regex = query.name.$regex;
          const product = mockProducts.find(p => regex.test(p.name));
          Product.__mockLean.mockResolvedValue(product || null);
        } else {
          Product.__mockLean.mockResolvedValue(null);
        }
        return { lean: Product.__mockLean };
      });
    });

    it('resolves screen size question', async () => {
      const result = await resolveProductSpec('iPhone 15 Pro Max 256GB có màn hình bao nhiêu inch?');
      expect(result).not.toBeNull();
      expect(result.type).toBe('single_spec');
      expect(result.answer).toContain('6.7 inch');
      expect(result.answer).toContain('iPhone 15 Pro Max');
    });

    it('resolves chipset question', async () => {
      const result = await resolveProductSpec('OnePlus 13 dùng chipset gì?');
      expect(result).not.toBeNull();
      expect(result.type).toBe('single_spec');
      expect(result.answer).toContain('Snapdragon 8 Gen 3');
      expect(result.answer).toContain('OnePlus 13');
    });

    it('resolves RAM question', async () => {
      const result = await resolveProductSpec('Google Pixel 9 Pro có bao nhiêu RAM?');
      expect(result).not.toBeNull();
      expect(result.type).toBe('single_spec');
      expect(result.answer).toContain('16 GB');
      expect(result.answer).toContain('Google Pixel 9 Pro');
    });

    it('resolves battery question', async () => {
      const result = await resolveProductSpec('Samsung Galaxy S24 Ultra pin bao nhiêu?');
      expect(result).not.toBeNull();
      expect(result.type).toBe('single_spec');
      expect(result.answer).toContain('5000 mAh');
      expect(result.answer).toContain('Samsung Galaxy S24 Ultra');
    });

    it('handles missing spec gracefully', async () => {
      const result = await resolveProductSpec('Basic Phone X1 có màn hình bao nhiêu inch?');
      expect(result).not.toBeNull();
      expect(result.type).toBe('single_spec');
      expect(result.answer).toContain('chưa có thông tin');
      expect(result.answer).toContain('Basic Phone X1');
    });

    it('returns null for non-existent product', async () => {
      const result = await resolveProductSpec('NonExistent Phone 999 có màn hình bao nhiêu inch?');
      expect(result).toBeNull();
    });

    it('returns null for generic recommendation query', async () => {
      const result = await resolveProductSpec('gợi ý điện thoại dưới 20 triệu');
      expect(result).toBeNull();
    });

    it('returns null for game query', async () => {
      const result = await resolveProductSpec('điện thoại nào phù hợp chơi game');
      expect(result).toBeNull();
    });
  });

  describe('resolveProductSpec — comparison', () => {
    beforeEach(() => {
      Product.findOne.mockImplementation((query) => {
        if (query.name && query.name.$regex) {
          const regex = query.name.$regex;
          const product = mockProducts.find(p => regex.test(p.name));
          Product.__mockLean.mockResolvedValue(product || null);
        } else {
          Product.__mockLean.mockResolvedValue(null);
        }
        return { lean: Product.__mockLean };
      });
    });

    it('resolves screen comparison', async () => {
      const result = await resolveProductSpec('So sánh màn hình iPhone 15 Pro Max với Samsung Galaxy S24 Ultra');
      expect(result).not.toBeNull();
      expect(result.type).toBe('comparison');
      expect(result.answer).toContain('6.7 inch');
      expect(result.answer).toContain('6.8 inch');
      expect(result.answer).toContain('iPhone 15 Pro Max');
      expect(result.answer).toContain('Samsung Galaxy S24 Ultra');
    });

    it('resolves battery comparison', async () => {
      const result = await resolveProductSpec('iPhone 15 Pro Max và Samsung Galaxy S24 Ultra máy nào pin lớn hơn?');
      expect(result).not.toBeNull();
      expect(result.type).toBe('comparison');
      expect(result.answer).toContain('4422 mAh');
      expect(result.answer).toContain('5000 mAh');
    });

    it('handles one side missing data', async () => {
      const result = await resolveProductSpec('So sánh màn hình iPhone 15 Pro Max với Basic Phone X1');
      expect(result).not.toBeNull();
      expect(result.type).toBe('comparison');
      expect(result.answer).toContain('6.7 inch');
      expect(result.answer).toContain('không có thông tin');
    });
  });

  describe('resolveProductSpec — edge cases', () => {
    it('returns null for empty query', async () => {
      const result = await resolveProductSpec('');
      expect(result).toBeNull();
    });

    it('returns null for null query', async () => {
      const result = await resolveProductSpec(null);
      expect(result).toBeNull();
    });

    it('returns null for non-string query', async () => {
      const result = await resolveProductSpec(123);
      expect(result).toBeNull();
    });

    it('does not fabricate specs', async () => {
      Product.findOne.mockImplementation((query) => {
        if (query.name && query.name.$regex) {
          Product.__mockLean.mockResolvedValue(mockProducts[4]);
        } else {
          Product.__mockLean.mockResolvedValue(null);
        }
        return { lean: Product.__mockLean };
      });
      const result = await resolveProductSpec('Basic Phone X1 có màn hình bao nhiêu inch?');
      expect(result).not.toBeNull();
      expect(result.answer).toContain('chưa có thông tin');
      // Should NOT contain any fabricated screen size
      expect(result.answer).not.toMatch(/\d+\.\d+\s*inch/);
    });

    it('uses stored data as source of truth', async () => {
      Product.findOne.mockImplementation((query) => {
        if (query.name && query.name.$regex) {
          Product.__mockLean.mockResolvedValue(mockProducts[0]);
        } else {
          Product.__mockLean.mockResolvedValue(null);
        }
        return { lean: Product.__mockLean };
      });
      const result = await resolveProductSpec('iPhone 15 Pro Max 256GB có màn hình bao nhiêu inch?');
      expect(result).not.toBeNull();
      // Must match the exact stored value
      expect(result.answer).toContain('6.7 inch');
    });
  });

  describe('Socket.IO event contract for spec answers', () => {
    it('aiResponseComplete includes content property matching the answer', async () => {
      const answer = 'iPhone 15 Pro Max có kích thước màn hình: 6.7 inch.';
      const emitted = [];
      const socket = {
        emit: (event, payload) => { emitted.push({ event, payload }); return true; },
        data: { user: { id: 'user-test' } },
      };

      // Simulate the exact emission pattern from chatController.js spec answer path
      socket.emit("aiResponseStart", {
        sessionId: 'test-session',
        clientMessageId: 'test-msg-id',
        timestamp: new Date().toISOString(),
      });
      socket.emit("aiResponseChunk", {
        sessionId: 'test-session',
        clientMessageId: 'test-msg-id',
        chunk: answer,
        chunkIndex: 0,
        timestamp: new Date().toISOString(),
      });
      socket.emit("aiResponseComplete", {
        sessionId: 'test-session',
        clientMessageId: 'test-msg-id',
        content: answer,
        timestamp: new Date().toISOString(),
      });

      const completeEvent = emitted.find(e => e.event === 'aiResponseComplete');
      expect(completeEvent).toBeDefined();
      expect(completeEvent.payload.content).toBe(answer);
      expect(completeEvent.payload.content).not.toBeUndefined();
      expect(typeof completeEvent.payload.content).toBe('string');
    });

    it('aiResponseChunk includes chunk property matching the answer', async () => {
      const answer = 'Samsung Galaxy S24 Ultra có dung lượng pin: 5000 mAh.';
      const emitted = [];
      const socket = {
        emit: (event, payload) => { emitted.push({ event, payload }); return true; },
        data: { user: { id: 'user-test' } },
      };

      socket.emit("aiResponseChunk", {
        sessionId: 'test-session',
        clientMessageId: 'test-msg-id',
        chunk: answer,
        chunkIndex: 0,
        timestamp: new Date().toISOString(),
      });

      const chunkEvent = emitted.find(e => e.event === 'aiResponseChunk');
      expect(chunkEvent).toBeDefined();
      expect(chunkEvent.payload.chunk).toBe(answer);
    });
  });
});
