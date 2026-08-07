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
| `messageProcessing`  | `{ sessionId, clientMessageId, status: 'started'\|'completed'\|'cancelled'\|'error', reason?, processingTime? }` |
| `aiResponseStart`    | `{ sessionId, clientMessageId, timestamp, metadata? }` (exactly once, A9) |
| `aiResponseChunk`    | `{ sessionId, clientMessageId, chunk, chunkIndex, timestamp }` (DELTA only, A9) |
| `aiResponseComplete` | `{ sessionId, clientMessageId, content, finishReason, totalChunks, timestamp, metadata? }` (A9) |
| `aiResponse`         | `{ sessionId, clientMessageId, message, timestamp, metadata? }` (compat only, A9) |
| `error`              | `{ type, message, timestamp, clientMessageId? }` (`clientMessageId` optional) |
| `stopGeneration`     | `{ sessionId, clientMessageId }` (client → server) |
| ack (stopGeneration) | `{ stopped, status: 'stopped'\|'already_completed'\|'not_found'\|'invalid', clientMessageId }` (server → client, at most once) |

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
  `aiResponseComplete`/`aiResponse` (success), by a `status: 'invalid'` ack, by
  the socket `error` event (failure), or by `messageProcessing 'cancelled'`
  (user-stopped stream). **Reconnection does not auto-resend** in this change.
- A live stream the user stopped is finalized via `onStreamCancelled` (keeps the
  partial content, no longer loading) — see §10.

## 8. Deliberate non-goals (out of scope)

No sequence numbers, no per-session queue, no automatic reconnect resend, no
retry UI, no TTFT metrics, no chat rate limiting, no broad Conversation
persistence refactor, no product API changes, no `clientMessageId` unique
multikey index, and no change to the `{ userId, sessionId }` ownership
isolation. (Cancel-generation was previously listed here and is now implemented
— see §10; its own non-goals are listed at the end of that section.)

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

## 10. Stop AI generation

A user can stop an **accepted** generation with the `stopGeneration` event. A
generation is cancellable from its very first processing instant
(`messageProcessing 'started'`) through its terminal event — **not** only while
a stream placeholder exists, because the client cannot know the provider type in
advance (intent classification / RAG run first, and buffered/deterministic
branches never emit `aiResponseStart`). Stopping is per-generation, process-local,
and never persists partial assistant content.

### Contract

```
client:  stopGeneration { sessionId, clientMessageId }
server:  ack { stopped, status, clientMessageId }      (at most once; delivery receipt)
terminal: messageProcessing { status: 'cancelled', reason: 'user_cancelled' }  (exactly once, when the abort actually stops the run)
```

- The **only** terminal signal for a stopped generation is `messageProcessing`
  with `status: 'cancelled'` and `reason: 'user_cancelled'`. **There is no
  `aiResponseCancelled` event, no `error` event, no `aiResponseComplete`, and no
  `aiResponse` for a cancelled generation.** A cancellation is an expected,
  terminal condition and is never logged with `logger.error`.
- The `stopGeneration` ack is a **delivery receipt** that an abort was accepted
  (or that there was nothing to abort) — it does **not** carry a second terminal
  status. Ack `status` values:
  - `'stopped'` — an active generation was found and its controller aborted.
  - `'already_completed'` — the id already finished (late request, a no-op that
    does not mutate the completed state).
  - `'not_found'` — no active generation and no completed mark for the id.
  - `'invalid'` — malformed `sessionId` / `clientMessageId` (UUID required).
- Identity is the **trusted** `socket.data.user.id + sessionId + clientMessageId`
  (same scope as the dedup guard); a client-supplied `userId` is ignored. A stop
  for a live generation on a *different* session (or user) is `'not_found'`.

### Cancellation architecture (one AbortController per accepted request)

The socket boundary owns **exactly one `AbortController`** per accepted request:

1. `handleSendMessage` creates the controller **after auth/validation/dedup-claim
   and before `messageProcessing 'started'` / `processMessage`**, and registers it
   into `chatActiveStreams` (`register({ userId, sessionId, clientMessageId,
   controller, socketId })`). This is the **only** registration —
   `generateResponse` no longer creates or registers a controller.
2. The controller's `{ signal }` is threaded through
   `processMessage → intent → context → RAG → generateResponse →
   generateChatResponseStream → `streamOpenAICompatible` / `streamGeminiChat``
   (OpenAI passes `signal` to `create({ stream: true, signal })`; Gemini checks
   `throwIfCancelled(signal)` between yields).
3. `processMessage` and `socketHandler` assert a shared `throwIfCancelled(signal)`
   at checkpoints: before any work, after `manageSession`, after intent,
   before/after context, before/after RAG, before the provider call, during
   streaming, before `aiResponseComplete`, before assistant persistence, and
   before the dedup completion mark. Aborting surfaces the shared cancellation
   identity `{ aborted: true, cancelled: true, code: 'STREAM_CANCELLED' }`
   (defined once in `utils/chatCancellation.js`), which the socket boundary maps
   to the single terminal `messageProcessing 'cancelled'`.
