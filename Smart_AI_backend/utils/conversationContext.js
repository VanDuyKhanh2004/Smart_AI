/**
 * Pure deterministic utilities for multi-turn shopping-context memory.
 *
 * Handles:
 * - Follow-up detection
 * - Merge rules (brands, price, RAM, storage, color, preferences)
 * - Reset detection
 * - Category-change detection
 * - Context sanitization
 *
 * All functions are pure — no I/O, no randomness, no mutations.
 */

const { parseProductConstraints } = require('./productConstraintParser');

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const MAX_TURNS = 20;
const MAX_PRODUCT_IDS = 5;

/** Phrases that reset all shopping context. */
const RESET_PHRASES = [
  /tìm\s*lại\s*từ\s*đầu/i,
  /bỏ\s*các\s*điều\s*kiện\s*trước/i,
  /xóa\s*bộ\s*lọc/i,
  /tìm\s*sản\s*phẩm\s*khác/i,
  /\breset\b/i,
  /bỏ\s*hết/i,
  /xóa\s*hết/i,
  /bắt\s*đầu\s*lại/i,
];

/** Non-product phrases that must never be treated as follow-ups. */
const NON_PRODUCT_PHRASES = [
  /^xin\s*chào/i,
  /^chào/i,
  /^cảm\s*ơn/i,
  /^cám\s*ơn/i,
  /^bạn\s+là\s+ai/i,
  /^bạn\s+tên/i,
  /^tạm\s*biệt/i,
  /^bye\b/i,
  /^hello\b/i,
  /^hi\b/i,
  /^thank/i,
  /^thanks/i,
  /^ok\b/i,
  /^vâng/i,
  /^dạ\b/i,
  /^ừ\b/i,
  /^ừm\b/i,
  /^đơn\s*hàng/i,
  /^khiếu\s*nại/i,
];

/** Patterns indicating a product follow-up (no standalone hard constraints). */
const FOLLOW_UP_PATTERNS = [
  /còn\s+(màu|loại|hàng|không)\b/i,
  /còn.*không/i,
  /.*thì\s*sao/i,
  /.*hơn\s*(nữa|không)?\s*$/i,
  /chỉ\s+\w+/i,
  /không\s+lấy/i,
  /trừ\s+\w+/i,
  /bỏ\s+\w+/i,
  /màu\s+\w+/i,
  /loại\s+\d+/i,
  /rẻ\s*hơn/i,
  /đắt\s*hơn/i,
  /máy\s+(đầu|thứ|tiếp)/i,
  /con\s+\w+/i,
  /so\s*sánh/i,
  /cho\s+xem/i,
  /xem\s+thêm/i,
  /thêm\s+lựa\s*chọn/i,
  /\bram\b/i,
  /\bbộ\s*nhớ\b/i,
  /\bdung\s*lượng\b/i,
  /\bpin\b/i,
  /\bcamera\b/i,
  /\bchip\b/i,
];

/** Patterns for brand-only or preference-only queries. */
const SHORT_MODIFIER_PATTERNS = [
  /^chỉ\s+\w+/i,
  /^không\s+lấy/i,
  /^trừ\s+\w+/i,
  /^bỏ\s+\w+/i,
  /^còn\s+/i,
  /^màu\s+/i,
  /^loại\s+/i,
  /^ram\s+/i,
  /^pin\s+/i,
  /^camera\s+/i,
  /^màn\s*hình\s+/i,
];

/** Category canonical names for reset detection. */
const CATEGORY_KEYWORDS = ['phone', 'laptop', 'tablet'];

/* ------------------------------------------------------------------ */
/*  Follow-up / Reset detection                                        */
/* ------------------------------------------------------------------ */

/**
 * Check if a raw query contains a reset phrase.
 */
function isResetQuery(query) {
  if (!query || typeof query !== 'string') return false;
  return RESET_PHRASES.some(re => re.test(query.trim()));
}

/**
 * Check if a parsed query introduces a clearly new category.
 */
function isNewCategoryQuery(parsed) {
  if (!parsed || !parsed.filters) return false;
  // Category detection is done during parsing but kept in cleanedQuery.
  // Check the original query for new category keywords.
  return false; // handled via shouldResetContext
}

