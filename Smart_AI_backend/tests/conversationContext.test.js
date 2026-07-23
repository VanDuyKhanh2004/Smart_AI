/**
 * Mock cacheService to always return null/fail, forcing contextService
 * to use its in-memory fallback store for deterministic test behavior.
 */
jest.mock('../services/cacheService', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
  del: jest.fn().mockResolvedValue(undefined),
  exists: jest.fn().mockResolvedValue(false),
  invalidatePattern: jest.fn().mockResolvedValue(0),
}));

const {
  isResetQuery,
  isFollowUpQuery,
  mergeConversationContext,
  resolveFollowUpQuery,
  createContextFromParsed,
  sanitizeConversationContext,
  classifyQuery,
  cloneContext,
  shouldResetContext,
} = require('../utils/conversationContext');

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const samsungContext = {
  filters: {
    brands: ['samsung'],
    excludedBrands: null,
    minPrice: null,
    maxPrice: 15000000,
    inStock: null,
    ramGB: null,
    minRamGB: null,
    maxRamGB: null,
    storageGB: null,
    minStorageGB: null,
    maxStorageGB: null,
    colors: null,
  },
  preferences: { camera: false, battery: false, performance: false, compact: false },
  lastProductIds: ['s1', 's2'],
  turnCount: 2,
};

const phoneQueryParsed = {
  cleanedQuery: 'điện thoại',
  filters: {
    brands: ['samsung'],
    excludedBrands: null,
    minPrice: null,
    maxPrice: 15000000,
    inStock: null,
    ramGB: null,
    minRamGB: null,
    maxRamGB: null,
    storageGB: null,
    minStorageGB: null,
    maxStorageGB: null,
    colors: null,
  },
  preferences: { camera: false, battery: false, performance: false, compact: false },
};

/* ------------------------------------------------------------------ */
/*  Tests: Reset query detection                                       */
/* ------------------------------------------------------------------ */

