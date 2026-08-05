require('dotenv').config();

const mongoose = require('mongoose');
const logger = require('../utils/logger');

const COLLECTION = 'conversations';
const TARGET_INDEX_NAME = 'userId_1_sessionId_1';
const TARGET_INDEX_KEYS = { userId: 1, sessionId: 1 };
const LEGACY_INDEX_NAME = 'sessionId_1';

function findIndexByName(indexes, name) {
  return (indexes || []).find((idx) => idx && idx.name === name) || null;
}

function keysEqual(actual, expected) {
  if (!actual || !expected) return false;
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  if (actualKeys.length !== expectedKeys.length) return false;
  return expectedKeys.every((key) => actual[key] === expected[key]);
}

function targetIndexState(indexes) {
  const index = findIndexByName(indexes, TARGET_INDEX_NAME);
  return {
    present: !!index,
    unique: !!(index && index.unique === true),
    hasCorrectKeys: !!(index && keysEqual(index.key, TARGET_INDEX_KEYS)),
  };
}

function legacyIndexPresent(indexes) {
  return !!findIndexByName(indexes, LEGACY_INDEX_NAME);
}

// Pure planning / validation helper. No I/O — unit-testable without MongoDB.
function planIndexMigration({ indexes = [], duplicateCount = 0, legacyDocCount = 0, dryRun = false } = {}) {
  const target = targetIndexState(indexes);
  const legacyPresent = legacyIndexPresent(indexes);
  const actions = [];

  if (duplicateCount > 0) {
    return {
      status: 'blocked',
      reason: `${duplicateCount} duplicate (userId, sessionId) pair(s) detected; refusing to change any index`,
      dryRun,
      targetIndexPresent: target.present,
      targetIsUnique: target.unique,
      hasCorrectKeys: target.hasCorrectKeys,
      legacyIndexPresent: legacyPresent,
      duplicateCount,
      legacyDocCount,
      actions,
    };
  }

  if (target.present && !target.unique) {
    return {
      status: 'blocked',
      reason: `target index ${TARGET_INDEX_NAME} exists but is not unique; cannot guarantee ownership`,
      dryRun,
      targetIndexPresent: target.present,
      targetIsUnique: target.unique,
      hasCorrectKeys: target.hasCorrectKeys,
      legacyIndexPresent: legacyPresent,
      duplicateCount,
      legacyDocCount,
      actions,
    };
  }

  if (target.present && target.unique) {
    if (legacyPresent) {
      actions.push({ action: 'drop', index: LEGACY_INDEX_NAME });
      return {
        status: 'drop-only',
        reason: `target unique index present; dropping legacy ${LEGACY_INDEX_NAME}`,
        dryRun,
        targetIndexPresent: true,
        targetIsUnique: true,
        hasCorrectKeys: target.hasCorrectKeys,
        legacyIndexPresent: true,
        duplicateCount,
        legacyDocCount,
        actions,
      };
    }
    return {
      status: 'already-migrated',
      reason: 'target unique index present and legacy index absent; nothing to do',
      dryRun,
      targetIndexPresent: true,
      targetIsUnique: true,
      hasCorrectKeys: target.hasCorrectKeys,
      legacyIndexPresent: false,
      duplicateCount,
      legacyDocCount,
      actions,
    };
  }

  // Target index absent: build it (unique), then drop legacy if present.
  actions.push({ action: 'create', index: TARGET_INDEX_NAME, keys: TARGET_INDEX_KEYS, options: { unique: true, name: TARGET_INDEX_NAME } });
  if (legacyPresent) {
    actions.push({ action: 'drop', index: LEGACY_INDEX_NAME });
  }
  return {
    status: 'migrate',
    reason: legacyPresent
      ? `create unique ${TARGET_INDEX_NAME}, then drop legacy ${LEGACY_INDEX_NAME}`
      : `create unique ${TARGET_INDEX_NAME}`,
    dryRun,
    targetIndexPresent: target.present,
    targetIsUnique: target.unique,
    hasCorrectKeys: target.hasCorrectKeys,
    legacyIndexPresent: legacyPresent,
    duplicateCount,
    legacyDocCount,
    actions,
  };
}

