const MULTI_TURN_CASES = [
  {
    id: 'context-color-001',
    category: 'context',
    sessionId: 'eval-ctx-1',
    turns: [
      { query: 'Samsung dưới 15 triệu', responseType: 'product_query' },
      { query: 'còn màu đen không?', responseType: 'product_query' },
    ],
    expectedFinalConstraints: {
      brands: ['samsung'],
      maxPrice: 14999999,
      colors: ['black'],
    },
  },
  {
    id: 'context-ram-002',
    category: 'context',
    sessionId: 'eval-ctx-2',
    turns: [
      { query: 'điện thoại dưới 20 triệu', responseType: 'product_query' },
      { query: 'RAM 12GB thì sao?', responseType: 'product_query' },
    ],
    expectedFinalConstraints: {
      maxPrice: 20000000,
      minRamGB: 12,
    },
  },
  {
    id: 'context-brand-replace-003',
    category: 'context',
    sessionId: 'eval-ctx-3',
    turns: [
      { query: 'Samsung dưới 15 triệu', responseType: 'product_query' },
      { query: 'chỉ Xiaomi thôi', responseType: 'product_query' },
    ],
    expectedFinalConstraints: {
      brands: ['xiaomi'],
      maxPrice: 14999999,
    },
  },
  {
    id: 'context-brand-exclude-004',
    category: 'context',
    sessionId: 'eval-ctx-4',
    turns: [
      { query: 'Samsung hoặc Xiaomi dưới 15 triệu', responseType: 'product_query' },
      { query: 'không lấy Xiaomi', responseType: 'product_query' },
    ],
    expectedFinalConstraints: {
      brands: ['samsung', 'xiaomi'],
      excludedBrands: ['xiaomi'],
      maxPrice: 14999999,
    },
  },
  {
    id: 'context-smalltalk-005',
    category: 'context',
    sessionId: 'eval-ctx-5',
    turns: [
      { query: 'Samsung dưới 15 triệu', responseType: 'product_query' },
      { query: 'cảm ơn', responseType: 'small_talk' },
      { query: 'còn màu đen không?', responseType: 'product_query' },
    ],
    expectedFinalConstraints: {
      brands: ['samsung'],
      maxPrice: 14999999,
      colors: ['black'],
    },
  },
  {
    id: 'context-reset-006',
    category: 'context',
    sessionId: 'eval-ctx-6',
    turns: [
      { query: 'Samsung dưới 15 triệu', responseType: 'product_query' },
      { query: 'bỏ các điều kiện trước', responseType: 'reset' },
      { query: 'iPhone', responseType: 'product_query' },
    ],
    expectedFinalConstraints: {
      brands: ['apple'],
    },
    checkOldFiltersAbsent: true,
  },
  {
    id: 'context-session-isolation-007',
    category: 'context',
    sessionIdA: 'eval-ctx-7a',
    sessionIdB: 'eval-ctx-7b',
    turns: [
      { query: 'Samsung dưới 15 triệu', sessionId: 'eval-ctx-7a', responseType: 'product_query' },
      { query: 'iPhone', sessionId: 'eval-ctx-7b', responseType: 'product_query' },
      { query: 'Samsung dưới 15 triệu', sessionId: 'eval-ctx-7b', responseType: 'product_query' },
    ],
    expectedFinalConstraints: {
      brands: ['samsung'],
    },
  },
  {
    id: 'context-failure-preserve-008',
    category: 'context',
    sessionId: 'eval-ctx-8',
    turns: [
      { query: 'Samsung dưới 15 triệu', responseType: 'product_query' },
      { query: 'iPhone', responseType: 'product_query', forceFailure: true },
    ],
    expectedFinalConstraints: {
      brands: ['samsung'],
      maxPrice: 14999999,
    },
    checkPreviousContextRetained: true,
  },
  {
    id: 'context-noresult-relax-009',
    category: 'context',
    sessionId: 'eval-ctx-9',
    turns: [
      { query: 'Samsung dưới 2 triệu', responseType: 'product_query' },
      { query: 'dưới 5 triệu thì sao?', responseType: 'product_query' },
    ],
    expectedFinalConstraints: {
      brands: ['samsung'],
      maxPrice: 4999999,
    },
  },
  {
    id: 'context-absent-stateless-010',
    category: 'context',
    sessionId: 'eval-ctx-nonexistent',
    turns: [
      { query: 'iPhone', responseType: 'product_query' },
    ],
    expectedFinalConstraints: {
      brands: ['apple'],
    },
  },
];

module.exports = { MULTI_TURN_CASES };
