/**
 * Deterministic Vietnamese constraint parser for the product recommendation system.
 *
 * Parses a natural-language query into a small structured contract:
 * {
 *   budgetMin: number | null,   // VND lower bound (inclusive), or null
 *   budgetMax: number | null,   // VND upper bound (inclusive), or null
 *   brand: string | null,       // canonical lowercase brand, or null
 *   priorities: string[]        // ordered, de-duplicated priority keys
 * }
 *
 * Pure functions only — no I/O, no database, no network, no side effects.
 * Unknown/unrecognized text never throws and simply produces empty constraints.
 */

/* ------------------------------------------------------------------ */
/*  Brand aliases (do not hardcode product names)                      */
/* ------------------------------------------------------------------ */
const BRAND_ALIASES = [
  { canonical: 'apple', aliases: ['iphone', 'apple'] },
  { canonical: 'samsung', aliases: ['samsung'] },
  { canonical: 'xiaomi', aliases: ['xiaomi', 'redmi'] },
  { canonical: 'oppo', aliases: ['oppo'] },
  { canonical: 'oneplus', aliases: ['oneplus'] },
  { canonical: 'google', aliases: ['google pixel', 'google', 'pixel'] },
];

/* ------------------------------------------------------------------ */
/*  Priority keywords                                                  */
/* ------------------------------------------------------------------ */
const PRIORITY_KEYWORDS = {
  battery: ['pin trâu', 'pin tốt', 'pin lâu', 'pin khỏe', 'thời lượng pin'],
  camera: ['chụp ảnh', 'camera tốt', 'chụp hình', 'quay phim', 'nhiếp ảnh'],
  gaming: ['chơi game', 'gaming', 'game mạnh', 'game'],
  performance: ['hiệu năng cao', 'hiệu năng', 'máy mạnh', 'mạnh'],
};

/* ------------------------------------------------------------------ */
/*  Budget units and patterns                                          */
/* ------------------------------------------------------------------ */
const UNIT_MULTIPLIERS = {
  tr: 1_000_000,
  trieu: 1_000_000,
  triệu: 1_000_000,
  nghìn: 1_000,
  nghin: 1_000,
  k: 1_000,
};

const UNIT_SOURCE = '(?:tr|trieu|triệu|nghìn|nghin|k)(?:\\s*đồng)?';
const NUMBER_SOURCE = '(\\d[\\d.,]*)';
const UNIT_CAPTURE = '(' + UNIT_SOURCE + ')?';

// Range first: "từ X đến Y" (also handles ->, –, —, tới)
const RANGE_RE = new RegExp(
  `từ\\s+${NUMBER_SOURCE}\\s*${UNIT_CAPTURE}\\s*(?:đến|->|–|—|tới)\\s*${NUMBER_SOURCE}\\s*${UNIT_CAPTURE}`,
  'i'
);

// Max expressions
const MAX_RE = new RegExp(
  `(?:dưới|tối đa|không quá|tầm khoảng|cỡ|chừng|khoảng|tầm)\\s+${NUMBER_SOURCE}\\s*${UNIT_CAPTURE}`,
  'i'
);

// Min expressions
const MIN_RE = new RegExp(
  `(?:trên|nhiều hơn|ít nhất|tối thiểu|từ)\\s+${NUMBER_SOURCE}\\s*${UNIT_CAPTURE}`,
  'i'
);

// Bare amount with a unit keyword: "20 triệu", "20tr"
const BARE_RE = new RegExp(`${NUMBER_SOURCE}\\s*(${UNIT_SOURCE})`, 'i');

/* ------------------------------------------------------------------ */
/*  Utility helpers                                                    */
/* ------------------------------------------------------------------ */

