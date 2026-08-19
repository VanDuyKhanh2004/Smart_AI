/**
 * Evaluation-only deterministic embedding override for utils/openai.
 *
 * Lets the REAL services/productSearchService.search() (and any module that
 * destructures `generateEmbedding` from utils/openai) run fully offline with
 * no embedding API key, no network calls, and fully deterministic output.
 *
 * Installation replaces utils/openai in the Node require cache BEFORE the
 * consumer module is required — the exact pattern used by
 * evaluation/recommendation/runRecommendationEvaluation.js for models/Product.
 *
 * Dimension layout mirrors recommendationStore.buildEmbedding() so cosine
 * similarity against store product vectors is meaningful:
 *   0-5  brand index (samsung=0, apple=1, xiaomi=2, oneplus=3, google=4, oppo=5)
 *   6    priceLog = (log10(priceVND) - 5.5) / 2.2
 *   7    primary camera MP / 100
 *   8    camera feature set / 8
 *   9    front camera MP / 50
 *   10   battery mAh / 6000
 *   11   wired charging W / 120
 *   12   RAM GB / 16
 *   13   storage GB / 512
 *   14   chipset tier (1 / 0.5 / 0.1)
 *   15   compactness (7.5 - size) / 2.5
 *   16   weight compactness (250 - weight) / 120
 */

const { parseVietnamesePrice } = require('../utils/priceParser');

const DIMENSIONS = 1536;
const BRAND_INDEX = { samsung: 0, apple: 1, xiaomi: 2, oneplus: 3, google: 4, oppo: 5 };

const BRAND_PATTERNS = [
  { brand: 'samsung', re: /\bsamsung\b/ },
  { brand: 'apple', re: /\biphone\b|\bapple\b/ },
  { brand: 'xiaomi', re: /\bxiaomi\b|\bredmi\b/ },
  { brand: 'oneplus', re: /\bone\s?plus\b/ },
  { brand: 'google', re: /\bgoogle\b|\bpixel\b/ },
  { brand: 'oppo', re: /\boppo\b|\breno\b/ },
];

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Deterministic, dimension-compatible query embedding derived purely from the
 * query text. Same spec basis as recommendationStore.buildEmbedding().
 */
function createDeterministicEmbedding(queryText) {
  const v = new Array(DIMENSIONS).fill(0);
  const raw = String(queryText || '').toLowerCase();

  // Brand: set the same brand dim (0.5) a matching product would carry.
  for (const { brand, re } of BRAND_PATTERNS) {
    if (re.test(raw)) {
      v[BRAND_INDEX[brand]] = 0.5;
      break;
    }
  }

  // Price: reuse the production Vietnamese price parser, then encode the
  // target price through the same priceLog formula as product embeddings.
  const { minPrice, maxPrice, cleanedQuery } = parseVietnamesePrice(queryText);
  let targetPrice = null;
  if (minPrice !== null && maxPrice !== null) targetPrice = (minPrice + maxPrice) / 2;
  else if (maxPrice !== null) targetPrice = maxPrice;
  else if (minPrice !== null) targetPrice = minPrice;
  else if (/(giá rẻ|\brẻ\b|bình dân|phổ thông)/.test(raw)) targetPrice = 5_000_000;
  if (targetPrice !== null) {
    v[6] = (Math.log10(Math.max(1, targetPrice)) - 5.5) / 2.2;
  }

  // RAM: "8gb ram" / "ram 8gb" / "8 gb ram"
  const ramRe = /(\d+)\s*gb\s*ram|ram\s*(\d+)\s*gb/i;
  let ramMatch = raw.match(ramRe);
  if (ramMatch) {
    const ram = parseInt(ramMatch[1] || ramMatch[2], 10) || 0;
    v[12] = Math.min(ram, 16) / 16;
  }

  // Storage: a 3-digit (or 1tb) GB amount that is not the RAM slot.
  const storageRe = /\b(\d{3})\s*gb\b|\b1\s*tb\b/i;
  let storageMatch = raw.match(storageRe);
  if (storageMatch) {
    const storage = storageMatch[1] ? parseInt(storageMatch[1], 10) : 1024;
    v[13] = Math.min(storage, 512) / 512;
  }

  // Camera: feature-richness intent and explicit megapixels.
  if (/(\bcamera\b|chụp ảnh|\bchụp\b|\bảnh\b|\bzoom\b|nhiều camera)/.test(raw)) {
    v[8] = 1;
  }
  const mpMatch = raw.match(/(\d{2,3})\s*(?:mp|megapixel)/i);
  if (mpMatch) {
    v[7] = Math.min(parseInt(mpMatch[1], 10) || 0, 100) / 100;
  }

  // Battery / charging.
  if (/(\bpin\b|\btrâu\b|dung lượng)/.test(raw)) {
    v[10] = 1;
  }
  const mAhMatch = raw.match(/(\d{4,5})\s*mah/i);
  if (mAhMatch) {
    v[10] = Math.min(parseInt(mAhMatch[1], 10) || 0, 6000) / 6000;
  }
  const wattMatch = raw.match(/(\d{2,3})\s*w\b/i);
  if (wattMatch) {
    v[11] = Math.min(parseInt(wattMatch[1], 10) || 0, 120) / 120;
  }

  // Performance / gaming.
  if (/(hiệu năng|chơi game|\bgaming\b|\bđỉnh\b|snapdragon 8|\bmạnh\b)/.test(raw)) {
    v[14] = 1;
  }

  // Compact / lightweight.
  if (/(nhỏ gọn|gọn nhẹ|màn hình nhỏ|\bnhẹ\b|\bcompact\b)/.test(raw)) {
    v[15] = 1;
    v[16] = 1;
  }

  return v;
}

const generateEmbedding = async text => createDeterministicEmbedding(text);

const generateEmbeddingsBatch = async texts =>
  Promise.all((Array.isArray(texts) ? texts : [texts]).map(createDeterministicEmbedding));

const calculateSimilarity = (a, b) => cosine(a, b);

const testOpenAIConnection = async () => true;

/**
 * Build the module exports shape of utils/openai (see its module.exports).
 */
function createOpenAIEmbeddingOverride() {
  return {
    generateEmbedding,
    generateEmbeddingsBatch,
    calculateSimilarity,
    testOpenAIConnection,
  };
}

/**
 * Install the override into the require cache for utils/openai.
 * Must run BEFORE the consumer (e.g. services/productSearchService) is
 * required. Returns the override object.
 */
function installDeterministicOpenAIEmbedding() {
  const override = createOpenAIEmbeddingOverride();
  const openaiPath = require.resolve('../utils/openai');
  require.cache[openaiPath] = {
    id: openaiPath,
    filename: openaiPath,
    loaded: true,
    exports: override,
  };
  return override;
}

module.exports = {
  DIMENSIONS,
  createDeterministicEmbedding,
  createOpenAIEmbeddingOverride,
  installDeterministicOpenAIEmbedding,
};