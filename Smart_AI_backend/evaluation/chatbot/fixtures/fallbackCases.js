const FALLBACK_CASES = [
  {
    id: 'fallback-openai-success-001',
    category: 'fallback',
    query: 'Samsung dưới 15 triệu',
    providerSequence: ['openai'],
    expectProvider: 'openai',
    expectValidResponse: true,
  },
  {
    id: 'fallback-openai-fail-gemini-002',
    category: 'fallback',
    query: 'Samsung dưới 15 triệu',
    providerSequence: ['openai_fail', 'gemini'],
    expectProvider: 'gemini',
    expectValidResponse: true,
  },
  {
    id: 'fallback-all-fail-deterministic-003',
    category: 'fallback',
    query: 'Samsung dưới 15 triệu',
    providerSequence: ['openai_fail', 'gemini_fail', 'deterministic'],
    expectProvider: 'deterministic',
    expectValidResponse: true,
  },
  {
    id: 'fallback-provider-timeout-004',
    category: 'fallback',
    query: 'Samsung dưới 15 triệu',
    providerSequence: ['openai_timeout', 'gemini_timeout', 'deterministic'],
    expectProvider: 'deterministic',
    expectValidResponse: true,
  },
  {
    id: 'fallback-provider-malformed-005',
    category: 'fallback',
    query: 'Samsung dưới 15 triệu',
    providerSequence: ['openai_malformed', 'deterministic'],
    expectProvider: 'deterministic',
    expectValidResponse: true,
  },
];

const SEARCH_TIER_CASES = [
  {
    id: 'search-vector-success-001',
    category: 'search_tier',
    query: 'Samsung dưới 15 triệu',
    searchMode: 'vector',
    expectProducts: true,
  },
  {
    id: 'search-vector-empty-text-002',
    category: 'search_tier',
    query: 'Samsung dưới 15 triệu',
    searchMode: 'vector_empty',  
    expectProducts: true,
  },
  {
    id: 'search-vector-throw-text-003',
    category: 'search_tier',
    query: 'Samsung dưới 15 triệu',
    searchMode: 'vector_throw',
    expectProducts: true,
  },
  {
    id: 'search-all-empty-latest-004',
    category: 'search_tier',
    query: 'Samsung dưới 15 triệu',
    searchMode: 'all_empty',
    expectProducts: true,
  },
  {
    id: 'search-constraint-safety-005',
    category: 'search_tier',
    query: 'Samsung dưới 15 triệu',
    searchMode: 'vector',
    expectProducts: true,
    expectBrand: 'samsung',
    expectMaxPrice: 14999999,
  },
];

module.exports = { FALLBACK_CASES, SEARCH_TIER_CASES };
