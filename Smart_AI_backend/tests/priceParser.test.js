const { parseVietnamesePrice } = require('../utils/priceParser');

describe('parseVietnamesePrice', () => {
  describe('tối đa / không quá — strict max', () => {
    it('tối đa 10 triệu → maxPrice = 10_000_000', () => {
      const r = parseVietnamesePrice('điện thoại tối đa 10 triệu');
      expect(r.maxPrice).toBe(10_000_000);
      expect(r.minPrice).toBeNull();
      expect(r.cleanedQuery).not.toMatch(/tối đa|10.*triệu/);
    });

    it('không quá 10 triệu → maxPrice = 10_000_000', () => {
      const r = parseVietnamesePrice('không quá 10 triệu');
      expect(r.maxPrice).toBe(10_000_000);
    });
  });

  describe('dưới — strict <', () => {
    it('dưới 10 triệu → maxPrice = 9_999_999', () => {
      const r = parseVietnamesePrice('dưới 10 triệu');
      expect(r.maxPrice).toBe(9_999_999);
    });
  });

  describe('trở xuống — inclusive max', () => {
    it('10 triệu trở xuống → maxPrice = 10_000_000', () => {
      const r = parseVietnamesePrice('10 triệu trở xuống');
      expect(r.maxPrice).toBe(10_000_000);
    });
  });

  describe('từ X đến Y — range', () => {
    it('từ 8 đến 10 triệu → min=8_000_000 max=10_000_000', () => {
      const r = parseVietnamesePrice('từ 8 đến 10 triệu');
      expect(r.minPrice).toBe(8_000_000);
      expect(r.maxPrice).toBe(10_000_000);
    });

    it('từ 5tr đến 15tr → min=5_000_000 max=15_000_000', () => {
      const r = parseVietnamesePrice('từ 5tr đến 15tr');
      expect(r.minPrice).toBe(5_000_000);
      expect(r.maxPrice).toBe(15_000_000);
    });
  });

  describe('trên — strict min', () => {
    it('trên 10 triệu → minPrice = 10_000_001', () => {
      const r = parseVietnamesePrice('trên 10 triệu');
      expect(r.minPrice).toBe(10_000_001);
      expect(r.maxPrice).toBeNull();
    });
  });

  describe('soft patterns — no hard filter', () => {
    it('tầm 10 triệu → no hard filter', () => {
      const r = parseVietnamesePrice('tầm 10 triệu');
      expect(r.minPrice).toBeNull();
      expect(r.maxPrice).toBeNull();
    });

    it('khoảng 10 triệu → no hard filter', () => {
      const r = parseVietnamesePrice('khoảng 10 triệu');
      expect(r.minPrice).toBeNull();
      expect(r.maxPrice).toBeNull();
    });
  });

  describe('standalone unit — extracted but no hard filter', () => {
    it('10tr → extracts as maxPrice but no strict semantics', () => {
      const r = parseVietnamesePrice('10tr');
      expect(r.maxPrice).toBe(10_000_000);
    });

    it('500 nghìn → extracts as 500_000', () => {
      const r = parseVietnamesePrice('500 nghìn');
      // Note: standalone uses soft extraction; returns maxPrice for convenience
      expect(r.maxPrice).toBe(500_000);
    });
  });

  describe('cleanedQuery', () => {
    it('removes price expression from query', () => {
      const r = parseVietnamesePrice('điện thoại samsung tối đa 10 triệu');
      expect(r.cleanedQuery).toBe('điện thoại samsung');
    });

    it('returns original query when no price expression', () => {
      const r = parseVietnamesePrice('điện thoại samsung');
      expect(r.cleanedQuery).toBe('điện thoại samsung');
      expect(r.minPrice).toBeNull();
      expect(r.maxPrice).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('null/empty input', () => {
      expect(parseVietnamesePrice(null).maxPrice).toBeNull();
      expect(parseVietnamesePrice('').maxPrice).toBeNull();
    });

    it('non-string input', () => {
      expect(parseVietnamesePrice(undefined).maxPrice).toBeNull();
    });
  });
});
