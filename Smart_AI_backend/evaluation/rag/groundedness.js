/**
 * Conservative, deterministic answer-groundedness checker for the offline RAG
 * evaluation.
 *
 * Verifies that the claims made in an answer are supported by the retrieved
 * product context. No external API is called.
 *
 * Strategy (kept deliberately simple and auditable):
 *   - Split the answer into sentences; each sentence is a claim.
 *   - A claim is CHECKABLE if it names at least one catalog product.
 *   - A claim is SUPPORTED when:
 *       (a) every referenced product is present in the retrieved context, and
 *       (b) every extractable numeric assertion (price / RAM / storage /
 *           battery / camera megapixels) matches that product's catalog data.
 *   - Claims that reference no product (e.g. "Không tìm thấy sản phẩm phù
 *     hợp") are treated as neutral and count as supported.
 *   - Referencing a product that was NOT retrieved is an unsupported claim
 *     (the answer would be grounding on absent context).
 */

function normalizeText(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function tokenizeWords(s) {
  return normalizeText(s).split(/\s+/).filter(Boolean);
}

/**
 * Sentinel used to protect numeric dot groups (thousands separators in
 * Vietnamese prices such as "18.990.000") from being treated as sentence
 * boundaries. A private-use Unicode char is used: it cannot appear in normal
 * assistant output and contains no punctuation.
 */
const NUMERIC_DOT = '\uE000';

/**
 * Replace the dots inside numeric dot groups (e.g. "19.990.000") with the
 * sentinel so the sentence splitter does not break prices into fragments.
 * Matches a 1-3 digit head followed by one or more 3-digit dot groups —
 * the standard Vietnamese price shape — while leaving ".", "!", "?", etc.
 * as real sentence boundaries everywhere else.
 */
function protectNumericDots(text) {
  return String(text || '').replace(
    /(\d{1,3})\.(\d{3}(?:\.\d{3})*)/g,
    (match, head, rest) => `${head}${NUMERIC_DOT}${rest.replace(/\./g, NUMERIC_DOT)}`
  );
}

function splitClaims(answer) {
  const protectedText = protectNumericDots(answer);
  return String(protectedText || '')
    .split(/[.!?。！？\n]+/)
    .map(s => s.trim().replace(/\uE000/g, '.'))
    .filter(Boolean);
}

function numberFromDigits(s) {
  return parseFloat(String(s).replace(/[.,\s]/g, ''));
}

/**
 * Extract numeric assertions from a sentence. Each assertion is
 * { field, value } where field is one of price / ramGB / storageGB / mAh /
 * primaryMP. Values come from Vietnamese surface forms ("18.990.000 đồng",
 * "5000 mAh", "50 MP", "8 GB RAM").
 */
function extractAssertions(sentence) {
  const assertions = [];
  const add = (field, value) => assertions.push({ field, value });

  const priceRe = /(\d{1,3}(?:[.,\s]?\d{3})*)\s*(triệu|trieu|tr|đồng)/gi;
  let m;
  while ((m = priceRe.exec(sentence)) !== null) {
    const value = numberFromDigits(m[1]);
    const unit = String(m[2]).toLowerCase();
    add('price', unit === 'đồng' ? value : value * 1_000_000);
  }

  const ramRe = /(\d+)\s*gb\s*ram|ram\s*(\d+)\s*gb/gi;
  while ((m = ramRe.exec(sentence)) !== null) {
    add('ramGB', parseInt(m[1] !== undefined ? m[1] : m[2], 10));
  }

  const storageRe = /\b(\d{3})\s*gb\b/gi;
  while ((m = storageRe.exec(sentence)) !== null) {
    add('storageGB', parseInt(m[1], 10));
  }

  const batteryRe = /(\d{4,5})\s*mah/gi;
  while ((m = batteryRe.exec(sentence)) !== null) {
    add('mAh', parseInt(m[1], 10));
  }

  const camRe = /(\d{2,3})\s*mp\b/gi;
  while ((m = camRe.exec(sentence)) !== null) {
    add('primaryMP', parseInt(m[1], 10));
  }

  return assertions;
}

function productFieldValue(product, field) {
  const specs = product.specs || {};
  switch (field) {
    case 'price':
      return product.price;
    case 'ramGB':
      return parseInt(String((specs.memory && specs.memory.ram) || '0'), 10) || 0;
    case 'storageGB':
      return parseInt(String((specs.memory && specs.memory.storage) || '0'), 10) || 0;
    case 'mAh':
      return parseInt(String((specs.battery && specs.battery.capacity) || '0').replace(/\D/g, ''), 10) || 0;
    case 'primaryMP': {
      const primary = (specs.camera && specs.camera.rear && specs.camera.rear.primary) || '0';
      return parseFloat(String(primary).replace(/\D/g, '')) || 0;
    }
    default:
      return null;
  }
}

/**
 * Find catalog products referenced by name in a sentence. Matches the product
 * name as a contiguous word sequence; when a shorter name is a prefix of a
 * longer name matched at the same position (e.g. "Galaxy S24" vs
 * "Galaxy S24 FE"), only the longest is kept.
 */
function findProductRefs(sentence, allProducts) {
  const tokens = tokenizeWords(sentence);
  const matches = [];

  for (const p of allProducts) {
    const nameTokens = tokenizeWords(p.name);
    if (nameTokens.length === 0) continue;
    for (let i = 0; i + nameTokens.length <= tokens.length; i += 1) {
      let ok = true;
      for (let j = 0; j < nameTokens.length; j += 1) {
        if (tokens[i + j] !== nameTokens[j]) {
          ok = false;
          break;
        }
      }
      if (ok) {
        matches.push({ product: p, start: i, len: nameTokens.length, nameTokens });
        break;
      }
    }
  }

  return matches
    .filter(m => !matches.some(o =>
      o !== m &&
      o.start === m.start &&
      o.len > m.len &&
      o.nameTokens.slice(0, m.len).join(' ') === m.nameTokens.join(' ')))
    .map(m => m.product);
}

/**
 * Check a single claim (sentence) against the retrieved context.
 * Returns { supported, checkable, reason }.
 */
function checkClaimGrounded(sentence, allProducts, retrievedProducts) {
  const refs = findProductRefs(sentence, allProducts);

  if (refs.length === 0) {
    return { supported: true, checkable: false, reason: 'no_product_reference' };
  }

  for (const ref of refs) {
    if (!retrievedProducts.some(p => String(p._id) === String(ref._id))) {
      return { supported: false, checkable: true, reason: `product_not_retrieved:${ref._id}` };
    }
  }

  const assertions = extractAssertions(sentence);
  for (const ref of refs) {
    for (const a of assertions) {
      const expected = productFieldValue(ref, a.field);
      if (expected !== null && expected !== a.value) {
        return {
          supported: false,
          checkable: true,
          reason: `assertion_mismatch:${ref._id}:${a.field}`,
        };
      }
    }
  }

  return { supported: true, checkable: true };
}

/**
 * Evaluate the groundedness of an answer against the retrieved product context.
 * Returns a report with per-claim results and an overall score in [0, 1].
 */
function evaluateGroundedness({ answer, allProducts, retrievedProducts }) {
  const claims = splitClaims(answer);
  const claimResults = claims.map(sentence => {
    const { supported, checkable, reason } = checkClaimGrounded(sentence, allProducts, retrievedProducts);
    return { claim: sentence, supported, checkable, reason };
  });

  const totalClaims = claimResults.length;
  const supportedClaims = claimResults.filter(r => r.supported).length;
  const checkableClaims = claimResults.filter(r => r.checkable).length;
  const unsupportedClaims = totalClaims - supportedClaims;

  return {
    totalClaims,
    supportedClaims,
    unsupportedClaims,
    checkableClaims,
    score: totalClaims === 0 ? 1 : supportedClaims / totalClaims,
    claims: claimResults,
  };
}

module.exports = {
  normalizeText,
  splitClaims,
  extractAssertions,
  productFieldValue,
  findProductRefs,
  checkClaimGrounded,
  evaluateGroundedness,
};