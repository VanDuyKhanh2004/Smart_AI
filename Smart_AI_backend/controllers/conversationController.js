const Conversation = require('../models/Conversation');
const asyncHandler = require('../utils/asyncHandler');
const { BadRequestError, NotFoundError } = require('../utils/errors');

/**
 * REST read-only history controller for owned conversations.
 *
 * This controller exposes *reading* owned conversation history to the
 * authenticated frontend for reload restoration. It performs NO live chat
 * orchestration (that stays in chatController) and NO writes. Live chat
 * messaging remains Socket.IO-only; there is deliberately no POST /api/chat.
 *
 * Ownership is always the trusted `req.user` (set by `protect`), never a
 * client-supplied `userId`. The conversation's stored `userId` was written by
 * the socket boundary from `socket.data.user.id` (a Mongo ObjectId string),
 * which equals `req.user.id` here, so the two paths share one identity.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const PREVIEW_CHARS = 120;

// Assistant message metadata whitelist for the detail DTO. ipAddress and
// userAgent are deliberately never exposed (they live only on user messages,
// whose metadata is dropped entirely).
const ALLOWED_ASSISTANT_METADATA = [
  'modelUsed',
  'responseType',
  'skipRAG',
  'processingTime',
  'tokensUsed',
  'clarifiedQuery',
  'originalQuery',
];

function parseLimit(raw) {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

/**
 * Cursor is a stable JSON payload base64url-encoded:
 *   { lastMessageAt: ISO, _id: ObjectIdString }
 * Tie-breaking for equal lastMessageAt is by _id descending, so the cursor
 * carries both. Malformed cursors normalize to a fresh first page (never a
 * server error) so reloads stay reliable.
 */
function parseCursor(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    if (parsed && parsed.lastMessageAt && parsed.id) {
      return { lastMessageAt: parsed.lastMessageAt, _id: parsed.id };
    }
  } catch (_err) {
    /* normalize to a fresh page */
  }
  return null;
}

function makeCursor(doc) {
  const payload = JSON.stringify({
    lastMessageAt: new Date(doc.lastMessageAt).toISOString(),
    id: String(doc._id),
  });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

/**
 * Pure, unit-testable pipeline builder. Only owned `active` conversations with
 * at least one message are listed; legacy/unowned and ended/archived docs are
 * excluded. The projection computes a bounded `preview` (last USER message) on
 * the server and never returns the raw `messages[]`.
 */
function buildListPipeline({ userId, cursor, limit }) {
  const match = {
    userId,
    status: 'active',
    messageCount: { $gt: 0 },
  };
  if (cursor) {
    match.$or = [
      { lastMessageAt: { $lt: new Date(cursor.lastMessageAt) } },
      {
        lastMessageAt: new Date(cursor.lastMessageAt),
        _id: { $lt: cursor._id },
      },
    ];
  }
  return [
    { $match: match },
    { $sort: { lastMessageAt: -1, _id: -1 } },
    { $limit: limit + 1 },
    {
      $project: {
        _id: 1,
        sessionId: 1,
        status: 1,
        messageCount: 1,
        lastMessageAt: 1,
        createdAt: 1,
        updatedAt: 1,
        preview: {
          $let: {
            vars: {
              userMessages: {
                $filter: { input: '$messages', as: 'm', cond: { $eq: ['$$m.role', 'user'] } },
              },
            },
            in: { $arrayElemAt: ['$$userMessages', -1] },
          },
        },
      },
    },
  ];
}

function truncatePreview(content) {
  if (typeof content !== 'string') return '';
  const trimmed = content.trim();
  if (trimmed.length <= PREVIEW_CHARS) return trimmed;
  return `${trimmed.slice(0, PREVIEW_CHARS)}…`;
}

function toSummary(doc) {
  const summary = {
    id: String(doc._id),
    sessionId: doc.sessionId,
    status: doc.status,
    messageCount: doc.messageCount,
    lastMessageAt: doc.lastMessageAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
  if (doc.preview && typeof doc.preview === 'object') {
    summary.preview = truncatePreview(doc.preview.content);
  }
  return summary;
}

function toMessage(msg) {
  const out = {
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp,
  };
  if (msg.clientMessageId) out.clientMessageId = msg.clientMessageId;
  if (msg.generationId) out.generationId = msg.generationId;
  if (msg.role === 'assistant' && msg.metadata && typeof msg.metadata === 'object') {
    const meta = {};
    for (const key of ALLOWED_ASSISTANT_METADATA) {
      if (msg.metadata[key] !== undefined) meta[key] = msg.metadata[key];
    }
    if (Object.keys(meta).length > 0) out.metadata = meta;
  }
  return out;
}

function toDetail(conv) {
  return {
    sessionId: conv.sessionId,
    status: conv.status,
    messageCount: conv.messageCount,
    lastMessageAt: conv.lastMessageAt,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    messages: (conv.messages || []).map(toMessage),
  };
}

// GET /api/chat/conversations — owned active summaries, sorted newest first.
const listConversations = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const limit = parseLimit(req.query.limit);
  const cursor = parseCursor(req.query.cursor);
  const pipeline = buildListPipeline({ userId, cursor, limit });
  const rows = await Conversation.aggregate(pipeline);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const lastRaw = page[page.length - 1];
  const nextCursor = hasMore && lastRaw ? makeCursor(lastRaw) : undefined;

  res.status(200).json({
    success: true,
    data: {
      items: page.map(toSummary),
      nextCursor,
    },
  });
});

// GET /api/chat/conversations/:sessionId — owned full conversation detail.
const getConversation = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { sessionId } = req.params;

  if (!UUID_RE.test(sessionId)) {
    throw new BadRequestError('Session ID không hợp lệ', 'INVALID_SESSION');
  }

  const conv = await Conversation.findOne({ userId, sessionId });
  // Generic 404 for both missing and foreign sessions; never reveals whether
  // another user owns the id.
  if (!conv) {
    throw new NotFoundError('Không tìm thấy cuộc trò chuyện', 'CONVERSATION_NOT_FOUND');
  }

  res.status(200).json({
    success: true,
    data: toDetail(conv),
  });
});

module.exports = {
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
};