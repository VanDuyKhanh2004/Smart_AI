/* ------------------------------------------------------------------ */
/*  Conversation history REST endpoints (PR1 reload restoration)       */
/*                                                                     */
/*  Verifies the read-only owned-history behavior of:                  */
/*     GET /api/chat/conversations                                     */
/*     GET /api/chat/conversations/:sessionId                          */
/*                                                                     */
/*  No real MongoDB, Redis, or LLM calls are made.                     */
/* ------------------------------------------------------------------ */

const mockAggregate = jest.fn();
const mockFindOne = jest.fn();

jest.mock('../models/Conversation', () => ({
  aggregate: (...args) => mockAggregate(...args),
  findOne: (...args) => mockFindOne(...args),
}));

const {
  listConversations,
  getConversation,
  buildListPipeline,
  parseLimit,
  parseCursor,
  makeCursor,
  toSummary,
  toMessage,
  toDetail,
  truncatePreview,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} = require('../controllers/conversationController');

const { BadRequestError, NotFoundError } = require('../utils/errors');

const USER_A = '507f1f77bcf86cd799439011';
const USER_B = '507f1f77bcf86cd799439022';
const VALID = '550e8400-e29b-41d4-a716-446655440000';
const INVALID_SESSION = 'not-a-uuid';

beforeEach(() => {
  jest.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/*  Pure helpers                                                       */
/* ------------------------------------------------------------------ */
describe('parseLimit', () => {
  it('defaults to 20', () => {
    expect(parseLimit(undefined)).toBe(DEFAULT_LIMIT);
    expect(parseLimit(null)).toBe(DEFAULT_LIMIT);
    expect(parseLimit('')).toBe(DEFAULT_LIMIT);
  });

  it('clamps to MAX_LIMIT (50)', () => {
    expect(parseLimit('500')).toBe(MAX_LIMIT);
    expect(parseLimit(999)).toBe(MAX_LIMIT);
  });

  it('falls back to default for non-integers and non-positives', () => {
    expect(parseLimit('abc')).toBe(DEFAULT_LIMIT);
    expect(parseLimit(-3)).toBe(DEFAULT_LIMIT);
    expect(parseLimit(0)).toBe(DEFAULT_LIMIT);
    expect(parseLimit(2.5)).toBe(DEFAULT_LIMIT);
  });
});

describe('parseCursor / makeCursor', () => {
  it('round-trips a valid cursor', () => {
    const doc = { _id: 'abc123', lastMessageAt: new Date('2026-01-01T00:00:00.000Z') };
    const raw = makeCursor(doc);
    const parsed = parseCursor(raw);
    expect(parsed).toEqual({
      lastMessageAt: '2026-01-01T00:00:00.000Z',
      _id: 'abc123',
    });
  });

  it('returns null for malformed cursors instead of throwing', () => {
    expect(parseCursor('not-json@@@')).toBeNull();
    expect(parseCursor('')).toBeNull();
    expect(parseCursor(undefined)).toBeNull();
    expect(parseCursor('eyJmb28iOiJiYXIifQ')).toBeNull(); // JSON without fields
  });
});

describe('truncatePreview', () => {
  it('keeps short strings intact', () => {
    expect(truncatePreview('  hello  ')).toBe('hello');
  });

  it('truncates long strings to 120 chars with ellipsis', () => {
    const long = 'x'.repeat(200);
    const out = truncatePreview(long);
    expect(out.length).toBe(121);
    expect(out.endsWith('…')).toBe(true);
  });

  it('returns empty string for non-string input', () => {
    expect(truncatePreview(undefined)).toBe('');
    expect(truncatePreview(null)).toBe('');
    expect(truncatePreview(123)).toBe('');
  });
});

/* ------------------------------------------------------------------ */
/* Pipeline construction                                               */
/* ------------------------------------------------------------------ */
describe('buildListPipeline', () => {
  it('filters by owned active conversations with messages only', () => {
    const pipeline = buildListPipeline({ userId: USER_A, cursor: null, limit: 20 });
    expect(pipeline[0].$match).toMatchObject({
      userId: USER_A,
      status: 'active',
      messageCount: { $gt: 0 },
    });
  });

  it('sorts newest first and limits by limit+1', () => {
    const pipeline = buildListPipeline({ userId: USER_A, cursor: null, limit: 20 });
    expect(pipeline[1].$sort).toEqual({ lastMessageAt: -1, _id: -1 });
    expect(pipeline[2].$limit).toBe(21);
  });

  it('adds a cursor $or branch when a cursor is provided', () => {
    const cursor = { lastMessageAt: '2026-01-01T00:00:00.000Z', _id: 'abc' };
    const pipeline = buildListPipeline({ userId: USER_A, cursor, limit: 20 });
    expect(pipeline[0].$match.$or).toBeDefined();
    expect(pipeline[0].$match.$or).toHaveLength(2);
  });

  it('projects only summary fields plus preview, never raw messages', () => {
    const pipeline = buildListPipeline({ userId: USER_A, cursor: null, limit: 20 });
    const proj = pipeline[3].$project;
    expect(proj._id).toBe(1);
    expect(proj.sessionId).toBe(1);
    expect(proj.messages).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* DTO mappers                                                         */
/* ------------------------------------------------------------------ */
describe('toSummary', () => {
  it('returns a bounded summary and preview from the last user message', () => {
    const doc = {
      _id: 'c1',
      sessionId: VALID,
      status: 'active',
      messageCount: 2,
      lastMessageAt: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      preview: { role: 'user', content: 'mua iphone' },
    };
    const s = toSummary(doc);
    expect(s.id).toBe('c1');
    expect(s.preview).toBe('mua iphone');
    expect(s.messages).toBeUndefined();
  });

  it('omits preview when aggregation returns nothing useful', () => {
    const s = toSummary({ _id: 'c2', sessionId: VALID, status: 'active', messageCount: 0 });
    expect(s.preview).toBeUndefined();
  });
});

describe('toMessage', () => {
  it('maps baseline fields and optional ids', () => {
    const m = toMessage({ role: 'user', content: 'hi', timestamp: 't1', clientMessageId: 'cm1' });
    expect(m).toMatchObject({ role: 'user', content: 'hi', timestamp: 't1', clientMessageId: 'cm1' });
  });

  it('drops user metadata entirely (never ipAddress/userAgent)', () => {
    const m = toMessage({
      role: 'user',
      content: 'hi',
      timestamp: 't1',
      metadata: { ipAddress: '127.0.0.1', userAgent: 'Mozilla', sessionId: 'legacy' },
    });
    expect(m.metadata).toBeUndefined();
    expect(m.ipAddress).toBeUndefined();
    expect(m.userAgent).toBeUndefined();
  });

  it('whitelists assistant metadata and drops sensitive/debug fields', () => {
    const m = toMessage({
      role: 'assistant',
      content: 'ok',
      timestamp: 't1',
      metadata: {
        modelUsed: 'gemini',
        responseType: 'product_query',
        skipRAG: true,
        debugTrace: 'secret',
        rawPrompt: 'nope',
      },
    });
    expect(m.metadata).toMatchObject({ modelUsed: 'gemini', responseType: 'product_query', skipRAG: true });
    expect(m.metadata.debugTrace).toBeUndefined();
    expect(m.metadata.raw).toBeUndefined();
  });
});

describe('toDetail', () => {
  it('maps messages through toMessage and includes detail metadata', () => {
    const conv = {
      sessionId: VALID,
      status: 'active',
      messageCount: 2,
      lastMessageAt: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      messages: [
        { role: 'user', content: 'hi', timestamp: 't1', metadata: { ipAddress: 'x' } },
        { role: 'assistant', content: 'ok', timestamp: 't2' },
      ],
    };
    const d = toDetail(conv);
    expect(d.messages).toHaveLength(2);
    expect(d.messages[0].metadata).toBeUndefined();
    expect(d.messages[1].role).toBe('assistant');
  });
});

/* ------------------------------------------------------------------ */
/* Controller: listConversations                                       */
/* ------------------------------------------------------------------ */
describe('listConversations', () => {
  function res() {
    const r = { statusCode: 0, body: null };
    return {
      status: function (code) { r.statusCode = code; return this; },
      json: function (body) { r.body = body; return this; },
      __value: r,
    };
  }

  it('returns owned active summaries, sorted newest first, without messages[]', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    mockAggregate.mockResolvedValue([
      { _id: 'c1', sessionId: 'a', status: 'active', messageCount: 2, lastMessageAt: now, preview: { content: 'xin chao' } },
      { _id: 'c2', sessionId: 'b', status: 'active', messageCount: 1, lastMessageAt: new Date('2025-01-01T00:00:00.000Z'), preview: null },
    ]);

    const r = res();
    await listConversations({ user: { id: USER_A }, query: {} }, r);
    expect(r.__value.statusCode).toBe(200);
    const { items, nextCursor } = r.__value.body.data;
    expect(items).toHaveLength(2);
    expect(items[0].preview).toBe('xin chao');
    expect(items[0].messages).toBeUndefined();
    expect(nextCursor).toBeUndefined();
  });

  it('returns nextCursor only when a further page exists', async () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({
      _id: 'c' + i,
      sessionId: 's' + i,
      status: 'active',
      messageCount: 1,
      lastMessageAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
    }));
    mockAggregate.mockResolvedValue(rows);

    const r = res();
    await listConversations({ user: { id: USER_A }, query: {} }, r);
    expect(mockAggregate).toHaveBeenCalled();
    expect(r.__value.body.data.items).toHaveLength(20);
    expect(typeof r.__value.body.data.nextCursor).toBe('string');
  });

  it('passes only owned userId into the query (never a client userId)', async () => {
    mockAggregate.mockResolvedValue([]);
    const r = res();
    await listConversations({ user: { id: USER_A }, query: { userId: USER_B } }, r);
    const pipeline = mockAggregate.mock.calls[0][0];
    expect(String(pipeline[0].$match.userId)).toBe(USER_A);
  });

  it('never returns a client-supplied userId in the response', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    mockAggregate.mockResolvedValue([{ id: 'c1', sessionId: 'a', status: 'active', messageCount: 1, lastMessageAt: now }]);
    const r = res();
    await listConversations({ user: { id: USER_A }, query: {} }, r);
    expect(JSON.stringify(r.__value.body)).not.toContain(USER_A);
    expect(JSON.stringify(r.__value.body)).not.toContain(USER_B);
  });
});

/* ------------------------------------------------------------------ */
/* Controller: getConversation                                         */
/* ------------------------------------------------------------------ */
describe('getConversation', () => {
  function res() {
    const r = { statusCode: 0, body: null };
    return {
      status: function (code) { r.statusCode = code; return this; },
      json: function (body) { r.body = body; return this; },
      __value: r,
    };
  }
  const now = new Date('2026-01-01T00:00:00.000Z');

  it('returns a full owned conversation mapped through the detail DTO', async () => {
    mockFindOne.mockResolvedValue({
      sessionId: VALID,
      status: 'active',
      messageCount: 2,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
      messages: [
        { role: 'user', content: 'hi', timestamp: 't1' },
        { role: 'assistant', content: 'ok', timestamp: 't2', metadata: { modelUsed: 'gemini' } },
      ],
    });
    const r = res();
    await getConversation({ user: { id: USER_A }, params: { sessionId: VALID } }, r);
    expect(r.__value.body.data.messages).toHaveLength(2);
    expect(r.__value.body.data.messages[1].metadata.modelUsed).toBe('gemini');
  });

  it('queries by trusted req.user.id and sessionId together', async () => {
    mockFindOne.mockResolvedValue(null);
    const r = res();
    await expect(
      getConversation({ user: { id: USER_A }, params: { sessionId: VALID } }, r)
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(mockFindOne).toHaveBeenCalledWith({ userId: USER_A, sessionId: VALID });
  });

  it('rejects a malformed sessionId with INVALID_SESSION', async () => {
    const r = res();
    await expect(
      getConversation({ user: { id: USER_A }, params: { sessionId: INVALID_SESSION } }, r)
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_SESSION' });
    expect(mockFindOne).not.toHaveBeenCalled();
  });

  it('returns a generic 404 for both missing and foreign sessions', async () => {
    mockFindOne.mockResolvedValue(null); // missing
    const missing = () =>
      getConversation({ user: { id: USER_A }, params: { sessionId: VALID } }, res());
    mockFindOne.mockResolvedValue(null); // foreign (User B owns it, User A reads)
    const foreign = () =>
      getConversation({ user: { id: USER_A }, params: { sessionId: VALID } }, res());

    const eMissing = await missing().then(() => null).catch((e) => e);
    const eForeign = await foreign().then(() => null).catch((e) => e);
    expect(eMissing).toBeInstanceOf(NotFoundError);
    expect(eForeign).toBeInstanceOf(NotFoundError);
    expect(JSON.stringify(eMissing.message)).toBe(JSON.stringify(eForeign.message));
    expect(eMissing.code).toBe('CONVERSATION_NOT_FOUND');
  });
});

/* ------------------------------------------------------------------ */
/* Secret-safety / shape sanity                                        */
/* ------------------------------------------------------------------ */
describe('history DTO shape guard', () => {
  it('listConversations response never contains messages[], ipAddress, or userAgent keys', async () => {
    mockAggregate.mockResolvedValue([{ id: 'c1', sessionId: 'a', status: 'active', messageCount: 1 }]);
    const r = { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await listConversations({ user: { id: USER_A }, query: {} }, r);
    const raw = JSON.stringify(r.body);
    expect(raw).not.toContain('"messages"');
    expect(raw).not.toContain('ipAddress');
    expect(raw).not.toContain('userAgent');
  });

  it('getConversation detail strips sensitive metadata from messages', async () => {
    const conv = {
      sessionId: VALID,
      status: 'active',
      messageCount: 1,
      lastMessageAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      messages: [{ role: 'user', content: 'hi', timestamp: 't', metadata: { ipAddress: '127.0.0.1', userAgent: 'x', userId: USER_A } }],
    };
    const d = toDetail(conv);
    const raw = JSON.stringify(d);
    expect(raw).not.toContain('ipAddress');
    expect(raw).not.toContain('userAgent');
    expect(raw).not.toContain(USER_A);
  });
});
