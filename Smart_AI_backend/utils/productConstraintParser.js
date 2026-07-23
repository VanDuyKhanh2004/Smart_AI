/**
 * Parse Vietnamese natural-language product constraints from a query string.
 *
 * Returns:
 * {
 *   cleanedQuery: string,      // query with hard-constraint phrases removed
 *   filters: {                  // hard constraints for MongoDB + JS validation
 *     minPrice: number|null,
 *     maxPrice: number|null,
 *     brands: string[]|null,       // allowed brands (lowercase)
 *     excludedBrands: string[]|null,
 *     inStock: boolean|null,
 *     ramGB: number[]|null,        // any of these values
 *     minRamGB: number|null,
 *     maxRamGB: number|null,
 *     storageGB: number[]|null,    // any of these values
 *     minStorageGB: number|null,
 *     maxStorageGB: number|null,
 *     colors: string[]|null,       // normalized lowercase names
 *   },
 *   preferences: {              // soft preferences — not hard-filtered
 *     camera: boolean,
 *     battery: boolean,
 *     performance: boolean,
 *     compact: boolean,
 *   }
 * }
 */

const { parseVietnamesePrice } = require('./priceParser');

/* ------------------------------------------------------------------ */
/*  Brand map                                                         */
/* ------------------------------------------------------------------ */
const BRAND_MAP = [
  { canonical: 'samsung', aliases: ['samsung', 'sam sung', 'sam sung'] },
  { canonical: 'apple', aliases: ['apple', 'iphone', 'ip', 'iphon'] },
  { canonical: 'xiaomi', aliases: ['xiaomi', 'xiao mi', 'redmi', 'poco'] },
  { canonical: 'oppo', aliases: ['oppo', 'óp', 'op'] },
  { canonical: 'vivo', aliases: ['vivo', 'vi vo'] },
  { canonical: 'oneplus', aliases: ['oneplus', 'one plus', 'oneplus', '1+'] },
  { canonical: 'google', aliases: ['google', 'pixel', 'pixcel'] },
  { canonical: 'nokia', aliases: ['nokia'] },
  { canonical: 'sony', aliases: ['sony', 'xperia'] },
  { canonical: 'huawei', aliases: ['huawei'] },
];

const ALL_BRAND_ALIASES = BRAND_MAP.flatMap(e => e.aliases);
const EXCLUDE_PREFIXES = ['không lấy', 'không', 'trừ', 'ngoại trừ', 'loại trừ'];

/* ------------------------------------------------------------------ */
/*  Color map                                                         */
/* ------------------------------------------------------------------ */
const COLOR_MAP = [
  { canonical: 'black', aliases: ['đen', 'black', 'den'] },
  { canonical: 'white', aliases: ['trắng', 'white', 'trang', 'bạc'] },
  { canonical: 'blue', aliases: ['xanh', 'blue', 'xanh dương', 'xanh nước biển'] },
  { canonical: 'red', aliases: ['đỏ', 'red', 'do'] },
  { canonical: 'gold', aliases: ['vàng', 'gold', 'vang', 'golden'] },
  { canonical: 'silver', aliases: ['bạc', 'silver', 'bac'] },
  { canonical: 'gray', aliases: ['xám', 'gray', 'grey', 'xam'] },
  { canonical: 'purple', aliases: ['tím', 'purple', 'tim'] },
  { canonical: 'pink', aliases: ['hồng', 'pink', 'hong'] },
];

const ALL_COLOR_ALIASES = COLOR_MAP.flatMap(e => e.aliases);

/* ------------------------------------------------------------------ */
/*  Category keywords                                                 */
/* ------------------------------------------------------------------ */
const CATEGORY_KEYWORDS = [
  { canonical: 'phone', keywords: ['điện thoại', 'smartphone', 'phone', 'dien thoai', 'đt'] },
  { canonical: 'laptop', keywords: ['laptop', 'máy tính xách tay', 'notebook', 'may tinh'] },
  { canonical: 'tablet', keywords: ['tablet', 'máy tính bảng', 'ipad', 'may tinh bang'] },
];