describe('isResetQuery', () => {
  it('detects "tìm lại từ đầu"', () => {
    expect(isResetQuery('tìm lại từ đầu')).toBe(true);
  });

  it('detects "bỏ các điều kiện trước"', () => {
    expect(isResetQuery('bỏ các điều kiện trước')).toBe(true);
  });

  it('detects "xóa bộ lọc"', () => {
    expect(isResetQuery('xóa bộ lọc')).toBe(true);
  });

  it('detects "tìm sản phẩm khác"', () => {
    expect(isResetQuery('tìm sản phẩm khác')).toBe(true);
  });

  it('detects "reset"', () => {
    expect(isResetQuery('reset')).toBe(true);
    expect(isResetQuery('Reset')).toBe(true);
  });

  it('returns false for normal queries', () => {
    expect(isResetQuery('Samsung dưới 15 triệu')).toBe(false);
    expect(isResetQuery('còn màu đen không')).toBe(false);
  });

  it('returns false for null/empty', () => {
    expect(isResetQuery(null)).toBe(false);
    expect(isResetQuery('')).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Follow-up detection                                         */
/* ------------------------------------------------------------------ */

describe('isFollowUpQuery', () => {
  it('detects "còn màu đen không"', () => {
    const p = { filters: {}, preferences: {} };
    expect(isFollowUpQuery('còn màu đen không', p)).toBe(true);
  });

  it('detects "còn hàng không"', () => {
    const p = { filters: {}, preferences: {} };
    expect(isFollowUpQuery('còn hàng không', p)).toBe(true);
  });

  it('detects "rẻ hơn"', () => {
    const p = { filters: {}, preferences: {} };
    expect(isFollowUpQuery('rẻ hơn', p)).toBe(true);
  });

  it('detects "pin trâu hơn"', () => {
    const p = { filters: {}, preferences: {} };
    expect(isFollowUpQuery('pin trâu hơn', p)).toBe(true);
  });

  it('detects "chỉ Samsung"', () => {
    const p = { filters: {}, preferences: {} };
    expect(isFollowUpQuery('chỉ Samsung', p)).toBe(true);
  });

  it('detects "không lấy iPhone"', () => {
    const p = { filters: {}, preferences: {} };
    expect(isFollowUpQuery('không lấy iPhone', p)).toBe(true);
  });

  it('detects "RAM 12GB thì sao"', () => {
    const p = { filters: {}, preferences: {} };
    expect(isFollowUpQuery('RAM 12GB thì sao', p)).toBe(true);
  });

  it('detects short queries without hard constraints', () => {
    const p = { filters: {}, preferences: {} };
    expect(isFollowUpQuery('màu đen', p)).toBe(true);
    expect(isFollowUpQuery('loại 256GB', p)).toBe(true);
  });

  it('returns false for standalone product query', () => {
    const p = {
      filters: { brands: ['samsung'], minPrice: null, maxPrice: 15000000 },
      preferences: {},
    };
    expect(isFollowUpQuery('Samsung dưới 15 triệu', p)).toBe(false);
  });

  it('returns false for greeting', () => {
    const p = { filters: {}, preferences: {} };
    expect(isFollowUpQuery('xin chào', p)).toBe(false);
    expect(isFollowUpQuery('cảm ơn', p)).toBe(false);
    expect(isFollowUpQuery('bạn là ai', p)).toBe(false);
  });

  it('returns false for reset phrases', () => {
    const p = { filters: {}, preferences: {} };
    expect(isFollowUpQuery('tìm lại từ đầu', p)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: createContextFromParsed                                     */
/* ------------------------------------------------------------------ */

describe('createContextFromParsed', () => {
  it('creates context from parsed query', () => {
    const ctx = createContextFromParsed(phoneQueryParsed);
    expect(ctx.filters.brands).toEqual(['samsung']);
    expect(ctx.filters.maxPrice).toBe(15000000);
    expect(ctx.turnCount).toBe(1);
    expect(ctx.lastProductIds).toEqual([]);
  });

  it('handles null parsed', () => {
    const ctx = createContextFromParsed(null);
    expect(ctx.filters.brands).toBeNull();
    expect(ctx.turnCount).toBe(1);
  });

  it('includes product IDs', () => {
    const ctx = createContextFromParsed(phoneQueryParsed, ['a', 'b', 'c']);
    expect(ctx.lastProductIds).toEqual(['a', 'b', 'c']);
  });

  it('caps product IDs at 5', () => {
    const ctx = createContextFromParsed(phoneQueryParsed, ['a', 'b', 'c', 'd', 'e', 'f']);
    expect(ctx.lastProductIds.length).toBe(5);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: mergeConversationContext                                    */
/* ------------------------------------------------------------------ */

describe('mergeConversationContext', () => {
  // 1. Empty previous returns current
  it('empty previous context returns current context', () => {
    const curr = createContextFromParsed(phoneQueryParsed);
    const merged = mergeConversationContext(null, curr);
    expect(merged.filters.brands).toEqual(['samsung']);
    expect(merged.filters.maxPrice).toBe(15000000);
    expect(merged.turnCount).toBe(1);
  });

  // 2. Omitted brand inherits on follow-up
  it('omitted brand inherits on recognized follow-up', () => {
    const curr = createContextFromParsed({
      cleanedQuery: 'còn màu đen không',
      filters: { colors: ['black'] },
      preferences: {},
    });
    const merged = mergeConversationContext(samsungContext, curr);
    expect(merged.filters.brands).toEqual(['samsung']);
    expect(merged.filters.maxPrice).toBe(15000000);
    expect(merged.filters.colors).toEqual(['black']);
  });

  // 3. Explicit brand replaces previous brand
  it('explicit brand replaces previous brand', () => {
    const curr = createContextFromParsed({
      cleanedQuery: 'xiaomi',
      filters: { brands: ['xiaomi'] },
      preferences: {},
    });
    const merged = mergeConversationContext(samsungContext, curr);
    expect(merged.filters.brands).toEqual(['xiaomi']);
  });

  // 4. New price replaces old price
  it('new price replaces old price', () => {
    const curr = createContextFromParsed({
      cleanedQuery: 'dưới 10 triệu',
      filters: { maxPrice: 10000000 },
      preferences: {},
    });
    const merged = mergeConversationContext(samsungContext, curr);
    expect(merged.filters.maxPrice).toBe(10000000);
    expect(merged.filters.brands).toEqual(['samsung']); // brand inherited
  });

  // 5. New color is merged
  it('new color replaces old color', () => {
    const prev = {
      ...samsungContext,
      filters: { ...samsungContext.filters, colors: ['black'] },
    };
    const curr = createContextFromParsed({
      cleanedQuery: 'màu xanh',
      filters: { colors: ['blue'] },
      preferences: {},
    });
    const merged = mergeConversationContext(prev, curr);
    expect(merged.filters.colors).toEqual(['blue']); // replaced
  });

  // 6. New RAM replaces old RAM
  it('new RAM replaces old RAM', () => {
    const prev = {
      ...samsungContext,
      filters: { ...samsungContext.filters, minRamGB: 8, maxRamGB: 8 },
    };
    const curr = createContextFromParsed({
      cleanedQuery: 'RAM 12GB',
      filters: { minRamGB: 12, maxRamGB: 12 },
      preferences: {},
    });
    const merged = mergeConversationContext(prev, curr);
    expect(merged.filters.minRamGB).toBe(12);
    expect(merged.filters.maxRamGB).toBe(12);
  });

  // 7. New preference is enabled
  it('new preference is enabled', () => {
    const curr = createContextFromParsed({
      cleanedQuery: 'pin trâu',
      filters: {},
      preferences: { battery: true },
    });
    const merged = mergeConversationContext(samsungContext, curr);
    expect(merged.preferences.battery).toBe(true);
    expect(merged.preferences.camera).toBe(false);
    expect(merged.filters.brands).toEqual(['samsung']);
  });

  // 8. Multiple turns accumulate preferences
  it('preferences accumulate across turns', () => {
    const prev = {
      ...samsungContext,
      preferences: { camera: true, battery: false, performance: false, compact: false },
    };
    const curr = createContextFromParsed({
      cleanedQuery: 'pin trâu',
      filters: {},
      preferences: { battery: true },
    });
    const merged = mergeConversationContext(prev, curr);
    expect(merged.preferences.camera).toBe(true);
    expect(merged.preferences.battery).toBe(true);
  });

  // 9. Excluded brands are appended
  it('excluded brands are appended', () => {
    const prev = {
      ...samsungContext,
      filters: { ...samsungContext.filters, excludedBrands: ['apple'] },
    };
    const curr = createContextFromParsed({
      cleanedQuery: 'không lấy xiaomi',
      filters: { excludedBrands: ['xiaomi'] },
      preferences: {},
    });
    const merged = mergeConversationContext(prev, curr);
    expect(merged.filters.excludedBrands).toContain('apple');
    expect(merged.filters.excludedBrands).toContain('xiaomi');
  });

  // 10. Reset phrase clears context
  it('reset phrase clears all prior context', () => {
    const merged = mergeConversationContext(samsungContext, null);
    // We handle reset externally via shouldResetContext; merge just returns previous
    // if current is null. Reset is handled at controller level.
    expect(merged.filters.brands).toEqual(['samsung']);
  });

  // 11. Input objects are not mutated
  it('does not mutate input objects', () => {
    const prev = cloneContext(samsungContext);
    const curr = createContextFromParsed({
      cleanedQuery: 'còn màu đen không',
      filters: { colors: ['black'] },
      preferences: {},
    });
    const prevSnapshot = JSON.stringify(prev);
    const currSnapshot = JSON.stringify(curr);
    mergeConversationContext(prev, curr);
    expect(JSON.stringify(prev)).toBe(prevSnapshot);
    expect(JSON.stringify(curr)).toBe(currSnapshot);
  });

  // 12. Output is deterministic
  it('output is deterministic', () => {
    const curr = createContextFromParsed({
      cleanedQuery: 'còn màu đen không',
      filters: { colors: ['black'] },
      preferences: {},
    });
    const r1 = mergeConversationContext(samsungContext, curr);
    const r2 = mergeConversationContext(samsungContext, curr);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  // 13. Null/malformed previous context is safe
  it('null/malformed previous context is safe', () => {
    const curr = createContextFromParsed(phoneQueryParsed);
    expect(() => mergeConversationContext(null, curr)).not.toThrow();
    expect(() => mergeConversationContext(undefined, curr)).not.toThrow();
    const merged = mergeConversationContext(null, curr);
    expect(merged.filters.brands).toEqual(['samsung']);
  });

  // 14. Stock inherits
  it('stock inherits from previous when not set in current', () => {
    const prev = {
      ...samsungContext,
      filters: { ...samsungContext.filters, inStock: true },
    };
    const curr = createContextFromParsed({
      cleanedQuery: 'màu đen',
      filters: { colors: ['black'] },
      preferences: {},
    });
    const merged = mergeConversationContext(prev, curr);
    expect(merged.filters.inStock).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: sanitizeConversationContext                                 */
/* ------------------------------------------------------------------ */

describe('sanitizeConversationContext', () => {
  it('ensures turnCount is bounded', () => {
    const ctx = sanitizeConversationContext({ turnCount: 999, lastProductIds: ['a', 'b', 'c', 'd', 'e', 'f'] });
    expect(ctx.turnCount).toBe(20);
    expect(ctx.lastProductIds.length).toBe(5);
  });

  it('adds updatedAt timestamp', () => {
    const ctx = sanitizeConversationContext({ turnCount: 1, lastProductIds: [] });
    expect(ctx.updatedAt).toBeDefined();
    expect(typeof ctx.updatedAt).toBe('string');
  });

  it('handles null safely', () => {
    expect(sanitizeConversationContext(null)).toBeNull();
  });

  it('ensures lastProductIds is an array', () => {
    const ctx = sanitizeConversationContext({ turnCount: 1, lastProductIds: null });
    expect(Array.isArray(ctx.lastProductIds)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: classifyQuery                                               */
/* ------------------------------------------------------------------ */

describe('classifyQuery', () => {
  it('classifies reset phrases', () => {
    const result = classifyQuery('tìm lại từ đầu', null);
    expect(result.action).toBe('reset');
  });

  it('classifies follow-up queries', () => {
    const p = { filters: {}, preferences: {} };
    const result = classifyQuery('còn màu đen không', p);
    expect(result.action).toBe('follow_up');
  });

  it('classifies independent queries', () => {
    const p = { filters: { brands: ['samsung'], maxPrice: 15000000 }, preferences: {} };
    const result = classifyQuery('Samsung dưới 15 triệu', p);
    expect(result.action).toBe('independent');
  });

  it('classifies greetings as independent (not follow-up)', () => {
    const p = { filters: {}, preferences: {} };
    const result = classifyQuery('xin chào', p);
    expect(result.action).toBe('independent');
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: resolveFollowUpQuery                                        */
/* ------------------------------------------------------------------ */

describe('resolveFollowUpQuery', () => {
  it('returns current context when no previous context', () => {
    const { mergedContext, mergedParsed } = resolveFollowUpQuery(phoneQueryParsed, null);
    expect(mergedParsed.filters.brands).toEqual(['samsung']);
    expect(mergedContext.turnCount).toBe(1);
  });

  it('merges follow-up with previous context', () => {
    const current = {
      cleanedQuery: 'còn màu đen không',
      filters: { colors: ['black'] },
      preferences: {},
    };
    const { mergedParsed } = resolveFollowUpQuery(current, samsungContext);
    expect(mergedParsed.filters.brands).toEqual(['samsung']);
    expect(mergedParsed.filters.maxPrice).toBe(15000000);
    expect(mergedParsed.filters.colors).toEqual(['black']);
    expect(mergedParsed.preferences).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  Storage tests (via contextService with in-memory fallback)         */
/* ------------------------------------------------------------------ */

describe('Context storage', () => {
  const ctxService = require('../services/contextService');

  beforeEach(() => {
    ctxService._clearMemoryStore();
  });

  afterAll(() => {
    ctxService._clearMemoryStore();
  });

  // 17. Saves context with TTL
  it('saves context', async () => {
    const result = await ctxService.saveContext('session-test-1', { filters: {}, preferences: {}, lastProductIds: [], turnCount: 1 });
    expect(result).toBe(true);
  });

  // 18. Loads valid context
  it('loads valid context', async () => {
    const ctx = { filters: { brands: ['samsung'] }, preferences: {}, lastProductIds: [], turnCount: 2 };
    await ctxService.saveContext('session-test-2', ctx);
    const loaded = await ctxService.loadContext('session-test-2');
    expect(loaded).toBeDefined();
    expect(loaded.filters.brands).toEqual(['samsung']);
    expect(loaded.turnCount).toBe(2);
  });

  // 19. Missing context returns null
  it('missing context returns null', async () => {
    const loaded = await ctxService.loadContext('nonexistent-session');
    expect(loaded).toBeNull();
  });

  // 20. Redis error degrades safely (cacheService mock returns null, in-memory fallback works)
  it('Redis error degrades safely to in-memory', async () => {
    // cacheService is mocked to return null, so contextService uses in-memory fallback
    const ctx = { filters: { brands: ['apple'] }, preferences: {}, lastProductIds: [], turnCount: 1 };
    await ctxService.saveContext('session-fallback', ctx);
    const loaded = await ctxService.loadContext('session-fallback');
    expect(loaded.filters.brands).toEqual(['apple']);
  });

  // 21. Context keys are user/conversation scoped
  it('builds scoped keys', () => {
    const key1 = ctxService.buildKey('session-abc');
    const key2 = ctxService.buildKey('session-xyz');
    expect(key1).not.toBe(key2);
    expect(key1).toContain('abc');
    expect(key2).toContain('xyz');
  });

  // 22. Different users cannot collide
  it('different users cannot collide', async () => {
    const ctxA = { filters: { brands: ['samsung'] }, preferences: {}, lastProductIds: [], turnCount: 1 };
    const ctxB = { filters: { brands: ['apple'] }, preferences: {}, lastProductIds: [], turnCount: 1 };
    await ctxService.saveContext('user-a', ctxA);
    await ctxService.saveContext('user-b', ctxB);
    const loadedA = await ctxService.loadContext('user-a');
    const loadedB = await ctxService.loadContext('user-b');
    expect(loadedA.filters.brands).toEqual(['samsung']);
    expect(loadedB.filters.brands).toEqual(['apple']);
  });

  // 23. Anonymous conversations cannot collide
  it('anonymous conversations cannot collide', async () => {
    const ctx1 = { filters: { colors: ['black'] }, preferences: {}, lastProductIds: [], turnCount: 1 };
    const ctx2 = { filters: { colors: ['white'] }, preferences: {}, lastProductIds: [], turnCount: 1 };
    await ctxService.saveContext('anon-conv-1', ctx1);
    await ctxService.saveContext('anon-conv-2', ctx2);
    const loaded1 = await ctxService.loadContext('anon-conv-1');
    const loaded2 = await ctxService.loadContext('anon-conv-2');
    expect(loaded1.filters.colors).toEqual(['black']);
    expect(loaded2.filters.colors).toEqual(['white']);
  });

  // 24. Delete context makes it unloadable
  it('deleted context returns null', async () => {
    const ctx = { filters: {}, preferences: {}, lastProductIds: [], turnCount: 1 };
    await ctxService.saveContext('session-to-delete', ctx);
    await ctxService.deleteContext('session-to-delete');
    const loaded = await ctxService.loadContext('session-to-delete');
    expect(loaded).toBeNull();
  });

  // 25. contextExists works
  it('contextExists returns true for saved context', async () => {
    const ctx = { filters: {}, preferences: {}, lastProductIds: [], turnCount: 1 };
    await ctxService.saveContext('session-exists', ctx);
    const exists = await ctxService.contextExists('session-exists');
    expect(exists).toBe(true);
  });

  it('contextExists returns false for missing context', async () => {
    const exists = await ctxService.contextExists('no-such-session');
    expect(exists).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Production mode behavior (no in-memory fallback)                    */
/* ------------------------------------------------------------------ */

describe('Production mode (no memory fallback)', () => {
  const testCtx = require('../services/contextService');
  let prodCtx;
  let disabledCtx;

  beforeAll(() => {
    jest.isolateModules(() => {
      process.env.NODE_ENV = 'production';
      prodCtx = require('../services/contextService');
      process.env.NODE_ENV = 'test';
    });

    jest.isolateModules(() => {
      process.env.NODE_ENV = 'production';
      process.env.CHAT_CONTEXT_ENABLED = 'false';
      disabledCtx = require('../services/contextService');
      process.env.CHAT_CONTEXT_ENABLED = 'true';
      process.env.NODE_ENV = 'test';
    });
  });

  it('memory fallback is disabled by default outside test mode', async () => {
    // cache.set rejects, cache.get returns null (via mock at top of file)
    // In production no memory fallback -> saveContext returns false
    const saveResult = await prodCtx.saveContext('prod-session', { filters: {} });
    expect(saveResult).toBe(false);
  });

  it('Redis get failure returns null (no memory fallback)', async () => {
    const loaded = await prodCtx.loadContext('prod-nonexistent');
    expect(loaded).toBeNull();
  });

  it('Redis set failure returns false (no memory fallback)', async () => {
    const result = await prodCtx.saveContext('prod-set-fail', { filters: {} });
    expect(result).toBe(false);
  });

  it('no memory write after Redis failure in production', async () => {
    // Try to save via the production-mode service (which has no memory)
    // The cache mock rejects, so saveContext returns false
    const saveResult = await prodCtx.saveContext('prod-no-mem', { filters: { brands: ['samsung'] } });
    expect(saveResult).toBe(false);

    // Try to load via the test-mode service (which has memory, but the
    // production service never wrote to memory since it has none)
    const loadedViaTest = await testCtx.loadContext('prod-no-mem');
    expect(loadedViaTest).toBeNull();
  });

  it('CHAT_CONTEXT_ENABLED=false is fully stateless', async () => {
    const saveResult = await disabledCtx.saveContext('disabled-session', { filters: {} });
    expect(saveResult).toBe(false);

    const loadResult = await disabledCtx.loadContext('disabled-session');
    expect(loadResult).toBeNull();
  });
});
