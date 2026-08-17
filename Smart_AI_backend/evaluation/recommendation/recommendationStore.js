/**
 * Fixture-backed in-memory Product model for the offline recommendation
 * evaluation (Evaluation v2).
 *
 * Implements just the surface that services/productRecommendationService uses:
 *   findById(id).lean()
 *   aggregate(pipeline)            (handles $vectorSearch/$match/$project/$sort/$limit)
 *   find(query).sort().select().limit().lean()
 *
 * Vector search is simulated with deterministic, spec-derived embeddings so the
 * evaluation is reproducible offline. The catalog derives from the shared
 * chatbot fixtures (EVAL_PRODUCTS) plus two samsung additions that give the
 * brand-price fallback a real candidate; active products get a uniform inStock
 * so vector similarity (not stock) drives ranking in the eval, while the
 * inStock>0 filter and out-of-stock exclusion are still verified separately.
 */

const { EVAL_PRODUCTS } = require('../chatbot/fixtures/products');

/* Valid 24-char ObjectId strings so recommend()'s id validation passes. */
const IDS = {
  S24: '650000000000000000000001',
  A15: '650000000000000000000002',
  ZFOLD: '650000000000000000000003',
  A05: '650000000000000000000004',
  M34: '650000000000000000000005',
  S24FE: '650000000000000000000007',
  IP15PM: '650000000000000000000011',
  IP16P: '650000000000000000000012',
  IPSE: '650000000000000000000013',
  RN13: '650000000000000000000021',
  X14T: '650000000000000000000022',
  OP12: '650000000000000000000031',
  P9P: '650000000000000000000041',
  OLDS: '650000000000000000000051',
  NOSPEC: '650000000000000000000061',
};

const ID_BY_EVAL = {
  'eval-s1': IDS.S24,
  'eval-s2': IDS.A15,
  'eval-s3': IDS.ZFOLD,
  'eval-s4': IDS.A05,
  'eval-a1': IDS.IP15PM,
  'eval-a2': IDS.IP16P,
  'eval-a3': IDS.IPSE,
  'eval-x1': IDS.RN13,
  'eval-x2': IDS.X14T,
  'eval-n1': IDS.OP12,
  'eval-g1': IDS.P9P,
  'eval-i1': IDS.OLDS,
  'eval-m1': IDS.NOSPEC,
};

const EXTRA_PRODUCTS = [
  {
    _id: IDS.M34,
    name: 'Galaxy M34',
    brand: 'samsung',
    price: 5_490_000,
    inStock: 5,
    isActive: true,
    specs: {
      memory: { ram: '6 GB', storage: '128 GB' },
      colors: ['Blue'],
      camera: { rear: { primary: '50 MP', secondary: '5 MP' }, front: '13 MP', features: ['Night mode'] },
      battery: { capacity: '6000 mAh', charging: { wired: '25W' } },
      processor: { chipset: 'Exynos 1280' },
      screen: { size: '6.5 inch', technology: 'Super AMOLED' },
      weight: '208 g',
    },
  },
  {
    _id: IDS.S24FE,
    name: 'Galaxy S24 FE',
    brand: 'samsung',
    price: 17_490_000,
    inStock: 5,
    isActive: true,
    specs: {
      memory: { ram: '8 GB', storage: '256 GB' },
      colors: ['Graphite'],
      camera: { rear: { primary: '50 MP', secondary: '12 MP', tertiary: '8 MP' }, front: '10 MP', features: ['OIS', 'Night mode', '4K video'] },
      battery: { capacity: '4700 mAh', charging: { wired: '25W' } },
      processor: { chipset: 'Exynos 2400', cpu: '10-core', gpu: 'Xclipse 940' },
      screen: { size: '6.7 inch', technology: 'Dynamic AMOLED 2X 120Hz' },
      weight: '210 g',
    },
  },
];

const BRAND_INDEX = { samsung: 0, apple: 1, xiaomi: 2, oneplus: 3, google: 4, oppo: 5 };