/* ------------------------------------------------------------------ */
/*  Soft preference keywords                                          */
/* ------------------------------------------------------------------ */
const PREFERENCE_PATTERNS = {
  camera: /camera\s*(tốt|đẹp|pro|cao|khủng|xịn|xuất sắc)|chụp\s*(ảnh|hình)\s*(đẹp|tốt)|nhiếp\s*ảnh/i,
  battery: /pin\s*(trâu|lâu|khủng|to|cao|tốt)|lâu\s*pin|battery/i,
  performance: /hiệu\s*năng\s*(mạnh|cao|tốt)|chơi\s*game|chip\s*(mạnh|tốt)|xử\s*lý|snapdragon|a\d{2,}\s*(pro|bionic)?/i,
  compact: /nhỏ\s*gọn|gọn\s*nhẹ|nhẹ|mỏng|nhỏ\s*(gọn|nhẹ)|compact/i,
};

/* ------------------------------------------------------------------ */
/*  Utility helpers                                                   */
/* ------------------------------------------------------------------ */

function removePatterns(text, patterns) {
  let result = text;
  for (const re of patterns) {
    result = result.replace(re, '');
  }
  return result.replace(/\s+/g, ' ').trim();
}

/** Normalize a query: lowercase, trim, collapse whitespace */
function normalize(text) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Find a brand alias in the normalized text; returns { canonical, fullMatch } or null */
function findBrandAlias(norm) {
  for (const entry of BRAND_MAP) {
    for (const alias of entry.aliases) {
      const idx = norm.indexOf(alias);
      if (idx !== -1) {
        // Verify it's a word boundary (not part of another word)
        const before = idx === 0 ? ' ' : norm[idx - 1];
        const afterIdx = idx + alias.length;
        const after = afterIdx >= norm.length ? ' ' : norm[afterIdx];
        if (/[\s,.]/.test(before) && /[\s,.]/.test(after)) {
          return { canonical: entry.canonical, fullMatch: alias, idx };
        }
      }
    }
  }
  return null;
}

function findColorAlias(norm) {
  for (const entry of COLOR_MAP) {
    for (const alias of entry.aliases) {
      const idx = norm.indexOf(alias);
      if (idx !== -1) {
        const before = idx === 0 ? ' ' : norm[idx - 1];
        const afterIdx = idx + alias.length;
        const after = afterIdx >= norm.length ? ' ' : norm[afterIdx];
        if (/[\s,.]/.test(before) && /[\s,.]/.test(after)) {
          return { canonical: entry.canonical, fullMatch: alias, idx };
        }
      }
    }
  }
  return null;
}

/** Parse a number from text like "8GB", "8 GB", "ít nhất 8GB" */
function extractGBValue(text) {
  if (!text) return null;
  const m = text.match(/(\d+)\s*gb/i);
  return m ? parseInt(m[1], 10) : null;
}

/* ------------------------------------------------------------------ */
/*  Sub-parsers (each works on raw query, returns result + new working)*/
/* ------------------------------------------------------------------ */

