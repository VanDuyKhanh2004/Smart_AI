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
 *   - writes a per-user audit marker AND a global migration marker so a later
 *     rerun cannot touch users created after the first successful apply.
 *
 * It never runs at application startup and must be run manually by a
 * developer against an approved database.
 *
 * Usage (dry-run is the default and never writes):
 *   node scripts/bumpF01TokenVersion.js
 *   node scripts/bumpF01TokenVersion.js --dry-run
 *   node scripts/bumpF01TokenVersion.js --apply
 */

const crypto = require('crypto');
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const User = require('../models/User');

const MARKER = 'f01-token-version-bump';
const MARKER_FIELD = 'f01TokenVersionBumpMarker';
const BUMPED_AT_FIELD = 'f01TokenVersionBumpedAt';
const MARKER_COLLECTION = 'migrations';
const MARKER_STATUS_RUNNING = 'running';
const MARKER_STATUS_COMPLETED = 'completed';

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
 * Global migration marker store backed by a `migrations` collection.
 *
 * `_id` is unique, so `insertOne` is the atomic cross-process claim: exactly
 * one invocation can transition a missing marker to `running`. Concurrent
 * invocations either observe `running` (and abort) or `completed` (and no-op).
 */
function createMongoMarkerStore(connection = mongoose.connection) {
  const collection = connection.collection(MARKER_COLLECTION);

  return {
    async claim({ marker, runId, now }) {
      try {
        await collection.insertOne({
          _id: marker,
          marker,
          status: MARKER_STATUS_RUNNING,
          runId,
          startedAt: now,
        });
        return { claimed: true, status: MARKER_STATUS_RUNNING };
      } catch (err) {
        if (!err || err.code !== 11000) {
          throw err;
        }

        const existing = await collection.findOne({ _id: marker });
        return {
          claimed: false,
          status: existing ? existing.status : 'unknown',
        };
      }
    },

    async complete({ marker, runId, now }) {
      const result = await collection.updateOne(
        { _id: marker, runId, status: MARKER_STATUS_RUNNING },
        { $set: { status: MARKER_STATUS_COMPLETED, completedAt: now } },
      );

      const modified = result && (result.modifiedCount ?? result.nModified ?? 0);
      return modified === 1;
    },

    async getStatus({ marker }) {
      const existing = await collection.findOne({ _id: marker });
      return existing ? existing.status : null;
    },
  };
}

/**
 * Dry-run counts candidates without writing and reads (never creates) the
 * global marker. Apply claims the global marker atomically before touching
 * users; a completed marker makes every later run a no-op, including for users
 * created after the first migration.
 */
async function runBump({
  model = User,
  markers = createMongoMarkerStore(),
  dryRun = true,
  now = new Date(),
  runId = crypto.randomUUID(),
} = {}) {
  const filter = buildFilter();

  if (dryRun) {
    const status = await markers.getStatus({ marker: MARKER });
    const candidates = await model.countDocuments(filter);

    return {
      marker: MARKER,
      dryRun: true,
      alreadyApplied: status === MARKER_STATUS_COMPLETED,
      candidates,
      matched: 0,
      modified: 0,
    };
  }

  const claim = await markers.claim({ marker: MARKER, runId, now });

  if (!claim.claimed) {
    if (claim.status === MARKER_STATUS_RUNNING) {
      throw new Error(
        'F-01 migration is already running in another invocation; refusing to write',
      );
    }

    return {
      marker: MARKER,
      dryRun: false,
      alreadyApplied: true,
      candidates: 0,
      matched: 0,
      modified: 0,
    };
  }

  const result = await model.updateMany(filter, buildUpdate(now));
  const matched = result && (result.matchedCount ?? result.n ?? 0);
  const modified = result && (result.modifiedCount ?? result.nModified ?? 0);

  const completed = await markers.complete({ marker: MARKER, runId, now });
  if (!completed) {
    throw new Error(
      'F-01 migration marker could not be completed; inspect the migrations collection before rerunning',
    );
  }

  return {
    marker: MARKER,
    dryRun: false,
    alreadyApplied: false,
    candidates: matched,
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

    if (!options.dryRun && result.alreadyApplied) {
      logger.info('Migration already applied; no users were modified.');
    } else if (!options.dryRun) {
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
  MARKER_COLLECTION,
  MARKER_STATUS_RUNNING,
  MARKER_STATUS_COMPLETED,
  buildFilter,
  buildUpdate,
  planBump,
  parseArgs,
  createMongoMarkerStore,
  runBump,
  main,
};

if (require.main === module) {
  main().catch((err) => {
    logger.error({ err: err.message }, 'F-01 tokenVersion migration failed');
    process.exitCode = 1;
  });
}
