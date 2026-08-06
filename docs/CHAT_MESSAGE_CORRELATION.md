# Chat Message Correlation — Design Notes

This document describes the client-generated message correlation flow added to
the Smart AI chat. It is a **design/contracts** reference; implementation lives
in the `Smart_AI_backend` and `Smart_AI_frontend` source trees.

## 1. The `clientMessageId` contract

Every `sendMessage` submission carries a `clientMessageId` (a UUID). The same
id is echoed back on the correlated server events:

| Event                | Payload fields                                                        |
| -------------------- | --------------------------------------------------------------------- |
| `sendMessage`        | `{ sessionId, message, clientMessageId }` (client → server)           |
| ack (sendMessage)    | `{ accepted, duplicate, status, clientMessageId }` (server → client)  |
| `messageProcessing`  | `{ sessionId, clientMessageId, status: 'started'\|'completed'\|'error' }` |
| `aiResponseStart`    | `{ sessionId, clientMessageId, timestamp, metadata? }` (exactly once, §9) |
| `aiResponseChunk`    | `{ sessionId, clientMessageId, chunk, chunkIndex, timestamp }` (DELTA only, §9) |
| `aiResponseComplete` | `{ sessionId, clientMessageId, content, finishReason, totalChunks, timestamp, metadata? }` (§9) |
| `aiResponse`         | `{ sessionId, clientMessageId, message, timestamp, metadata? }` (compat only, §9) |
| `error`              | `{ type, message, timestamp, clientMessageId? }` (`clientMessageId` optional) |

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
The terminal outcome is signaled by the correlated `aiResponseComplete`/`aiResponse`
or `error` events, never by the ack.

- accepted first submission — `accepted: true`, `duplicate: false`, `status: 'accepted'`
- duplicate, still processing — `accepted: false`, `duplicate: true`, `status: 'processing'`
- duplicate, already completed — `accepted: false`, `duplicate: true`, `status: 'completed'`, then replays stored `aiResponse`.
- malformed / rejected payload — `accepted: false`, `duplicate: false`, `status: 'invalid'`
- generation failure — the `accepted` ack was already delivered; the failure is
  signaled by **exactly one** correlated terminal `error` event plus a
  `messageProcessing` `'error'` progress signal. No `status: 'error'` ack.

## 3. Event ordering

The server delivers packets in this exact order on the same socket/transport.

Accepted first submission (live streamed provider success):

1. ack `{ accepted: true, duplicate: false, status: 'accepted', clientMessageId }`
2. `messageProcessing` `{ status: 'started', ... }`
3. `chatController.processMessage` runs; on the product-query path the provider
   streams and the server emits **exactly one** `aiResponseStart`, then one or
   more `aiResponseChunk` deltas (`§9`), then **exactly one** `aiResponseComplete`
   and `messageProcessing` `{ status: 'completed', ... }`.
   **`aiResponse` is never emitted for a live streamed success.**

Accepted first submission (buffered/deterministic fallback, or non-streamed
small talk / complaint):

1. ack `{ accepted: true, duplicate: false, status: 'accepted', clientMessageId }`
2. `messageProcessing` `{ status: 'started', ... }`
3. one `aiResponse` (full text) then `messageProcessing` `{ status: 'completed', ... }`.
   No `aiResponseStart` / `aiResponseChunk` / `aiResponseComplete` are emitted —
   these paths are intentionally buffered.

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

If a live stream already emitted `aiResponseStart`/`aiResponseChunk` and then
fails, the same single correlated `error` event is the terminal signal: no
`aiResponseComplete`, no `aiResponse`, and no partial content is persisted (§9).

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
- A **live stream** uses a single assistant placeholder per `clientMessageId`
  with a stable id `stream:<clientMessageId>`: `aiResponseStart` creates it,
  each `aiResponseChunk` delta is appended into that same message, and
  `aiResponseComplete` finalizes it with the authoritative `content` (replacing
  any locally accumulated text). No second bubble is ever created.
- A stray/replayed `aiResponse` for an id already delivered via a live stream is
  **ignored** (`deliveredStreamIds`), so a completed stream never renders twice.
- A `aiResponse` without a prior stream (buffered/deterministic, small talk,
  complaint, or a completed-duplicate replay) still renders once per
  `clientMessageId` via `onMessage`.
