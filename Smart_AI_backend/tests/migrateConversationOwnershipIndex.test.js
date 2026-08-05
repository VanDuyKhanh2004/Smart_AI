process.env.LOG_LEVEL = 'silent';

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

const mockMongoose = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  connection: { db: null },
};
jest.mock('mongoose', () => mockMongoose);

const {
  planIndexMigration,
  runMigration,
  main,
  TARGET_INDEX_NAME,
  LEGACY_INDEX_NAME,
} = require('../scripts/migrateConversationOwnershipIndex');

const baseIndexes = [{ v: 2, key: { _id: 1 }, name: '_id_' }];
const legacyIndex = { v: 2, key: { sessionId: 1 }, name: LEGACY_INDEX_NAME, unique: true };
const targetUnique = { v: 2, key: { userId: 1, sessionId: 1 }, name: TARGET_INDEX_NAME, unique: true };
const targetNonUnique = { v: 2, key: { userId: 1, sessionId: 1 }, name: TARGET_INDEX_NAME, unique: false };

function buildIndexedDb(initialIndexes, overrides = {}) {
  const state = initialIndexes.slice();
  const collection = {
    indexes: jest.fn(overrides.indexes || (async () => state.slice())),
    createIndex: jest.fn(overrides.createIndex || (async (keys, options) => {
      state.push({ v: 2, key: keys, name: options.name, unique: options.unique === true });
    })),
    dropIndex: jest.fn(overrides.dropIndex || (async (name) => {
      const pos = state.findIndex((idx) => idx.name === name);
      if (pos === -1) throw new Error(`index ${name} does not exist`);
      state.splice(pos, 1);
    })),
    aggregate: jest.fn(overrides.aggregate || (() => ({ toArray: jest.fn(async () => []) }))),
    countDocuments: jest.fn(overrides.countDocuments || (async () => 0)),
  };
  const db = { collection: jest.fn(() => collection) };
  return { db, collection, getState: () => state.slice() };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.exitCode = 0;
  delete process.env.MONGO_CONNECTION_STRING;
  mockMongoose.connect.mockReset();
  mockMongoose.disconnect.mockReset();
  mockMongoose.connection.db = null;
});

describe('planIndexMigration (pure planning)', () => {
  test('legacy-only indexes produce migrate plan: create target then drop legacy', () => {
    const plan = planIndexMigration({
      indexes: [...baseIndexes, legacyIndex],
      duplicateCount: 0,
      legacyDocCount: 0,
    });
    expect(plan.status).toBe('migrate');
    expect(plan.actions).toEqual([
      { action: 'create', index: TARGET_INDEX_NAME, keys: { userId: 1, sessionId: 1 }, options: { unique: true, name: TARGET_INDEX_NAME } },
      { action: 'drop', index: LEGACY_INDEX_NAME },
    ]);
  });

  test('target unique index already exists -> drop-only, no create action', () => {
    const plan = planIndexMigration({
      indexes: [...baseIndexes, targetUnique, legacyIndex],
      duplicateCount: 0,
      legacyDocCount: 0,
    });
    expect(plan.status).toBe('drop-only');
    expect(plan.actions.map((a) => a.action)).toEqual(['drop']);
    expect(plan.actions[0].index).toBe(LEGACY_INDEX_NAME);
  });

  test('already migrated (target unique, no legacy) -> already-migrated no-op', () => {
    const plan = planIndexMigration({
      indexes: [...baseIndexes, targetUnique],
      duplicateCount: 0,
      legacyDocCount: 0,
    });
    expect(plan.status).toBe('already-migrated');
    expect(plan.actions).toEqual([]);
  });

  test('duplicate pairs -> blocked with no actions', () => {
    const plan = planIndexMigration({
      indexes: [...baseIndexes, legacyIndex],
      duplicateCount: 2,
      legacyDocCount: 3,
    });
    expect(plan.status).toBe('blocked');
    expect(plan.actions).toEqual([]);
    expect(plan.duplicateCount).toBe(2);
    expect(plan.legacyDocCount).toBe(3);
  });

  test('target index present but not unique -> blocked', () => {
    const plan = planIndexMigration({
      indexes: [...baseIndexes, targetNonUnique],
      duplicateCount: 0,
      legacyDocCount: 0,
    });
    expect(plan.status).toBe('blocked');
    expect(plan.actions).toEqual([]);
  });
});