function chipsetTier(chip) {
  const c = String(chip || '');
  if (/(Snapdragon 8|Dimensity 9300|A17|A18|A16|Tensor G4|Exynos 2400)/.test(c)) return 1;
  if (/(Exynos|Dimensity|A15|Snapdragon 7|Helio|Tensor)/.test(c)) return 0.5;
  return 0.1;
}

/**
 * Deterministic, spec-derived embedding (1536 dims, ~17 meaningful dims).
 * Products with similar brand/price/camera/battery/performance/compactness
 * land close together under cosine similarity.
 */
function buildEmbedding(p) {
  const v = new Array(1536).fill(0);
  const specs = p.specs || {};

  v[BRAND_INDEX[String(p.brand || '').toLowerCase()]] = 0.5;

  const priceLog = Math.log10(Math.max(1, p.price || 1));
  v[6] = (priceLog - 5.5) / 2.2;

  const cam = specs.camera || {};
  const primaryMP = parseFloat((cam.rear && cam.rear.primary) || '0') || 0;
  const frontMP = parseFloat(cam.front || '0') || 0;
  const camFeatures = Array.isArray(cam.features) ? cam.features.length : 0;
  v[7] = Math.min(primaryMP, 100) / 100;
  v[8] = Math.min(camFeatures, 8) / 8;
  v[9] = Math.min(frontMP, 50) / 50;

  const bat = specs.battery || {};
  const mAh = parseInt(String((bat.capacity || '0')).replace(/\D/g, ''), 10) || 0;
  const wiredW = parseInt(String((bat.charging && bat.charging.wired) || '0').replace(/\D/g, ''), 10) || 0;
  v[10] = Math.min(mAh, 6000) / 6000;
  v[11] = Math.min(wiredW, 120) / 120;

  const mem = specs.memory || {};
  const ramGB = parseInt(String(mem.ram || '0'), 10) || 0;
  const storageGB = parseInt(String(mem.storage || '0'), 10) || 0;
  v[12] = Math.min(ramGB, 16) / 16;
  v[13] = Math.min(storageGB, 512) / 512;
  v[14] = chipsetTier((specs.processor && specs.processor.chipset) || '');

  const screen = specs.screen || {};
  const size = parseFloat(screen.size) || 6.5;
  const weight = parseInt(String(specs.weight || '200').replace(/\D/g, ''), 10) || 200;
  v[15] = Math.max(0, (7.5 - size) / 2.5);
  v[16] = Math.max(0, (250 - weight) / 120);

  return v;
}

function buildCatalog() {
  const base = EVAL_PRODUCTS.map(p => {
    const isActive = p.isActive !== false;
    return {
      ...JSON.parse(JSON.stringify(p)),
      _id: ID_BY_EVAL[p._id] || p._id,
      isActive,
      // Uniform stock for active products so similarity (not stock) drives
      // ranking in the eval; stock filtering is verified separately.
      inStock: isActive && p._id !== 'eval-s4' ? 5 : p.inStock,
    };
  });
  return [...base, ...EXTRA_PRODUCTS].map(p => ({
    ...p,
    embedding_vector: buildEmbedding(p),
  }));
}

function cloneAll(items) {
  return JSON.parse(JSON.stringify(items));
}

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  na = Math.sqrt(na);
  nb = Math.sqrt(nb);
  if (na === 0 || nb === 0) return 0;
  return dot / (na * nb);
}

function matchesFilter(p, filter) {
  if (!filter) return true;
  if (filter.isActive !== undefined && p.isActive !== filter.isActive) return false;
  if (filter.brand !== undefined && String(p.brand).toLowerCase() !== String(filter.brand).toLowerCase()) return false;
  if (filter.price) {
    if (filter.price.$gte !== undefined && p.price < filter.price.$gte) return false;
    if (filter.price.$lte !== undefined && p.price > filter.price.$lte) return false;
  }
  return true;
}