function parseBrands(raw) {
  const brands = [];
  const excludedBrands = [];
  let working = raw;
  const norm = normalize(working);

  // 1. Detect excluded brands first: "không lấy X", "trừ X", etc.
  for (const prefix of EXCLUDE_PREFIXES) {
    const pNorm = normalize(prefix);
    let idx = norm.indexOf(pNorm);
    while (idx !== -1) {
      const afterIdx = idx + pNorm.length;
      const remainder = norm.slice(afterIdx).trim();
      const found = findBrandAlias(remainder);
      if (found) {
        excludedBrands.push(found.canonical);
        // Remove the phrase from working
        const phraseInNorm = pNorm + ' ' + found.fullMatch;
        const re = new RegExp(phraseInNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        working = working.replace(re, '');
        brandRemoved = true;
        break; // only one exclusion per prefix match
      }
      idx = norm.indexOf(pNorm, idx + 1);
    }
  }

  // 2. Detect allowed brands: "Samsung", "Samsung hoặc Xiaomi", etc.
  // Remove excluded brands from norm to avoid re-matching
  let searchNorm = normalize(working);
  for (const exc of excludedBrands) {
    const entry = BRAND_MAP.find(e => e.canonical === exc);
    if (entry) {
      for (const alias of entry.aliases) {
        const re = new RegExp('\\b' + alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
        searchNorm = searchNorm.replace(re, '');
        working = working.replace(re, '');
      }
    }
  }

  // Re-scan for allowed brands
  let brandFound = true;
  while (brandFound) {
    brandFound = false;
    const currentNorm = normalize(working);
    const found = findBrandAlias(currentNorm);
    if (found && !excludedBrands.includes(found.canonical) && !brands.includes(found.canonical)) {
      brands.push(found.canonical);
      // Remove the brand alias from working
      const re = new RegExp('\\b' + found.fullMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
      working = working.replace(re, '');
      brandFound = true;
    }
  }

  const uniqueExcluded = [...new Set(excludedBrands)];
  return {
    brands: brands.length > 0 ? brands : null,
    excludedBrands: uniqueExcluded.length > 0 ? uniqueExcluded : null,
    cleanedQuery: working.replace(/\s+/g, ' ').trim(),
  };
}

function parseStock(raw) {
  let inStock = null;
  let working = raw;
  const norm = normalize(working);

  const inStockPatterns = [
    /\bcòn\s*hàng\b/i,
    /\bcó\s*sẵn\b/i,
    /đang\s*bán\b/i,
  ];
  const outOfStockPatterns = [
    /\bhết\s*hàng\b/i,
  ];

  for (const re of inStockPatterns) {
    if (re.test(norm)) {
      inStock = true;
      working = working.replace(re, '');
    }
  }

  // Only apply false if explicitly stated
  for (const re of outOfStockPatterns) {
    if (re.test(norm)) {
      inStock = false;
      working = working.replace(re, '');
    }
  }

  return {
    inStock,
    cleanedQuery: working.replace(/\s+/g, ' ').trim(),
  };
}

function parseRAM(raw) {
  let working = raw;
  const ramGB = [];
  let minRamGB = null;
  let maxRamGB = null;
  const norm = normalize(working);

  // Patterns: "RAM 8GB", "RAM 8 hoặc 12GB", "RAM ít nhất 8GB", "RAM tối đa 12GB", "RAM từ 8GB"
  const ramRe = /ram\s*(tối\s*đa|ít\s*nhất|tối\s*thiểu|từ|trên|không\s*quá)?\s*(\d+)\s*gb/gi;
  let m;
  while ((m = ramRe.exec(norm)) !== null) {
    const val = parseInt(m[2], 10);
    const modifier = (m[1] || '').toLowerCase().replace(/\s+/g, ' ');
    if (/^tối đa$|^không quá$/.test(modifier)) {
      maxRamGB = val;
    } else if (/^ít nhất$|^tối thiểu$|^từ$|^trên$/.test(modifier)) {
      minRamGB = val;
    } else if (/hoặc|hay|\//.test(norm.slice(m.index + m[0].length, m.index + m[0].length + 10).toLowerCase())) {
      ramGB.push(val);
    } else if (val) {
      if (ramGB.length === 0) {
        minRamGB = val;
        maxRamGB = val;
      } else {
        ramGB.push(val);
      }
    }
  }

  // Also handle "RAM X hoặc Y" pattern (without gb after X)
  const altRe = /ram\s*(\d+)\s*(?:gb)?\s*(?:hoặc|hay|\/)\s*(\d+)\s*gb/gi;
  while ((m = altRe.exec(norm)) !== null) {
    ramGB.push(parseInt(m[1], 10));
    ramGB.push(parseInt(m[2], 10));
  }

  // Handle "RAM từ X GB đến Y GB" range
  const rangeRe = /ram\s*(?:từ|ít\s*nhất)\s*(\d+)\s*gb\s*đến\s*(\d+)\s*gb/gi;
  while ((m = rangeRe.exec(norm)) !== null) {
    minRamGB = parseInt(m[1], 10);
    maxRamGB = parseInt(m[2], 10);
  }

  // If alternatives array is populated, it takes precedence — clear min/max
  if (ramGB.length > 0) {
    minRamGB = null;
    maxRamGB = null;
  }

  // Remove RAM phrases
  working = working.replace(/ram\s*(\d+)\s*(?:gb)?\s*(?:hoặc|hay|\/)\s*(\d+)\s*gb/gi, '');
  working = working.replace(/ram\s*(?:ít\s*nhất|tối\s*thiểu|từ|trên|tối\s*đa|không\s*quá)?\s*(\d+)\s*gb/gi, '');

  const unique = [...new Set(ramGB)];
  return {
    ramGB: unique.length > 0 ? unique : null,
    minRamGB,
    maxRamGB,
    cleanedQuery: working.replace(/\s+/g, ' ').trim(),
  };
}

function parseStorage(raw) {
  let working = raw;
  const storageGB = [];
  let minStorageGB = null;
  let maxStorageGB = null;
  const norm = normalize(working);

  // Must NOT be preceded by "ram" to avoid confusion
  // Patterns: "128GB", "bộ nhớ 256GB", "128 hoặc 256GB", "ít nhất 256GB", "tối đa 512GB"
  const storageRe = /(?:bộ\s*nhớ|dung\s*lượng|storage)?\s*(\d+)\s*gb\b/gi;
  let m;
  while ((m = storageRe.exec(norm)) !== null) {
    // Skip if this is a RAM mention (preceded by "ram")
    const before = norm.slice(Math.max(0, m.index - 5), m.index);
    if (/\bram\b/i.test(before)) continue;

    const val = parseInt(m[1], 10);
    if (val < 16) continue; // storage is usually >= 16GB, RAM is often < 16GB

    const prefix = norm.slice(Math.max(0, m.index - 15), m.index).toLowerCase();
    if (/đến/.test(prefix)) {
      maxStorageGB = val;
    } else if (/ít\s*nhất|tối\s*thiểu|từ|trên/.test(prefix)) {
      minStorageGB = val;
    } else if (/tối đa|tối\s*đa|không\s*quá|trở\s*xuống/.test(prefix)) {
      maxStorageGB = val;
    } else if (/hoặc|hay|\//.test(norm.slice(m.index + m[0].length, m.index + m[0].length + 10).toLowerCase())) {
      storageGB.push(val);
    } else {
      // Single value — could be exact or min
      if (!minStorageGB && !maxStorageGB && storageGB.length === 0) {
        minStorageGB = val;
        maxStorageGB = val;
      } else if (storageGB.length > 0 || minStorageGB != null || maxStorageGB != null) {
        storageGB.push(val);
      }
    }
  }

  // Handle "X hoặc Y GB" pattern
  const altRe = /(\d+)\s*(?:gb)?\s*(?:hoặc|hay|\/)\s*(\d+)\s*gb/gi;
  while ((m = altRe.exec(norm)) !== null) {
    const before = norm.slice(Math.max(0, m.index - 5), m.index);
    if (!/\bram\b/i.test(before)) {
      storageGB.push(parseInt(m[1], 10));
      storageGB.push(parseInt(m[2], 10));
    }
  }

  // Handle "từ X đến Y GB" range (XB may be without GB suffix)
  const rangeRe = /từ\s*(\d+)\s*(?:gb)?\s*đến\s*(\d+)\s*gb/gi;
  while ((m = rangeRe.exec(norm)) !== null) {
    const before = norm.slice(Math.max(0, m.index - 5), m.index);
    if (!/\bram\b/i.test(before)) {
      minStorageGB = parseInt(m[1], 10);
      maxStorageGB = parseInt(m[2], 10);
    }
  }

  // If alternatives array is populated, it takes precedence — clear min/max
  if (storageGB.length > 0) {
    minStorageGB = null;
    maxStorageGB = null;
  }

  // Remove storage phrases from working
  working = working.replace(/(?:bộ\s*nhớ|dung\s*lượng|storage)?\s*(\d+)\s*(?:gb)?\s*(?:hoặc|hay|\/)\s*(\d+)\s*gb/gi, '');
  working = working.replace(/(?:bộ\s*nhớ|dung\s*lượng|storage)?\s*(\d+)\s*gb\b/gi, '');

  const unique = [...new Set(storageGB)];
  return {
    storageGB: unique.length > 0 ? unique : null,
    minStorageGB,
    maxStorageGB,
    cleanedQuery: working.replace(/\s+/g, ' ').trim(),
  };
}

function parseColors(raw) {
  const colors = [];
  let working = raw;
  const norm = normalize(working);

  const found = findColorAlias(norm);
  if (found) {
    colors.push(found.canonical);
    const re = new RegExp('\\b' + found.fullMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
    working = working.replace(re, '');
  }

  // Also check for comma-separated: "màu đen" or "đen"
  const colorKeywords = ['màu', 'color', 'colour'];
  for (const kw of colorKeywords) {
    const re = new RegExp('\\b' + kw + '\\s+(' + ALL_COLOR_ALIASES.join('|') + ')', 'gi');
    let m;
    while ((m = re.exec(norm)) !== null) {
      const colorNorm = m[1].toLowerCase();
      const entry = COLOR_MAP.find(e => e.aliases.includes(colorNorm));
      if (entry) {
        colors.push(entry.canonical);
        working = working.replace(m[0], '');
      }
    }
  }

  const unique = [...new Set(colors)];
  return {
    colors: unique.length > 0 ? unique : null,
    cleanedQuery: working.replace(/\s+/g, ' ').trim(),
  };
}

function parseCategory(raw) {
  let working = raw;
  const norm = normalize(working);
  let category = null;

  for (const entry of CATEGORY_KEYWORDS) {
    for (const kw of entry.keywords) {
      const idx = norm.indexOf(kw);
      if (idx !== -1) {
        category = entry.canonical;
        // We keep category in cleanedQuery for semantic search, so don't remove it
        // But we track it for potential future filtering
        break;
      }
    }
    if (category) break;
  }

  return { category, cleanedQuery: working };
}

function parsePreferences(raw) {
  const prefs = { camera: false, battery: false, performance: false, compact: false };
  for (const [key, re] of Object.entries(PREFERENCE_PATTERNS)) {
    if (re.test(raw)) {
      prefs[key] = true;
    }
  }
  return prefs;
}

/* ------------------------------------------------------------------ */
/*  Main entry point                                                  */
/* ------------------------------------------------------------------ */

function parseProductConstraints(query) {
  if (!query || typeof query !== 'string') {
    return {
      cleanedQuery: query || '',
      filters: {
        minPrice: null, maxPrice: null,
        brands: null, excludedBrands: null,
        inStock: null,
        ramGB: null, minRamGB: null, maxRamGB: null,
        storageGB: null, minStorageGB: null, maxStorageGB: null,
        colors: null,
      },
      preferences: { camera: false, battery: false, performance: false, compact: false },
    };
  }

  let working = query;

  // 1. Brand (no number overlap with price)
  const brandResult = parseBrands(working);
  working = brandResult.cleanedQuery;

  // 2. Stock (no number overlap with price)
  const stockResult = parseStock(working);
  working = stockResult.cleanedQuery;

  // 3. RAM (may contain "tối đa X GB" which priceParser would misinterpret)
  const ramResult = parseRAM(working);
  working = ramResult.cleanedQuery;

  // 4. Storage (may contain "tối đa X GB" which priceParser would misinterpret)
  const storageResult = parseStorage(working);
  working = storageResult.cleanedQuery;

  // 5. Price (run after RAM/storage so "tối đa X GB" doesn't become a price)
  const priceResult = parseVietnamesePrice(working);
  working = priceResult.cleanedQuery || working;

  // 6. Color
  const colorResult = parseColors(working);
  working = colorResult.cleanedQuery;

  // 7. Category (detect only, keep in cleanedQuery)
  const categoryResult = parseCategory(working);
  working = categoryResult.cleanedQuery;

  // 8. Soft preferences (detect only, no removal)
  const preferences = parsePreferences(query); // use original query for preference detection

  return {
    cleanedQuery: working,
    filters: {
      minPrice: priceResult.minPrice,
      maxPrice: priceResult.maxPrice,
      brands: brandResult.brands,
      excludedBrands: brandResult.excludedBrands,
      inStock: stockResult.inStock,
      ramGB: ramResult.ramGB,
      minRamGB: ramResult.minRamGB,
      maxRamGB: ramResult.maxRamGB,
      storageGB: storageResult.storageGB,
      minStorageGB: storageResult.minStorageGB,
      maxStorageGB: storageResult.maxStorageGB,
      colors: colorResult.colors,
    },
    preferences,
  };
}

module.exports = { parseProductConstraints };
