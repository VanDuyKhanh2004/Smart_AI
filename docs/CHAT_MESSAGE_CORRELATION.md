# Chat Message Correlation — Design Notes

This document describes the client-generated message correlation flow added to
the Smart AI chat. It is a **design/contracts** reference; implementation lives
in the `Smart_AI_backend` and `Smart_AI_frontend` source trees.

## 1. The `clientMessageId` contract

Every `sendMessage` submission carries a `clientMessageId` (a UUID). The same
id is echoed back on the correlated server events:

| Event              | Payload fields                                                        |
| ------------------ | --------------------------------------------------------------------- |
| `sendMessage`      | `{ sessionId, message, clientMessageId }` (client → server)           |
| ack (sendMessage)  | `{ accepted, duplicate, status, clientMessageId }` (server → client)  |
| `messageProcessing`| `{ sessionId, clientMessageId, status: 'started'\|'completed' }`      |
| `aiResponse`       | `{ sessionId, clientMessageId, message, timestamp, metadata? }`       |
| `error`            | `{ type, message, timestamp, clientMessageId? }` (`clientMessageId` optional) |

Rules:
- Never include **message content** in a correlation id, Redis key, or log line.
- A client-supplied `userId` is **never trusted**; identity always comes from
  `socket.data.user` (set by the auth middleware) and the dedup scope is keyed
  on that trusted `userId + sessionId + clientMessageId`.
- `clientMessageId` is **null-safe** for legacy clients: an omitted id is
  replaced by the server with a generated UUID plus a structured warning, so
  legacy clients keep working. An explicitly supplied but **malformed** id is
  rejected (`status: 'invalid'`).

## 2. Ack behavior

The ack callback is invoked **at most once per emit** (Socket.IO delivers only
the first response). It is a **delivery/dedup receipt**, not a completion signal.
The terminal outcome is signaled by the correlated `aiResponse` / `error` events,
never by the ack.

- accepted first submission — `accepted: true`, `duplicate: false`, `status: 'accepted'`
- duplicate, still processing — `accepted: false`, `duplicate: true`, `status: 'processing'`
- duplicate, already completed — `accepted: false`, `duplicate: true`, `status: 'completed'`, then replays stored `aiResponse`.
- malformed / rejected payload — `accepted: false`, `duplicate: false`, `status: 'invalid'`
- generation failure — the `accepted` ack was already delivered; the failure is
  signaled by **exactly one** correlated terminal `error` event plus a
  `messageProcessing` `'error'` progress signal. No `status: 'error'` ack.

## 3. Event ordering

The server delivers packets in this exact order on the same socket/transport.

Accepted first submission:

1. ack `{ accepted: true, duplicate: false, status: 'accepted', clientMessageId }`
2. `messageProcessing` `{ status: 'started', ... }`
3. `chatController.processMessage` runs (a successful reply arrives via
   `aiResponse` and `messageProcessing` `{ status: 'completed', ... }`)

Completed duplicate:

1. ack `{ accepted: false, duplicate: true, status: 'completed', clientMessageId }`
2. replayed `aiResponse` (the cached payload, echoed exactly once)
3. `chatController.processMessage` is **not** run and nothing is persisted again

Processing duplicate:

1. ack `{ accepted: false, duplicate: true, status: 'processing', clientMessageId }`
2. no `aiResponse` replay, no pipeline execution

Invalid / rejected payload:

1. ack `{ accepted: false, duplicate: false, status: 'invalid', clientMessageId }`
2. socket `error` event (`VALIDATION_ERROR` etc.); `processMessage` never runs

Generation failure:

1. `accepted` ack already delivered (step 1 above)
2. exactly one socket `error` event correlated via `clientMessageId`
3. `messageProcessing` `{ status: 'error', ... }`

The interim "started" state is conveyed by the `messageProcessing` event, not
the ack. A failure produces **exactly one** terminal `error` event, correlated
via its (optional) `clientMessageId`.

## 4. Duplicate-processing guard (Redis)

Redis key (bucket): `chat:message:user:<userId>:<sessionId>:<clientMessageId>`
Value: JSON `{ state: 'processing' | 'completed', payload? }`
TTL: `CHAT_MESSAGE_DEDUP_TTL_SECONDS` (default **1800s**).

State machine:
1. First delivery → `SET NX` claims `'processing'` → run the AI pipeline exactly once.
2. Redelivery while `'processing'` → duplicate, `status:'processing'`, no reprocess.
3. Redelivery after `'completed'` → duplicate, `status:'completed'`, the stored
   `aiResponse` payload is **replayed** (not regenerated).
4. Failure → `release()` deletes the claim so an **explicit** retry reprocesses.

**Replay, not resend:** a duplicate delivery never re-runs generation; it replays
the already-stored response.

## 5. Redis-unavailable fallback

When `getRedisClient()` has no open client, a bounded, process-local LRU map
(max `CHAT_MESSAGE_DEDUP_LOCAL_MAX`, default 1000, with TTL sweep + eviction)
is used so the chat never blocks. Without a shared store, duplicate guarantees
are **per-process only**; cross-instance guarantees require Redis.

## 6. Mongo persistence guards

- `Conversation` messages carry an **optional** `clientMessageId`.
- Before appending a user message, `manageSession` checks whether one with the
  same id is already stored for this owned conversation and skips it if so.
- `saveAIResponse` similarly avoids appending a duplicate assistant reply.
- **No** unique multikey index is placed on `clientMessageId` (explicitly out of
  scope).

## 7. Frontend dedupe / replay protection

- Each submission uses one `clientMessageId` (also the bubble id).
- A duplicate local submit (same content still in flight) returns the existing
  bubble — one emit, one bubble.
- An `aiResponse` is rendered once per `clientMessageId` (a replayed/duplicated
  response is ignored).
- The ack is a receipt and never frees the pending slot on `accepted` /
  `processing` / `completed`; the slot is freed by the correlated `aiResponse`
  (success), by a `status: 'invalid'` ack, or by the socket `error` event
  (failure), so a user can legitimately send again. **Reconnection does not
  auto-resend** in this change.

## 8. Deliberate non-goals (out of scope)

No streaming/token output, no sequence numbers, no per-session queue, no
automatic reconnect resend, no retry UI, no cancel-generation, no TTFT metrics,
no chat rate limiting, no broad Conversation persistence refactor, no product
API changes, no `clientMessageId` unique multikey index, and no change to the
`{ userId, sessionId }` ownership isolation.