async function collectMigrationInfo(db) {
  const indexes = await db.collection(COLLECTION).indexes();
  const duplicatePairs = await db.collection(COLLECTION).aggregate([
    { $match: { userId: { $exists: true }, sessionId: { $exists: true } } },
    { $group: { _id: { userId: '$userId', sessionId: '$sessionId' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]).toArray();
  const duplicateCount = duplicatePairs.length;
  const legacyDocCount = await db.collection(COLLECTION).countDocuments({ userId: { $exists: false } });
  return { indexes, duplicatePairs, duplicateCount, legacyDocCount };
}

async function runMigration(db, opts = {}) {
  const dryRun = !!opts.dryRun;
  const info = await collectMigrationInfo(db);
  const plan = planIndexMigration({
    indexes: info.indexes,
    duplicateCount: info.duplicateCount,
    legacyDocCount: info.legacyDocCount,
    dryRun,
  });

  for (const pair of info.duplicatePairs) {
    logger.warn({ userId: pair._id.userId, sessionId: pair._id.sessionId, occurrences: pair.count }, 'Duplicate (userId, sessionId) pair');
  }
  logger.info({ ...plan, mode: dryRun ? 'dry-run' : 'live' }, 'Planned index migration');

  if (dryRun || plan.status === 'blocked' || plan.status === 'already-migrated') {
    return plan;
  }

  const collection = db.collection(COLLECTION);

  const createActions = plan.actions.filter((a) => a.action === 'create');
  for (const action of createActions) {
    try {
      await collection.createIndex(action.keys, action.options);
      logger.info({ index: action.index }, 'Created unique compound index');
    } catch (err) {
      logger.error({ err: err.message, index: action.index }, 'Failed to create target index; legacy index left untouched');
      return { ...plan, status: 'failed', stage: 'create', reason: err.message };
    }
  }

  // Verify the target index is present and unique BEFORE dropping the legacy one.
  const afterCreateIndexes = await collection.indexes();
  const afterCreateTarget = targetIndexState(afterCreateIndexes);
  if (!afterCreateTarget.present || !afterCreateTarget.unique || !afterCreateTarget.hasCorrectKeys) {
    logger.error({ index: TARGET_INDEX_NAME }, 'Target index verification failed; legacy index left untouched');
    return { ...plan, status: 'failed', stage: 'verify-after-create', reason: 'target index missing, non-unique, or wrong keys' };
  }

  const dropActions = plan.actions.filter((a) => a.action === 'drop');
  for (const action of dropActions) {
    try {
      await collection.dropIndex(action.index);
      logger.info({ index: action.index }, 'Dropped legacy index');
    } catch (err) {
      logger.error({ err: err.message, index: action.index }, 'Failed to drop legacy index; target index remains');
      return { ...plan, status: 'failed', stage: 'drop', reason: err.message };
    }
  }

  // Final-state verification: target present+unique, legacy gone.
  const finalIndexes = await collection.indexes();
  const finalTarget = targetIndexState(finalIndexes);
  const finalLegacy = legacyIndexPresent(finalIndexes);
  if (finalTarget.present && finalTarget.unique && finalTarget.hasCorrectKeys && !finalLegacy) {
    logger.info({ index: TARGET_INDEX_NAME }, 'Migration complete: target unique index in place, legacy index removed');
    return { ...plan, status: 'migrated', stage: 'complete' };
  }
  logger.error({ index: TARGET_INDEX_NAME, legacyPresent: finalLegacy }, 'Final-state verification failed');
  return { ...plan, status: 'failed', stage: 'final-verify', reason: 'final index state does not match expectation' };
}

async function main() {
  const dryRun = process.argv.slice(2).includes('--dry-run');
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
  logger.info(dryRun ? 'Connected to MongoDB — DRY RUN' : 'Connected to MongoDB — LIVE RUN');

  try {
    const result = await runMigration(mongoose.connection.db, { dryRun });
    logger.info({ status: result.status, reason: result.reason, legacyDocCount: result.legacyDocCount, duplicateCount: result.duplicateCount }, 'Migration completed');

    if (dryRun || result.status === 'migrated' || result.status === 'already-migrated') {
      process.exitCode = 0;
    } else {
      process.exitCode = 1;
    }
  } catch (err) {
    logger.error({ err: err.message }, 'Migration failed');
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected');
  }
}

module.exports = {
  COLLECTION,
  TARGET_INDEX_NAME,
  TARGET_INDEX_KEYS,
  LEGACY_INDEX_NAME,
  findIndexByName,
  keysEqual,
  targetIndexState,
  legacyIndexPresent,
  planIndexMigration,
  runMigration,
  main,
};

if (require.main === module) {
  main().catch((err) => {
    logger.error({ err: err.message }, 'Migration failed');
    process.exitCode = 1;
  });
}