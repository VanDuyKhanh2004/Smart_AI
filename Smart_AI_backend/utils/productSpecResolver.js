/**
 * Deterministic product-spec resolution layer.
 *
 * Intercepts factual spec questions (single-product or comparison) and
 * answers directly from stored Product data without calling an LLM.
 * Returns null when the query cannot be confidently resolved, allowing
 * the caller to fall through to the existing recommendation/RAG flow.
 *
 * Design rules:
 * - Uses stored Product data as source of truth.
 * - Never fabricates missing specs.
 * - No hardcoded product names or spec values.
 * - Provider outage does not break factual spec answers.
 */

const Product = require('../models/Product');
const logger = require('../utils/logger');

/* ------------------------------------------------------------------ */
/*  Vietnamese field-name aliases → canonical spec paths               */
/* ------------------------------------------------------------------ */

const FIELD_ALIASES = {
  // Screen
  'màn hình':         'screen.size',
  'kích thước màn hình': 'screen.size',
  'screen':           'screen.size',
  'màn':              'screen.size',
  'độ phân giải':     'screen.resolution',
  'resolution':       'screen.resolution',
  'công nghệ màn hình': 'screen.technology',
  'technology':       'screen.technology',
  'loại màn hình':    'screen.technology',

  // Processor
  'chipset':          'processor.chipset',
  'chip':             'processor.chipset',
  'cpu':              'processor.cpu',
  'gpu':              'processor.gpu',
  'bộ xử lý':        'processor.chipset',
  'vi xử lý':         'processor.chipset',

  // Memory
  'ram':              'memory.ram',
  'bộ nhớ trong':     'memory.ram',
  'bộ nhớ':           'memory.ram',
  'storage':          'memory.storage',
  'dung lượng':       'memory.storage',
  'bộ nhớ ngoài':     'memory.expandable',
  'mở rộng':          'memory.expandable',
  'thẻ nhớ':          'memory.expandable',

  // Camera
  'camera':           'camera.rear.primary',
  'camera sau':       'camera.rear.primary',
  'camera chính':     'camera.rear.primary',
  'camera trước':     'camera.front',
  'selfie':           'camera.front',

  // Battery
  'pin':              'battery.capacity',
  'dung lượng pin':   'battery.capacity',
  'sạc không dây':    'battery.charging.wireless',
  'wireless':         'battery.charging.wireless',
  'sạc':              'battery.charging.wired',
  'sạc nhanh':        'battery.charging.wired',

  // Connectivity
  'mạng':             'connectivity.network',
  '5g':               'connectivity.network',
  'wifi':             'connectivity.network',
  'bluetooth':        'connectivity.network',
  'cổng':             'connectivity.ports',
  'usb':              'connectivity.ports',

  // Other
  'hệ điều hành':     'os',
  'os':               'os',
  'trọng lượng':      'weight',
  'kích thước':       'dimensions',
  'màu sắc':          'colors',
  'màu':              'colors',
};

/* ------------------------------------------------------------------ */
/*  Spec field display names (Vietnamese)                              */
/* ------------------------------------------------------------------ */

const FIELD_DISPLAY_NAMES = {
  'screen.size':         'kích thước màn hình',
  'screen.resolution':   'độ phân giải',
  'screen.technology':   'công nghệ màn hình',
  'processor.chipset':   'chipset',
  'processor.cpu':       'CPU',
  'processor.gpu':       'GPU',
  'memory.ram':          'RAM',
  'memory.storage':      'bộ nhớ trong',
  'memory.expandable':   'hỗ trợ mở rộng bộ nhớ',
  'camera.rear.primary': 'camera chính',
  'camera.front':        'camera trước',
  'battery.capacity':    'dung lượng pin',
  'battery.charging.wired':   'sạc có dây',
  'battery.charging.wireless': 'sạc không dây',
  'connectivity.network': 'mạng',
  'connectivity.ports':  'cổng kết nối',
  'os':                  'hệ điều hành',
  'weight':              'trọng lượng',
  'dimensions':          'kích thước',
  'colors':              'màu sắc',
};

/* ------------------------------------------------------------------ */
/*  Comparison keyword patterns                                        */
/* ------------------------------------------------------------------ */

const COMPARISON_PATTERNS = [
  // "so sánh X với Y"
  /so\s*sánh\s+(.+?)\s+với\s+(.+?)(?:\s*\?*\s*$)/i,
  // "X so với Y"
  /(.+?)\s+so\s+với\s+(.+?)(?:\s*\?*\s*$)/i,
  // "X và Y" / "X và Y máy nào" / "X vs Y"
  /(.+?)\s+(?:và|vs|hoặc)\s+(.+?)(?:\s+máy\s+nào|\s*\?*\s*$)/i,
  // "X hay Y" / "X hay Y tốt hơn"
  /(.+?)\s+hay\s+(.+?)(?:\s+(?:tốt|lớn|nhỏ|đắt|bao nhiêu)[^?]*)?(?:\s*\?*\s*$)/i,
];