/** Normalize a query: lowercase, collapse whitespace, trim. */
function normalize(text) {
  return String(text).toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Extract a plain integer from a possibly-separated number string. */
function extractInteger(str) {
  if (!str) return null;
  const cleaned = String(str).replace(/[\s.,]/g, '');
  if (!/^\d+$/.test(cleaned)) return null;
  return parseInt(cleaned, 10);
}

/** Convert a raw number + unit string into a VND amount. */
function amountFromMatch(numStr, unitStr) {
  const value = extractInteger(numStr);
  if (value == null) return null;
  let unit = unitStr ? String(unitStr).trim().replace(/\s*đồng$/i, '') : '';
  unit = unit.toLowerCase();
  const multiplier = UNIT_MULTIPLIERS[unit] || 1;
  return value * multiplier;
}

/** Check that a substring at [start, start+len) sits on word-ish boundaries. */
function hasBoundary(norm, start, len) {
  const before = start === 0 ? '' : norm[start - 1];
  const afterIdx = start + len;
  const after = afterIdx >= norm.length ? '' : norm[afterIdx];
  return /^[\s,.]*$/.test(before) && /^[\s,.]*$/.test(after);
}

/* ------------------------------------------------------------------ */
/*  Sub-parsers                                                        */
/* ------------------------------------------------------------------ */

/** Find the earliest-occurring brand; returns canonical name or null. */
function findBrand(norm) {
  let best = null;
  for (const entry of BRAND_ALIASES) {
    for (const alias of entry.aliases) {
      let idx = norm.indexOf(alias);
      while (idx !== -1) {
        if (hasBoundary(norm, idx, alias.length)) {
          if (!best || idx < best.index) {
            best = { canonical: entry.canonical, index: idx };
          }
          break;
        }
        idx = norm.indexOf(alias, idx + 1);
      }
    }
  }
  return best ? best.canonical : null;
}

/** Extract budget constraints from a normalized query. */
function parseBudget(norm) {
  const range = norm.match(RANGE_RE);
  if (range) {
    // "từ 10 đến 20 triệu": the unit appears once, applying to both bounds
    const sharedUnit = range[2] || range[4] || '';
    const min = amountFromMatch(range[1], range[2] || sharedUnit);
    const max = amountFromMatch(range[3], range[4] || sharedUnit);
    if (min != null || max != null) {
      return { budgetMin: min, budgetMax: max };
    }
  }

  const maxMatch = norm.match(MAX_RE);
  if (maxMatch) {
    const value = amountFromMatch(maxMatch[1], maxMatch[2]);
    if (value != null) return { budgetMin: null, budgetMax: value };
  }

  const minMatch = norm.match(MIN_RE);
  if (minMatch) {
    const value = amountFromMatch(minMatch[1], minMatch[2]);
    if (value != null) return { budgetMin: value, budgetMax: null };
  }

  const bare = norm.match(BARE_RE);
  if (bare) {
    const value = amountFromMatch(bare[1], bare[2]);
    if (value != null) return { budgetMin: null, budgetMax: value };
  }

  return { budgetMin: null, budgetMax: null };
}

/**
 * Detect priority categories, ordered by their earliest occurrence in the text.
 * De-duplicated by construction (each category emitted at most once).
 *
 * Compound keywords consume their full span so that sub-words (e.g. the
 * performance keyword "mạnh" inside the gaming phrase "game mạnh") do not
 * independently trigger an additional category.
 */
function findPriorities(norm) {
  const matches = [];

  for (const category of Object.keys(PRIORITY_KEYWORDS)) {
    for (const keyword of PRIORITY_KEYWORDS[category]) {
      let idx = norm.indexOf(keyword);
      while (idx !== -1) {
        matches.push({ category, keyword, start: idx, end: idx + keyword.length });
        idx = norm.indexOf(keyword, idx + 1);
      }
    }
  }

  // Earliest start first; for ties prefer the longer (compound) keyword.
  matches.sort((a, b) => a.start - b.start || b.end - a.end || a.keyword.localeCompare(b.keyword));

  const selected = [];
  let lastEnd = -1;
  for (const m of matches) {
    if (m.start < lastEnd) continue; // consumed by an earlier, longer keyword
    selected.push(m.category);
    lastEnd = m.end;
  }

  // De-duplicate categories while preserving order.
  return selected.filter((cat, i) => selected.indexOf(cat) === i);
}

/* ------------------------------------------------------------------ */
/*  Main entry point                                                   */
/* ------------------------------------------------------------------ */

/**
 * Parse a recommendation query into constraints.
 * @param {string|null|undefined} query
 * @returns {{ budgetMin: number|null, budgetMax: number|null, brand: string|null, priorities: string[] }}
 */
function parseRecommendationConstraints(query) {
  if (!query || typeof query !== 'string') {
    return { budgetMin: null, budgetMax: null, brand: null, priorities: [] };
  }

  const norm = normalize(query);
  const budget = parseBudget(norm);

  return {
    budgetMin: budget.budgetMin,
    budgetMax: budget.budgetMax,
    brand: findBrand(norm),
    priorities: findPriorities(norm),
  };
}

module.exports = {
  parseRecommendationConstraints,
  normalize,
  extractInteger,
  amountFromMatch,
  findBrand,
  parseBudget,
  findPriorities,
};