function matchesMatch(p, match) {
  if (!match) return true;
  if (match._id && match._id.$ne !== undefined && String(p._id) === String(match._id.$ne)) return false;
  if (match.isActive !== undefined && p.isActive !== match.isActive) return false;
  if (match.brand !== undefined && String(p.brand).toLowerCase() !== String(match.brand).toLowerCase()) return false;
  if (match.inStock && match.inStock.$gt !== undefined && !(p.inStock > match.inStock.$gt)) return false;
  if (match.price) {
    if (match.price.$gte !== undefined && p.price < match.price.$gte) return false;
    if (match.price.$lte !== undefined && p.price > match.price.$lte) return false;
  }
  return true;
}

function stableSort(items, sortSpec) {
  const keys = Object.keys(sortSpec || {});
  return items
    .map((it, idx) => ({ it, idx }))
    .sort((a, b) => {
      for (const k of keys) {
        const dir = sortSpec[k] === 1 ? 1 : -1;
        const av = a.it[k] === undefined ? -Infinity : a.it[k];
        const bv = b.it[k] === undefined ? -Infinity : b.it[k];
        if (av !== bv) return (av - bv) * dir;
      }
      return a.idx - b.idx;
    })
    .map(x => x.it);
}

function createRecommendationStore() {
  const canonical = buildCatalog();
  let products = cloneAll(canonical);
  let vectorFailure = false;

  const store = {
    configure({ embedSourceId, embedSource, vectorFailure: failVector }) {
      products = cloneAll(canonical);
      vectorFailure = Boolean(failVector);
      if (embedSourceId && embedSource === false) {
        const p = products.find(x => String(x._id) === String(embedSourceId));
        if (p) delete p.embedding_vector;
      }
    },

    findById(id) {
      const p = products.find(x => String(x._id) === String(id));
      return { lean: async () => (p ? JSON.parse(JSON.stringify(p)) : null) };
    },

    async aggregate(pipeline) {
      if (vectorFailure) {
        const err = new Error('simulated vector search failure');
        err.code = 'SIMULATED_VECTOR_FAILURE';
        throw err;
      }
      let items = cloneAll(products);
      for (const stage of pipeline) {
        if (stage.$vectorSearch) {
          const { queryVector, limit, filter } = stage.$vectorSearch;
          items = items.filter(p => matchesFilter(p, filter));
          items = items
            .filter(p => Array.isArray(p.embedding_vector))
            .map(p => ({ ...p, score: cosine(queryVector, p.embedding_vector) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
        } else if (stage.$match) {
          items = items.filter(p => matchesMatch(p, stage.$match));
        } else if (stage.$sort) {
          items = stableSort(items, stage.$sort);
        } else if (stage.$project) {
          items = items.map(p => {
            const out = { ...p };
            if (stage.$project.embedding_vector === 0) delete out.embedding_vector;
            if (stage.$project.embeddingError === 0) delete out.embeddingError;
            if (stage.$project.score && p.score !== undefined) out.score = p.score;
            return out;
          });
        } else if (stage.$limit) {
          items = items.slice(0, stage.$limit);
        }
      }
      return items;
    },

    find(query) {
      const chain = {};
      let sortSpec = null;
      let limitN = null;
      chain.sort = s => {
        sortSpec = s;
        return chain;
      };
      chain.select = () => chain;
      chain.limit = n => {
        limitN = n;
        return chain;
      };
      chain.lean = async () => {
        let list = products.filter(p => matchesMatch(p, query));
        if (sortSpec) list = stableSort(list, sortSpec);
        if (limitN) list = list.slice(0, limitN);
        return list.map(p => {
          const out = JSON.parse(JSON.stringify(p));
          delete out.embedding_vector;
          delete out.embeddingError;
          return out;
        });
      };
      return chain;
    },
  };

  store.configure({ embedSourceId: null, embedSource: true, vectorFailure: false });
  return store;
}

module.exports = { createRecommendationStore, IDS, buildEmbedding };