/* ------------------------------------------------------------------ */
/*  Factual query keyword patterns                                     */
/* ------------------------------------------------------------------ */

const FACTUAL_QUERY_PATTERNS = [
  // "... có ... không?" (yes/no question about a spec)
  /\bcó\s+(.+?)\s+không\s*\??$/i,
  // "... bao nhiêu inch/GB/mAh/W?"
  /\bbao\s+nhiêu\s+(inch|gb|mah|w|mp|mm|g)\b/i,
  // "... dùng chipset gì?"
  /\bdùng\s+(?:chipset|chip|cpu|gpu)\s+gì\b/i,
  // "... có bao nhiêu RAM/storage?"
  /\bcó\s+bao\s+nhiêu\s+(ram|storage|bộ nhớ|pin)\b/i,
  // "... RAM bao nhiêu?"
  /\b(ram|storage|pin|pin)\s+bao\s+nhiêu\b/i,
  // "thông số ..."
  /\bthông\s*số\s+(.+?)(?:\s*\?*\s*$)/i,
];

/* ------------------------------------------------------------------ */
/*  Vietnamese number words                                            */
/* ------------------------------------------------------------------ */

const VIETNAMESE_NUMBERS = {
  'hai': 2, 'ba': 3, 'bốn': 4, 'bon': 4, 'năm': 5, 'sáu': 6, 'sau': 6,
  'bảy': 7, 'bay': 7, 'tám': 8, 'tam': 8, 'chín': 9, 'chin': 9,
  'mười': 10, 'hai mươi': 20, 'ba mươi': 30, 'hai mươi lăm': 25,
};

/* ------------------------------------------------------------------ */
/*  Product name extraction                                            */
/* ------------------------------------------------------------------ */

/**
 * Extract potential product names from a query string.
 * Returns an array of { name, originalText } objects, ordered by confidence.
 */