describe('runMigration (orchestration, dry-run and failures)', () => {
  test('legacy-only live run: create target, then drop legacy, final state verified', async () => {
    const { db, collection, getState } = buildIndexedDb([...baseIndexes, legacyIndex]);
    const result = await runMigration(db, { dryRun: false });
    expect(result.status).toBe('migrated');
    expect(collection.createIndex).toHaveBeenCalledTimes(1);
    expect(collection.createIndex).toHaveBeenCalledWith(
      { userId: 1, sessionId: 1 },
      { unique: true, name: TARGET_INDEX_NAME },
    );
    expect(collection.dropIndex).toHaveBeenCalledTimes(1);
    expect(collection.dropIndex).toHaveBeenCalledWith(LEGACY_INDEX_NAME);
    const names = getState().map((idx) => idx.name);
    expect(names).toContain(TARGET_INDEX_NAME);
    expect(names).not.toContain(LEGACY_INDEX_NAME);
  });

  test('target unique present with legacy -> only drops legacy, no create', async () => {
    const { db, collection, getState } = buildIndexedDb([...baseIndexes, targetUnique, legacyIndex]);
    const result = await runMigration(db, { dryRun: false });
    expect(result.status).toBe('migrated');
    expect(collection.createIndex).not.toHaveBeenCalled();
    expect(collection.dropIndex).toHaveBeenCalledTimes(1);
    expect(collection.dropIndex).toHaveBeenCalledWith(LEGACY_INDEX_NAME);
    expect(getState().map((idx) => idx.name)).not.toContain(LEGACY_INDEX_NAME);
  });

  test('already migrated -> no create or drop', async () => {
    const { db, collection, getState } = buildIndexedDb([...baseIndexes, targetUnique]);
    const result = await runMigration(db, { dryRun: false });
    expect(result.status).toBe('already-migrated');
    expect(collection.createIndex).not.toHaveBeenCalled();
    expect(collection.dropIndex).not.toHaveBeenCalled();
    expect(getState().map((idx) => idx.name)).toContain(TARGET_INDEX_NAME);
  });

  test('dry-run performs no create/drop', async () => {
    const { db, collection, getState } = buildIndexedDb([...baseIndexes, legacyIndex]);
    const result = await runMigration(db, { dryRun: true });
    expect(result.status).toBe('migrate');
    expect(collection.createIndex).not.toHaveBeenCalled();
    expect(collection.dropIndex).not.toHaveBeenCalled();
    expect(getState().map((idx) => idx.name)).toContain(LEGACY_INDEX_NAME);
  });

  test('duplicate pairs -> blocked, no create/drop, legacy untouched', async () => {
    const { db, collection, getState } = buildIndexedDb([...baseIndexes, legacyIndex], {
      aggregate: () => ({
        toArray: async () => [
          { _id: { userId: 'user-1', sessionId: 'session-1' }, count: 2 },
          { _id: { userId: 'user-2', sessionId: 'session-1' }, count: 3 },
        ],
      }),
    });
    const result = await runMigration(db, { dryRun: false });
    expect(result.status).toBe('blocked');
    expect(result.duplicateCount).toBe(2);
    expect(collection.createIndex).not.toHaveBeenCalled();
    expect(collection.dropIndex).not.toHaveBeenCalled();
    expect(getState().map((idx) => idx.name)).toContain(LEGACY_INDEX_NAME);
  });

  test('legacy docs reported but documents never written', async () => {
    const { db, collection } = buildIndexedDb([...baseIndexes, legacyIndex], {
      countDocuments: async () => 7,
    });
    const result = await runMigration(db, { dryRun: true });
    expect(result.legacyDocCount).toBe(7);
    expect(collection.countDocuments).toHaveBeenCalledWith({ userId: { $exists: false } });
    expect(collection.createIndex).not.toHaveBeenCalled();
    expect(collection.dropIndex).not.toHaveBeenCalled();
  });

  test('create-target failure -> legacy left untouched, reported as failed', async () => {
    const { db, collection, getState } = buildIndexedDb([...baseIndexes, legacyIndex], {
      createIndex: async () => { throw new Error('E11000 duplicate key error'); },
    });
    const result = await runMigration(db, { dryRun: false });
    expect(result.status).toBe('failed');
    expect(result.stage).toBe('create');
    expect(collection.dropIndex).not.toHaveBeenCalled();
    expect(getState().map((idx) => idx.name)).toContain(LEGACY_INDEX_NAME);
  });

  test('verification-after-create failure -> legacy, drop never called', async () => {
    const { db, collection, getState } = buildIndexedDb([...baseIndexes, legacyIndex], {
      indexes: async () => [...baseIndexes, legacyIndex],
    });
    const result = await runMigration(db, { dryRun: false });
    expect(result.status).toBe('failed');
    expect(result.stage).toBe('verify-after-create');
    expect(collection.createIndex).toHaveBeenCalledTimes(1);
    expect(collection.dropIndex).not.toHaveBeenCalled();
    expect(getState().map((idx) => idx.name)).toContain(LEGACY_INDEX_NAME);
  });

  test('drop-legacy failure -> reported failed, target remaining, legacy present', async () => {
    const { db, collection, getState } = buildIndexedDb([...baseIndexes, legacyIndex], {
      dropIndex: async () => { throw new Error('index not found'); },
    });
    const result = await runMigration(db, { dryRun: false });
    expect(result.status).toBe('failed');
    expect(result.stage).toBe('drop');
    expect(collection.createIndex).toHaveBeenCalledTimes(1);
    expect(collection.dropIndex).toHaveBeenCalledTimes(1);
    expect(getState().map((idx) => idx.name)).toContain(LEGACY_INDEX_NAME);
  });

  test('final-state verification failure (legacy not actually removed) -> reported failed', async () => {
    const { db, collection } = buildIndexedDb([...baseIndexes, legacyIndex], {
      dropIndex: async () => {}, // resolves but does not remove
    });
    const result = await runMigration(db, { dryRun: false });
    expect(result.status).toBe('failed');
    expect(result.stage).toBe('final-verify');
    expect(collection.dropIndex).toHaveBeenCalledTimes(1);
  });
});

