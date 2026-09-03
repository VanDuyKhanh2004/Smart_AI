/**
 * Shared pagination parser for all paginated endpoints.
 *
 * Normalises page / limit query parameters into safe positive integers and
 * returns the pre-computed `skip` value ready for MongoDB.
 *
 * Design choices:
 *  - MAX_LIMIT = 50 (matches conversationController, productSearchService,
 *    productRecommendationService, and searchSemantic conventions).
 *  - No arbitrary page maximum. The limit cap already prevents DoS; deep
 *    pages with small limits are safe.
 *  - Uses Number() instead of parseInt() so partial parses like "10abc"
 *    are correctly rejected as NaN.
 */

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/**
 * @param {object} query - req.query (or any plain object with string props)
 * @returns {{ page: number, limit: number, skip: number }}
 */
function parsePagination(query = {}) {
  const rawPage = query.page;
  const rawLimit = query.limit;

  const page = parsePage(rawPage);
  const limit = parseLimit(rawLimit);
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

function parsePage(raw) {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_PAGE;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return DEFAULT_PAGE;
  return n;
}

function parseLimit(raw) {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

module.exports = parsePagination;
module.exports.parsePage = parsePage;
module.exports.parseLimit = parseLimit;
module.exports.DEFAULT_PAGE = DEFAULT_PAGE;
module.exports.DEFAULT_LIMIT = DEFAULT_LIMIT;
module.exports.MAX_LIMIT = MAX_LIMIT;