function extractProductNames(query) {
  const normalized = query.toLowerCase().trim();
  const results = [];

  // Known brand prefixes to help identify product names
  const BRAND_PREFIXES = [
    'iphone', 'samsung', 'galaxy', 'pixel', 'oneplus', 'xiaomi', 'redmi',
    'oppo', 'vivo', 'nokia', 'sony', 'xperia', 'huawei', 'realme', 'iqoo',
    'honor', 'nothing', 'poco', 'asus', 'rog', 'zenfone', 'basic',
  ];

  // Try to find product name patterns
  // Pattern: brand + model name (e.g., "iPhone 15 Pro Max", "Samsung Galaxy S24 Ultra")
  const productPatterns = [
    // iPhone patterns
    /iphone\s+\d+\s*(?:pro\s*(?:max|plus)?|plus|mini)?(?:\s+\d+\s*(?:gb|tb))?/gi,
    // Samsung Galaxy patterns
    /(?:samsung\s+)?galaxy\s+(?:s|z|a|m|note)\s*\d+\s*(?:ultra|plus|\+)?(?:\s+\d+\s*(?:gb|tb))?/gi,
    // Google Pixel patterns
    /(?:google\s+)?pixel\s+\d+\s*(?:pro|a|xl)?(?:\s+\d+\s*(?:gb|tb))?/gi,
    // OnePlus patterns
    /oneplus\s+\d+\s*(?:pro|t|r)?/gi,
    // Xiaomi patterns
    /(?:xiaomi\s+)?(?:\d+t?\s*(?:pro|ultra|lite)?)/gi,
    // Basic phone patterns
    /basic\s+\w+\s+\w+\d*/gi,
    // Generic: word + number + optional suffix
    /\b[a-z]+\s+\d+\s*(?:pro|ultra|plus|max|mini|lite|se)?(?:\s+\d+\s*(?:gb|tb))?\b/gi,
  ];

  for (const pattern of productPatterns) {
    let match;
    while ((match = pattern.exec(normalized)) !== null) {
      const name = match[0].trim();
      // Filter out very short matches (likely not product names)
      if (name.length >= 4) {
        results.push({ name, originalText: match[0] });
      }
    }
  }

  // Deduplicate by name
  const seen = new Set();
  return results.filter(r => {
    const key = r.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Extract the requested spec field from a query string.
 * Returns { field, aliases } or null.
 */
function extractRequestedField(query) {
  const normalized = query.toLowerCase().trim();

  // Check each field alias
  for (const [alias, fieldPath] of Object.entries(FIELD_ALIASES)) {
    // Use word boundary matching for short aliases
    if (alias.length <= 3) {
      const re = new RegExp(`\\b${alias}\\b`, 'i');
      if (re.test(normalized)) {
        return { field: fieldPath, alias };
      }
    } else {
      // For longer aliases, use includes
      if (normalized.includes(alias)) {
        return { field: fieldPath, alias };
      }
    }
  }

  return null;
}

/**
 * Extract spec fields from comparison context.
 * Returns an array of field paths, or ['all'] if no specific field is mentioned.
 */
function extractComparisonFields(query) {
  const normalized = query.toLowerCase().trim();
  const fields = [];

  // Check for specific field mentions
  for (const [alias, fieldPath] of Object.entries(FIELD_ALIASES)) {
    if (alias.length <= 3) {
      const re = new RegExp(`\\b${alias}\\b`, 'i');
      if (re.test(normalized)) {
        fields.push(fieldPath);
      }
    } else {
      if (normalized.includes(alias)) {
        fields.push(fieldPath);
      }
    }
  }

  // Deduplicate
  const unique = [...new Set(fields)];
  return unique.length > 0 ? unique : ['all'];
}

/* ------------------------------------------------------------------ */
/*  Get nested value from product specs                                */
/* ------------------------------------------------------------------ */

function getSpecValue(product, fieldPath) {
  if (!product || !product.specs) return null;

  const parts = fieldPath.split('.');
  let current = product.specs;

  for (const part of parts) {
    if (current == null || typeof current !== 'object') return null;
    current = current[part];
  }

  return current;
}

/* ------------------------------------------------------------------ */
/*  Product lookup                                                     */
/* ------------------------------------------------------------------ */

/**
 * Find a product by name. Uses case-insensitive partial matching.
 * Returns the best match or null.
 */
async function findProductByName(name) {
  const normalized = name.toLowerCase().trim();

  // Try exact name match first
  let product = await Product.findOne({
    name: { $regex: new RegExp(`^${escapeRegex(normalized)}$`, 'i') },
    isActive: true,
  }).lean();

  if (product) return product;

  // Try partial name match
  product = await Product.findOne({
    name: { $regex: new RegExp(escapeRegex(normalized), 'i') },
    isActive: true,
  }).lean();

  if (product) return product;

  // Try with brand prefix removed (e.g., "samsung galaxy s24" -> "galaxy s24")
  const withoutBrand = normalized.replace(/^(samsung|apple|iphone|xiaomi|oneplus|google|pixel|oppo|vivo|nokia|sony|huawei|realme)\s+/i, '').trim();
  if (withoutBrand !== normalized && withoutBrand.length >= 3) {
    product = await Product.findOne({
      name: { $regex: new RegExp(escapeRegex(withoutBrand), 'i') },
      isActive: true,
    }).lean();

    if (product) return product;
  }

  // Try with model number extracted (e.g., "iphone 15 pro max 256gb" -> search for "15 pro")
  const modelMatch = normalized.match(/(\d+\s*(?:pro|ultra|plus|max|mini|lite|se)?)/i);
  if (modelMatch) {
    const modelPattern = modelMatch[1].trim();
    product = await Product.findOne({
      name: { $regex: new RegExp(escapeRegex(modelPattern), 'i') },
      isActive: true,
    }).lean();

    if (product) return product;
  }

  return null;
}

/**
 * Find multiple products by names for comparison.
 */
async function findProductsByNames(names) {
  const products = [];
  for (const name of names) {
    const product = await findProductByName(name);
    if (product) {
      products.push(product);
    }
  }
  return products;
}

/* ------------------------------------------------------------------ */
/*  Answer formatting                                                  */
/* ------------------------------------------------------------------ */

/**
 * Format a single-product spec answer.
 */
function formatSingleSpecAnswer(product, fieldPath, fieldAlias) {
  const value = getSpecValue(product, fieldPath);
  const displayName = FIELD_DISPLAY_NAMES[fieldPath] || fieldAlias;

  if (value === null || value === undefined || value === '') {
    return `Hiện hệ thống chưa có thông tin ${displayName} của ${product.name}.`;
  }

  // Handle boolean fields (expandable)
  if (typeof value === 'boolean') {
    return `${product.name} ${value ? 'hỗ trợ' : 'không hỗ trợ'} ${displayName}.`;
  }

  return `${product.name} có ${displayName}: ${value}.`;
}

/**
 * Format a comparison answer.
 */
function formatComparisonAnswer(products, fieldPaths, query) {
  if (products.length < 2) {
    return null;
  }

  const [p1, p2] = products;
  const lines = [];

  // Determine which fields to compare
  let fieldsToCompare = fieldPaths;
  if (fieldsToCompare.includes('all')) {
    // Find common spec categories
    const categories = ['screen.size', 'screen.resolution', 'screen.technology',
                       'processor.chipset', 'memory.ram', 'memory.storage',
                       'battery.capacity', 'battery.charging.wired'];
    fieldsToCompare = categories;
  }

  let hasAnyData = false;

  for (const fieldPath of fieldsToCompare) {
    const v1 = getSpecValue(p1, fieldPath);
    const v2 = getSpecValue(p2, fieldPath);
    const displayName = FIELD_DISPLAY_NAMES[fieldPath] || fieldPath;

    if (v1 || v2) {
      hasAnyData = true;
      const val1 = v1 || 'không có thông tin';
      const val2 = v2 || 'không có thông tin';
      lines.push(`- ${displayName}: ${p1.name} = ${val1}, ${p2.name} = ${val2}`);
    }
  }

  if (!hasAnyData) {
    return `Hiện hệ thống chưa có thông tin so sánh giữa ${p1.name} và ${p2.name}.`;
  }

  return `So sánh ${p1.name} và ${p2.name}:\n${lines.join('\n')}`;
}

/* ------------------------------------------------------------------ */
/*  Comparison query detection                                         */
/* ------------------------------------------------------------------ */

function parseComparisonQuery(query) {
  const normalized = query.toLowerCase().trim();

  for (const pattern of COMPARISON_PATTERNS) {
    const match = normalized.match(pattern);
    if (match) {
      return {
        isComparison: true,
        product1Text: match[1].trim(),
        product2Text: match[2].trim(),
      };
    }
  }

  return { isComparison: false };
}

/* ------------------------------------------------------------------ */
/*  Factual query detection                                            */
/* ------------------------------------------------------------------ */

function isFactualSpecQuery(query) {
  const normalized = query.toLowerCase().trim();

  // Check for factual query patterns
  for (const pattern of FACTUAL_QUERY_PATTERNS) {
    if (pattern.test(normalized)) {
      return true;
    }
  }

  // Check if query contains a known field alias
  const field = extractRequestedField(normalized);
  if (field) {
    // Also check if there's a product name
    const products = extractProductNames(normalized);
    if (products.length > 0) {
      return true;
    }
  }

  return false;
}

/* ------------------------------------------------------------------ */
/*  Main resolution function                                           */
/* ------------------------------------------------------------------ */

/**
 * Attempt to resolve a factual product-spec query deterministically.
 *
 * @param {string} query - The user's query
 * @returns {Promise<{type: string, answer: string}|null>}
 *   - { type: 'single_spec', answer: string } for single-product spec lookup
 *   - { type: 'comparison', answer: string } for comparison queries
 *   - null if the query cannot be confidently resolved
 */
async function resolveProductSpec(query) {
  if (!query || typeof query !== 'string') return null;

  const normalized = query.toLowerCase().trim();
  logger.debug({ query: normalized }, '[SpecResolver] Processing query');

  // Step 1: Check if this is a comparison query
  const comparison = parseComparisonQuery(normalized);
  if (comparison.isComparison) {
    logger.debug({ comparison }, '[SpecResolver] Detected comparison query');

    const fields = extractComparisonFields(normalized);
    const products = await findProductsByNames([comparison.product1Text, comparison.product2Text]);

    if (products.length >= 2) {
      const answer = formatComparisonAnswer(products, fields, normalized);
      if (answer) {
        logger.debug({ productCount: products.length, fields }, '[SpecResolver] Comparison resolved');
        return { type: 'comparison', answer };
      }
    }

    // Could not resolve comparison — fall through
    logger.debug('[SpecResolver] Comparison not resolved, falling through');
    return null;
  }

  // Step 2: Check if this is a single-product factual query
  if (!isFactualSpecQuery(normalized)) {
    logger.debug('[SpecResolver] Not a factual spec query, falling through');
    return null;
  }

  // Step 3: Extract product name and requested field
  const productNames = extractProductNames(normalized);
  const field = extractRequestedField(normalized);

  if (productNames.length === 0 || !field) {
    logger.debug('[SpecResolver] Missing product name or field, falling through');
    return null;
  }

  // Step 4: Find the product
  const product = await findProductByName(productNames[0].name);
  if (!product) {
    logger.debug({ productName: productNames[0].name }, '[SpecResolver] Product not found, falling through');
    return null;
  }

  // Step 5: Format the answer
  const answer = formatSingleSpecAnswer(product, field.field, field.alias);
  logger.debug({ productId: product._id, field: field.field }, '[SpecResolver] Single spec resolved');

  return { type: 'single_spec', answer };
}

/* ------------------------------------------------------------------ */
/*  Utility functions                                                  */
/* ------------------------------------------------------------------ */

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
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
  FIELD_ALIASES,
  FIELD_DISPLAY_NAMES,
  COMPARISON_PATTERNS,
  FACTUAL_QUERY_PATTERNS,
};
