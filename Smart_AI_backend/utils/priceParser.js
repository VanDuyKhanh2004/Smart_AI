/**
 * Parse Vietnamese natural-language price expressions from a query string.
 *
 * Returns { minPrice, maxPrice, cleanedQuery }
 *   - minPrice / maxPrice are numbers (VND) or null.  Inclusive.
 *   - cleanedQuery is the original query with the price expression removed.
 */

const UNIT_MAP = {
  triệu: 1_000_000,
  trieu: 1_000_000,
  tr: 1_000_000,
  nghìn: 1_000,
  nghin: 1_000,
  k: 1_000,
};

function parseNumber(raw) {
  return parseFloat(raw.replace(/[.,\s]/g, ''));
}

function parseVietnamesePrice(query) {
  if (!query || typeof query !== 'string') {
    return { minPrice: null, maxPrice: null, cleanedQuery: query || '' };
  }

  let minPrice = null;
  let maxPrice = null;
  let cleanedQuery = query;

  // Helper: remove the match from cleanedQuery
  function remove(text) {
    cleanedQuery = cleanedQuery.replace(text, '').replace(/\s+/g, ' ').trim();
  }

  // 1. Range: "từ <num1>[unit1] (đến|->|–|—|tới) <num2>[unit2]"
  const rangeRe = /từ\s+(\d{1,3}(?:[.,\s]?\d{3})*(?:[.,]\d+)?)\s*(triệu|trieu|tr|nghìn|nghin|k)?\s*(?:đến|->|–|—|tới)\s*(\d{1,3}(?:[.,\s]?\d{3})*(?:[.,]\d+)?)\s*(triệu|trieu|tr|nghìn|nghin|k)?/i;
  let m = query.match(rangeRe);
  if (m) {
    const unit1 = (m[2] || '').toLowerCase();
    const unit2 = (m[4] || '').toLowerCase();
    const mult1 = UNIT_MAP[unit1] || (unit2 ? UNIT_MAP[unit2] : 1_000_000);
    const mult2 = UNIT_MAP[unit2] || mult1;
    minPrice = parseNumber(m[1]) * mult1;
    maxPrice = parseNumber(m[3]) * mult2;
    remove(m[0]);
    return { minPrice, maxPrice, cleanedQuery };
  }

  // 2. Strict max: "tối đa / không quá / chỉ <num>[unit]"
  const strictMaxRe = /(tối đa|không quá|tối đa là|chỉ)\s+(\d{1,3}(?:[.,\s]?\d{3})*(?:[.,]\d+)?)\s*(triệu|trieu|tr|nghìn|nghin|k)?/i;
  m = query.match(strictMaxRe);
  if (m) {
    const unit = (m[3] || 'triệu').toLowerCase();
    const mult = UNIT_MAP[unit] || 1_000_000;
    maxPrice = parseNumber(m[2]) * mult;
    remove(m[0]);
    return { minPrice: null, maxPrice, cleanedQuery };
  }

  // 3. "dưới <num>[unit]" — strict <
  const duoiRe = /dưới\s+(\d{1,3}(?:[.,\s]?\d{3})*(?:[.,]\d+)?)\s*(triệu|trieu|tr|nghìn|nghin|k)?/i;
  m = query.match(duoiRe);
  if (m) {
    const unit = (m[2] || 'triệu').toLowerCase();
    const mult = UNIT_MAP[unit] || 1_000_000;
    maxPrice = parseNumber(m[1]) * mult - 1;
    remove(m[0]);
    return { minPrice: null, maxPrice, cleanedQuery };
  }

  // 4. "<num>[unit] trở xuống"
  const xuongRe = /(\d{1,3}(?:[.,\s]?\d{3})*(?:[.,]\d+)?)\s*(triệu|trieu|tr)\s*trở\s*xuống/i;
  m = query.match(xuongRe);
  if (m) {
    const unit = (m[2] || 'triệu').toLowerCase();
    const mult = UNIT_MAP[unit] || 1_000_000;
    maxPrice = parseNumber(m[1]) * mult;
    remove(m[0]);
    return { minPrice: null, maxPrice, cleanedQuery };
  }

  // 5. Strict min: "trên / nhiều hơn <num>[unit]" — strict >
  const strictMinRe = /(trên|nhiều hơn)\s+(\d{1,3}(?:[.,\s]?\d{3})*(?:[.,]\d+)?)\s*(triệu|trieu|tr|nghìn|nghin|k)?/i;
  m = query.match(strictMinRe);
  if (m) {
    const unit = (m[3] || 'triệu').toLowerCase();
    const mult = UNIT_MAP[unit] || 1_000_000;
    minPrice = parseNumber(m[2]) * mult + 1;
    remove(m[0]);
    return { minPrice, maxPrice: null, cleanedQuery };
  }

  // 6. Soft patterns (tầm / khoảng) — no hard filter
  const softRe = /(tầm|khoảng|cỡ|chừng|tầm khoảng)\s+(\d{1,3}(?:[.,\s]?\d{3})*(?:[.,]\d+)?)\s*(triệu|trieu|tr|nghìn|nghin|k)?/i;
  m = query.match(softRe);
  if (m) {
    remove(m[0]);
    return { minPrice: null, maxPrice: null, cleanedQuery };
  }

  // 7. Standalone "<num><unit>" — extract value but no hard filter enforcement
  const bareRe = /(\d{1,3}(?:[.,\s]?\d{3})*(?:[.,]\d+)?)\s*(triệu|trieu|tr|nghìn|nghin|k)\b/i;
  m = query.match(bareRe);
  if (m) {
    const unit = m[2].toLowerCase();
    const mult = UNIT_MAP[unit];
    if (mult) {
      const val = parseNumber(m[1]) * mult;
      remove(m[0]);
      return { minPrice: null, maxPrice: val, cleanedQuery };
    }
  }

  return { minPrice: null, maxPrice: null, cleanedQuery };
}

module.exports = { parseVietnamesePrice };