describe('main (connect / disconnect / exit codes)', () => {
  test('live migrate success -> exit 0 and clean disconnect', async () => {
    process.env.MONGO_CONNECTION_STRING = 'mongodb://test';
    mockMongoose.connect.mockResolvedValue();
    const { db, collection } = buildIndexedDb([...baseIndexes, legacyIndex]);
    mockMongoose.connection.db = db;
    await main();
    expect(mockMongoose.connect).toHaveBeenCalled();
    expect(mockMongoose.disconnect).toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
    expect(collection.createIndex).toHaveBeenCalled();
    expect(collection.dropIndex).toHaveBeenCalled();
  });

  test('connect failure -> exit 1, no disconnect', async () => {
    process.env.MONGO_CONNECTION_STRING = 'mongodb://test';
    mockMongoose.connect.mockRejectedValue(new Error('connect failed'));
    await main();
    expect(process.exitCode).toBe(1);
    expect(mockMongoose.disconnect).not.toHaveBeenCalled();
  });

  test('missing MONGO_CONNECTION_STRING -> exit 1, no connect/disconnect', async () => {
    delete process.env.MONGO_CONNECTION_STRING;
    await main();
    expect(process.exitCode).toBe(1);
    expect(mockMongoose.connect).not.toHaveBeenCalled();
    expect(mockMongoose.disconnect).not.toHaveBeenCalled();
  });

  test('runMigration error during live run -> exit 1 and clean disconnect in finally', async () => {
    process.env.MONGO_CONNECTION_STRING = 'mongodb://test';
    mockMongoose.connect.mockResolvedValue();
    mockMongoose.connection.db = { collection: () => ({ indexes: async () => { throw new Error('boom'); } }) };
    await main();
    expect(mockMongoose.disconnect).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});