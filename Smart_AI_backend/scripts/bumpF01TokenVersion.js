"use strict";

/**
 * One-off F-01 Wave 1 migration.
 *
 * Wave 1 stops storing raw refresh tokens and adds a single-session
 * `tokenVersion` contract. Every pre-existing access/refresh token must be
 * invalidated exactly once. This script:
 *   - bumps `tokenVersion` for every user that has not been migrated,
 *   - clears all refresh-session fields,
 *   - removes the legacy raw `refreshToken` field,
 *   - writes an idempotency marker so re-running is a no-op.
 *
 * It never runs at application startup and must be run manually by a
 * developer against an approved database.
 *
 * Usage (dry-run is the default and never writes):
 *   node scripts/bumpF01TokenVersion.js
 *   node scripts/bumpF01TokenVersion.js --dry-run
 *   node scripts/bumpF01TokenVersion.js --apply
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');
const User = require('../models/User');

const MARKER = 'f01-token-version-bump';
const MARKER_FIELD = 'f01TokenVersionBumpMarker';
const BUMPED_AT_FIELD = 'f01TokenVersionBumpedAt';

function buildFilter() {
  return { [MARKER_FIELD]: { $ne: MARKER } };
}

function buildUpdate(now = new Date()) {
  return {
    $inc: { tokenVersion: 1 },
    $set: {
      [MARKER_FIELD]: MARKER,
      [BUMPED_AT_FIELD]: now,
      refreshTokenHash: null,
      refreshTokenPrevHash: null,
      refreshTokenSessionId: null,
      refreshTokenRotatedAt: null,
    },
    $unset: { refreshToken: '' },
  };
}

/**
 * Pure planning helper (no I/O) so tests can verify the exact update/filter
 * without a MongoDB connection.
 */
function planBump({ dryRun = true, now = new Date() } = {}) {
  return {
    marker: MARKER,
    dryRun: !!dryRun,
    filter: buildFilter(),
    update: buildUpdate(now),
  };
}

function parseArgs(argv = []) {
  const args = argv.slice(2);
  const hasApply = args.includes('--apply');
  const hasDryRun = args.includes('--dry-run');
  const unknown = args.filter((arg) => arg !== '--apply' && arg !== '--dry-run');

  if (hasApply && hasDryRun) {
    throw new Error('Use either --dry-run or --apply, not both');
  }

  if (unknown.length > 0) {
    throw new Error(`Unknown argument(s): ${unknown.join(', ')}`);
  }

  return { dryRun: !hasApply };
}

/**
 * Dry-run counts candidates without writing. Apply uses the same marker filter
 * so concurrent/repeated runs cannot bump a user twice.
 */
async function runBump({ model = User, dryRun = true, now = new Date() } = {}) {
  const filter = buildFilter();
  const candidates = await model.countDocuments(filter);

  if (dryRun) {
    return {
      marker: MARKER,
      dryRun: true,
      candidates,
      matched: 0,
      modified: 0,
    };
  }

  const result = await model.updateMany(filter, buildUpdate(now));
  const matched = result && (result.matchedCount ?? result.n ?? 0);
  const modified = result && (result.modifiedCount ?? result.nModified ?? 0);

  return {
    marker: MARKER,
    dryRun: false,
    candidates,
    matched,
    modified,
  };
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv);
  } catch (err) {
    logger.error({ err: err.message }, 'Invalid migration arguments');
    process.exitCode = 1;
    return;
  }

  const connectionString = process.env.MONGO_CONNECTION_STRING;
  if (!connectionString) {
    logger.error('MONGO_CONNECTION_STRING is not set');
    process.exitCode = 1;
    return;
  }

  try {
    await mongoose.connect(connectionString, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
  } catch (err) {
    logger.error({ err: err.message }, 'MongoDB connection failed');
    process.exitCode = 1;
    return;
  }

  logger.info(
    options.dryRun
      ? 'Connected to MongoDB — DRY RUN (no writes)'
      : 'Connected to MongoDB — APPLY (writes enabled)',
  );

  try {
    const result = await runBump({ dryRun: options.dryRun });
    logger.info(result, 'F-01 tokenVersion migration result');

    if (!options.dryRun) {
      logger.info(
        'Migration applied. Existing browser sessions must sign in again; cookies were not modified.',
      );
    }
  } catch (err) {
    logger.error({ err: err.message }, 'F-01 tokenVersion migration failed');
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected');
  }
}

module.exports = {
  MARKER,
  MARKER_FIELD,
  BUMPED_AT_FIELD,
  buildFilter,
  buildUpdate,
  planBump,
  parseArgs,
  runBump,
  main,
};

if (require.main === module) {
  main().catch((err) => {
    logger.error({ err: err.message }, 'F-01 tokenVersion migration failed');
    process.exitCode = 1;
  });
}