/**
 * Detect whether a query is a product-related follow-up rather than
 * an independent standalone product query.
 *
 * A query is a follow-up if:
 * - It matches follow-up patterns (còn...không, ...thì sao, ...hơn)
 * - It has zero or minimal hard constraints (no brand, no price)
 * - It only mentions preferences or short modifiers
 */
function isFollowUpQuery(query, parsed) {
  if (!query || typeof query !== 'string') return false;
  const trimmed = query.trim();

  // Non-product phrases (greetings, thanks, etc.) are never follow-ups
  if (NON_PRODUCT_PHRASES.some(re => re.test(trimmed))) return false;

  // Reset queries are not follow-ups; they create new context
  if (isResetQuery(trimmed)) return false;

  // Explicit follow-up patterns
  if (FOLLOW_UP_PATTERNS.some(re => re.test(trimmed))) return true;

  // Short modifier patterns
  if (SHORT_MODIFIER_PATTERNS.some(re => re.test(trimmed))) return true;

  // If parsed has no meaningful hard constraints, treat as follow-up
  if (parsed && parsed.filters) {
    const f = parsed.filters;
    const hasBrands = Array.isArray(f.brands) && f.brands.length > 0;
    const hasPrice = f.minPrice != null || f.maxPrice != null;
    const hasRAM = Array.isArray(f.ramGB) || f.minRamGB != null || f.maxRamGB != null;
    const hasStorage = Array.isArray(f.storageGB) || f.minStorageGB != null || f.maxStorageGB != null;
    const hasColor = Array.isArray(f.colors) && f.colors.length > 0;
    const hasStock = f.inStock != null;
    const hasExcluded = Array.isArray(f.excludedBrands) && f.excludedBrands.length > 0;

    // If query has no hard constraints at all, it might be a follow-up
    if (!hasBrands && !hasPrice && !hasRAM && !hasStorage && !hasColor && !hasStock && !hasExcluded) {
      // But only if it has preferences or is very short
      if (parsed.preferences) {
        const hasPref = parsed.preferences.camera || parsed.preferences.battery || parsed.preferences.performance || parsed.preferences.compact;
        if (hasPref) return true;
      }
      // Short queries (<=3 words) with no hard constraints are likely follow-ups
      if (trimmed.split(/\s+/).length <= 3) return true;
    }
  }

  return false;
}

/**
 * Determine whether context should be reset for the given query.
 */
function shouldResetContext(query, parsed) {
  if (!query || typeof query !== 'string') return true; // empty → reset
  if (isResetQuery(query)) return true;

  // New category: if parsed query has a different category than context
  // (We detect category from constraint parser's cleanedQuery or original query)
  // For now, handle via the reset phrases and start-fresh queries
  return false;
}

/* ------------------------------------------------------------------ */
/*  Merge logic                                                        */
/* ------------------------------------------------------------------ */

/**
 * Deep-clone a context object safely.
 */
function cloneContext(ctx) {
  if (!ctx) return null;
  return JSON.parse(JSON.stringify(ctx));
}

/**
 * Create an initial normalized context from parseProductConstraints output.
 */
function createContextFromParsed(parsed, productIds) {
  const filters = parsed && parsed.filters ? { ...parsed.filters } : {};
  const preferences = parsed && parsed.preferences ? { ...parsed.preferences } : { camera: false, battery: false, performance: false, compact: false };

  return {
    filters: {
      brands: filters.brands ? [...filters.brands] : null,
      excludedBrands: filters.excludedBrands ? [...filters.excludedBrands] : null,
      minPrice: filters.minPrice != null ? filters.minPrice : null,
      maxPrice: filters.maxPrice != null ? filters.maxPrice : null,
      inStock: filters.inStock != null ? filters.inStock : null,
      ramGB: filters.ramGB ? [...filters.ramGB] : null,
      minRamGB: filters.minRamGB != null ? filters.minRamGB : null,
      maxRamGB: filters.maxRamGB != null ? filters.maxRamGB : null,
      storageGB: filters.storageGB ? [...filters.storageGB] : null,
      minStorageGB: filters.minStorageGB != null ? filters.minStorageGB : null,
      maxStorageGB: filters.maxStorageGB != null ? filters.maxStorageGB : null,
      colors: filters.colors ? [...filters.colors] : null,
    },
    preferences: { ...preferences },
    lastProductIds: Array.isArray(productIds) ? productIds.slice(0, MAX_PRODUCT_IDS) : [],
    turnCount: 1,
  };
}