4. Registry lifecycle (`services/chatActiveStreams.js`): `register` at the
   boundary → success `markCompleted` (bounded completed set ⇒ late stop acks
   `'already_completed'`) / cancel `abort` + remove / genuine error `remove` /
   disconnect `removeForSocket` (aborts + removes every entry owned by the socket,
   so a dropped client stops burning provider tokens). Active entries and
   completed marks are TTL-swept (`CHAT_STREAM_TTL_MS` / `CHAT_COMPLETED_TTL_MS`,
   completed capped by `CHAT_COMPLETED_MAX`); importantly an **expired active**
   entry **aborts its controller before being deleted** so an orphaned in-flight
   call cannot run to completion.

### Races and guarantees

- Cancellation is pre-emptive: aborting the controller prevents every **later**
  phase — no RAG step, no provider call begins after an abort, no fallback
  (OpenAI → Gemini → deterministic) begins after an abort, and no chunk is
  flushed after a cancel.
- A stop that lands **right as** `processMessage` resolves is treated as
  cancelled (a checkpoint before the `completed` emit), never a completion.
- Duplicate-stop is idempotent (`not_found` on the second stop after the entry is
  removed). Stale-TTL expiry, disconnect at any phase, and two concurrent
  `clientMessageId`s are isolated: stopping generation A never aborts generation
  B.

### Persistence, dedup, and the same-id retry

- **No partial assistant content is ever persisted** for a cancelled run
  (`saveAIResponse` is not reached and has its own pre-save checkpoint); the user
  message may remain stored.
- The **dedup claim is released** on cancellation, so the same `clientMessageId`
  can be submitted again and is treated as a fresh submission (`accepted`), never
  a duplicate, and the generation is never marked completed in the dedup store.
- Retry after a stop should use a fresh `clientMessageId` (recommended, since the
  partially-streamed bubble belongs to the old id).

### Frontend

- The Stop control is visible for the **whole processing window** of an accepted
  generation: `chat.service.ts` tracks a `cancellableGenerationIds` set, populated
  from `messageProcessing 'started'` and cleared by the terminal events
  (`completed`, `cancelled`, `error`, or the compatibility `aiResponse`) and by
  `disconnect`. `isActiveGeneration()` / `getActiveGenerationId()` drive the UI;
  `stopGeneration(clientMessageId)` returns `true` for any cancellable id (even
  one with no stream placeholder yet).
- A buffered/deterministic **instant** finish (e.g. `started` → `completed`) clears
  the Stop control immediately — there is no artificial slowdown; a generation
  that completes before the user clicks is simply gone. The optional dev/test
  env `CHAT_STREAM_TEST_DELAY_MS` (default 0/disabled; dev-only) can hold a phase
  for manual verification to observe the Stop control across the whole window.
- `FloatingChat` tracks the active generation id (set from `messageProcessing
  'started'` via `getActiveGenerationId()`, kept through `aiResponseStart`, cleared
  on `onStreamComplete` / `onStreamError` / `onStreamCancelled` / `completed` /
  `error` / `disconnect`); `ChatWindow` replaces Send with a Stop button while
  `isActiveGeneration` is true; `ChatMessage` shows a "Đã dừng" badge on a
  cancelled bubble (partial text preserved, no error styling).

### Non-goals (out of scope)

No `aiResponseCancelled` event, no retry UI, no automatic resend on reconnect,
no partial assistant persistence, no per-session queue, no **distributed**
(cross-instance) stop — the registry is process-local, exactly like the dedup
service's Redis-unavailable fallback — and no rate limiting on `stopGeneration`
(the handler is cheap and idempotent). No product/API changes.

### Test coverage

- Backend: `tests/chatActiveStreams.test.js` (registry: register units/get/abort-
  once/remove/markCompleted/removeForSocket/clear, user+session+id isolation, TTL
  sweeps), `tests/chatStopGeneration.test.js` (real Socket.IO: single controller
  at boundary, `started`→signal threading, two concurrent ids isolated, genuine
  error cleanup, stopped ack → exactly one `messageProcessing 'cancelled'`, no
  error/no completion, ack once, claim released → same-id reprocess,
  already_completed, not_found, cross-session miss, invalid ids, no-ack emit,
  disconnect sweep), `tests/chatGenerationCancel.test.js` (the caller-provided
  signal is threaded; pre-aborted signal rejects before any emit; abort mid-
  stream rejects; completion-race abort; buffered success marks completed),
  `tests/chatCancellationCheckpoints.test.js` (controller-level: pre-aborted
  cancels before any work; cancel during intent prevents RAG/provider/save; user
  message persists but assistant never saved; normal run completes + saves).
- Frontend: `src/tests/ChatServiceStop.test.ts` (stop from `started` before
  `aiResponseStart`, Stop through start/chunks, complete/cancelled/error/
  disconnect/compat `aiResponse` retire the generation, two concurrent ids
  isolated, late complete ignored, early-cancel finalizes the thinking bubble,
  partial text preserved on cancel, fresh-id resubmit, no stale Stop after a
  deterministic finish).