- The streaming state is cleared on the correlated `error` (`onStreamError`
  marks the placeholder failed and removes it), on `disconnect`, and on
  `resetSession`.
- The ack is a receipt and never frees the pending slot on `accepted` /
  `processing` / `completed`; the slot is freed by the correlated
  `aiResponseComplete`/`aiResponse` (success), by a `status: 'invalid'` ack, or
  by the socket `error` event (failure), so a user can legitimately send again.
  **Reconnection does not auto-resend** in this change.

## 8. Deliberate non-goals (out of scope)

No sequence numbers, no per-session queue, no automatic reconnect resend, no
retry UI, no cancel-generation, no TTFT metrics, no chat rate limiting, no broad
Conversation persistence refactor, no product API changes, no `clientMessageId`
unique multikey index, and no change to the `{ userId, sessionId }` ownership
isolation.

## 9. Streaming (`aiResponseStart` / `aiResponseChunk` / `aiResponseComplete`)

The product-query response is generated via `generateChatResponseStream`
(OpenAI-compatible → Gemini → deterministic, the same fallback chain as the
single-shot path) and batched by `createChatStreamBatching` before emission.

**Live provider success** (OpenAI or Gemini) follows the contract:

```
ack accepted -> messageProcessing started
             -> aiResponseStart (exactly once)
             -> aiResponseChunk*  (0..n)
             -> aiResponseComplete (exactly once)
             -> messageProcessing completed
```

- `aiResponseStart` is emitted **exactly once**, after `messageProcessing
  started` and before the first chunk. A duplicate start is ignored.
- Each `aiResponseChunk.chunk` is a **delta** to be **appended** by the client —
  never a running accumulator — so order/content are preserved and chunk size is
  bounded (`STREAM_BATCH_CHARACTERS` ≈ 40 chars, flush interval
  `STREAM_BATCH_MS` ≈ 40 ms). Empty chunks are never emitted.
- `chunkIndex` is a mandatory, monotonic, **zero-based** index that increments
  by exactly 1 per chunk. The client rejects stale/duplicate/out-of-order values.
- `aiResponseComplete` is emitted exactly once with the **authoritative**
  `content` (what is displayed and persisted), `finishReason` (`'stop'` or
  `'max_tokens'`), and `totalChunks`. It is emitted **before**
  `messageProcessing completed`. No `aiResponse` follows a live `aiResponseComplete`.
- Provider output is capped at `MAX_STREAMED_TEXT_CHARS` (default 4000, env
  `MAX_CHAT_RESPONSE_CHARS`). When the cap is hit the stream stops and completes
  with `finishReason: 'max_tokens'`; the persisted content equals the displayed
  text.

**`aiResponse` is reserved** for exactly two cases — never for a live streamed
success:

1. an **intentionally buffered** fallback (deterministic branch, or small talk /
   complaint), which emits one `aiResponse` with the full text;
2. a **completed duplicate replay**, where the dedup store re-emits the cached
   `aiResponse` payload exactly once.

**Fallback rule:** provider fallback happens only when **zero chunks** have been
emitted. Once any `aiResponseChunk` is sent, a subsequent provider failure does
**not** fall back to the next provider — it surfaces as the single correlated
terminal `error` event. No part of the stream is ever persisted on failure.

Dedup stores the **final full** `aiResponse`-shaped payload so a duplicate replay
re-emits the full message, never the stream.

### Backend test coverage
`tests/chatStreamFallback.test.js` (provider fallback chain, ceiling,
no-fallback-after-chunk, partial-content preservation), `tests/chatStreamBatching.test.js`
(batching semantics), and `tests/chatStreamController.test.js` (the streaming
event contract: exactly-once start/complete, delta-only zero-based sequential
`chunkIndex`, no empty chunks, no `aiResponse` on live success, buffered-fallback
`aiResponse`, propagation of mid-stream failures without a terminal
`aiResponseComplete`).

### Frontend test coverage
`src/tests/ChatServiceStreaming.test.ts` (the one-placeholder lifecycle:
start creates the single assistant message, deltas mutate the same message,
stale/out-of-order `chunkIndex` rejected, complete finalizes with authoritative
content, stray `aiResponse` for a delivered id ignored, buffered `aiResponse`
still rendered, concurrent streams isolated, correlated-error cleanup, and
reset/disconnect clearing).