/**
 * Merge previous conversation context with a current parsed query.
 *
 * Rules:
 * 1. New brands replace previous brands unless query contains "hoặc".
 * 2. New excluded brands are appended.
 * 3. New min/max price replaces old.
 * 4. New color replaces old.
 * 5. New RAM replaces old.
 * 6. New storage replaces old.
 * 7. New stock replaces old.
 * 8. Preferences are merged (new true values stay true).
 * 9. If current query has zero hard constraints, inherit all previous.
 * 10. If current query has some hard constraints, replace those specific ones.
 *
 * Returns a new context object (does not mutate inputs).
 */
function mergeConversationContext(previous, current) {
  if (!previous) {
    return cloneContext(current) || { filters: {}, preferences: { camera: false, battery: false, performance: false, compact: false }, lastProductIds: [], turnCount: 1 };
  }
  if (!current) return cloneContext(previous);

  const prev = cloneContext(previous);
  const curr = cloneContext(current);

  // Ensure defaults
  const merged = {
    filters: {
      brands: null,
      excludedBrands: null,
      minPrice: null,
      maxPrice: null,
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
    lastProductIds: [],
    turnCount: (prev.turnCount || 0) + 1,
  };

  // Brands: current has brands → replace (unless "hoặc" in context),
  // otherwise inherit from previous
  const hasCurrBrands = Array.isArray(curr.filters.brands) && curr.filters.brands.length > 0;
  if (hasCurrBrands) {
    merged.filters.brands = [...curr.filters.brands];
  } else {
    merged.filters.brands = prev.filters.brands ? [...prev.filters.brands] : null;
  }

  // Excluded brands: append
  const prevExcluded = prev.filters.excludedBrands || [];
  const currExcluded = curr.filters.excludedBrands || [];
  const mergedExcluded = [...new Set([...prevExcluded, ...currExcluded])];
  merged.filters.excludedBrands = mergedExcluded.length > 0 ? mergedExcluded : null;

  // Price: current replaces; inherit if not set
  merged.filters.minPrice = curr.filters.minPrice != null ? curr.filters.minPrice : prev.filters.minPrice;
  merged.filters.maxPrice = curr.filters.maxPrice != null ? curr.filters.maxPrice : prev.filters.maxPrice;

  // Stock: current replaces; inherit if not set
  merged.filters.inStock = curr.filters.inStock != null ? curr.filters.inStock : prev.filters.inStock;

  // RAM: current replaces; inherit if not set
  const hasCurrRAMGB = Array.isArray(curr.filters.ramGB) && curr.filters.ramGB.length > 0;
  const hasCurrMinRAM = curr.filters.minRamGB != null;
  const hasCurrMaxRAM = curr.filters.maxRamGB != null;
  if (hasCurrRAMGB || hasCurrMinRAM || hasCurrMaxRAM) {
    merged.filters.ramGB = hasCurrRAMGB ? [...curr.filters.ramGB] : null;
    merged.filters.minRamGB = hasCurrMinRAM ? curr.filters.minRamGB : null;
    merged.filters.maxRamGB = hasCurrMaxRAM ? curr.filters.maxRamGB : null;
  } else {
    merged.filters.ramGB = prev.filters.ramGB ? [...prev.filters.ramGB] : null;
    merged.filters.minRamGB = prev.filters.minRamGB;
    merged.filters.maxRamGB = prev.filters.maxRamGB;
  }

  // Storage: current replaces; inherit if not set
  const hasCurrStorageGB = Array.isArray(curr.filters.storageGB) && curr.filters.storageGB.length > 0;
  const hasCurrMinStorage = curr.filters.minStorageGB != null;
  const hasCurrMaxStorage = curr.filters.maxStorageGB != null;
  if (hasCurrStorageGB || hasCurrMinStorage || hasCurrMaxStorage) {
    merged.filters.storageGB = hasCurrStorageGB ? [...curr.filters.storageGB] : null;
    merged.filters.minStorageGB = hasCurrMinStorage ? curr.filters.minStorageGB : null;
    merged.filters.maxStorageGB = hasCurrMaxStorage ? curr.filters.maxStorageGB : null;
  } else {
    merged.filters.storageGB = prev.filters.storageGB ? [...prev.filters.storageGB] : null;
    merged.filters.minStorageGB = prev.filters.minStorageGB;
    merged.filters.maxStorageGB = prev.filters.maxStorageGB;
  }

  // Colors: current replaces; inherit if not set
  const hasCurrColors = Array.isArray(curr.filters.colors) && curr.filters.colors.length > 0;
  if (hasCurrColors) {
    merged.filters.colors = [...curr.filters.colors];
  } else {
    merged.filters.colors = prev.filters.colors ? [...prev.filters.colors] : null;
  }

  // Preferences: merge (once true, stays true)
  merged.preferences.camera = curr.preferences.camera || prev.preferences.camera;
  merged.preferences.battery = curr.preferences.battery || prev.preferences.battery;
  merged.preferences.performance = curr.preferences.performance || prev.preferences.performance;
  merged.preferences.compact = curr.preferences.compact || prev.preferences.compact;

  // Product IDs: use current if available, else previous
  merged.lastProductIds = (curr.lastProductIds && curr.lastProductIds.length > 0)
    ? curr.lastProductIds.slice(0, MAX_PRODUCT_IDS)
    : (prev.lastProductIds || []).slice(0, MAX_PRODUCT_IDS);

  return merged;
}

/**
 * Resolve the effective parsed query for searching, given the current
 * parse result and previous conversation context.
 *
 * Returns { mergedContext, mergedParsed } where mergedParsed contains
 * the combined filters and preferences to use for the search.
 */
function resolveFollowUpQuery(currentParsed, previousContext) {
  if (!previousContext) {
    // No prior context — use current as-is
    const merged = createContextFromParsed(currentParsed);
    return { mergedContext: merged, mergedParsed: currentParsed };
  }

  if (!currentParsed) {
    return { mergedContext: previousContext, mergedParsed: null };
  }

  // Create a context from the current parsed result
  const currentContext = createContextFromParsed(currentParsed);

  // Merge
  const merged = mergeConversationContext(previousContext, currentContext);

  // Convert merged context back to a parsed-like shape for the search pipeline
  const mergedParsed = {
    cleanedQuery: currentParsed.cleanedQuery || '',
    filters: { ...merged.filters },
    preferences: { ...merged.preferences },
  };

  return { mergedContext: merged, mergedParsed };
}

/**
 * Sanitize a context object for storage — remove any fields that
 * should never be persisted (raw prompts, full objects, etc.)
 */
function sanitizeConversationContext(context) {
  if (!context) return null;
  const sanitized = cloneContext(context);
  if (!sanitized) return null;

  // Ensure numeric fields are bounded
  if (typeof sanitized.turnCount !== 'number' || sanitized.turnCount < 1) {
    sanitized.turnCount = 1;
  }
  if (sanitized.turnCount > MAX_TURNS) {
    sanitized.turnCount = MAX_TURNS;
  }

  // Ensure lastProductIds is bounded
  if (!Array.isArray(sanitized.lastProductIds)) {
    sanitized.lastProductIds = [];
  }
  sanitized.lastProductIds = sanitized.lastProductIds.slice(0, MAX_PRODUCT_IDS);

  // Add timestamp
  sanitized.updatedAt = new Date().toISOString();

  return sanitized;
}

/* ------------------------------------------------------------------ */
/*  High-level decision helper                                         */
/* ------------------------------------------------------------------ */

/**
 * Decide how to handle context for this query.
 *
 * Returns one of:
 * - { action: 'reset', reason: string }
 * - { action: 'follow_up', reason: string }
 * - { action: 'independent', reason: string }
 */
function classifyQuery(query, parsed) {
  if (!query || typeof query !== 'string') {
    return { action: 'independent', reason: 'empty_query' };
  }
  if (isResetQuery(query)) {
    return { action: 'reset', reason: 'reset_phrase' };
  }
  if (isFollowUpQuery(query, parsed)) {
    return { action: 'follow_up', reason: 'follow_up_pattern' };
  }
  return { action: 'independent', reason: 'standalone_query' };
}

module.exports = {
  isResetQuery,
  isFollowUpQuery,
  shouldResetContext,
  mergeConversationContext,
  resolveFollowUpQuery,
  createContextFromParsed,
  sanitizeConversationContext,
  classifyQuery,
  cloneContext,
};
