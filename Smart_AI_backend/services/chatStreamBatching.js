/**
 * Incremental token batching for Socket.IO chat streaming.
 *
 * The provider yields tiny text deltas (often a few characters per token). We
 * batch them and flush a single Socket.IO `aiResponseChunk` event when either:
 *   - STREAM_BATCH_CHARS (characters) accumulated, or
 *   - STREAM_BATCH_MS (milliseconds) elapsed since the first pending delta.
 *
 * Rules:
 *   - chunk content is a DELTA only; never a running accumulator.
 *   - never emit an empty chunk.
 *   - a flushed stream flushes remaining buffered text before completion.
 *   - the timer/state is cleaned on success and failure.
 *   - text order/content is preserved exactly.
 *
 * This helper is transport-agnostic: `onChunk` decides how the flushes are
 * emitted. It is independently unit-testable without any socket.
 */

const STREAM_BATCH_MS = 40;
const STREAM_BATCH_CHARACTERS = 40;

/**
 * @param {object} opts
 * @param {number}  [opts.flushIntervalMs]  timer threshold (default STREAM_BATCH_MS)
 * @param {number}  [opts.flushCharacters] character threshold (default STREAM_BATCH_CHARACTERS)
 * @param {(text: string, chunkIndex: number) => void} opts.onChunk
 */
function createChatStreamBatching({ flushIntervalMs = STREAM_BATCH_MS, flushCharacters = STREAM_BATCH_CHARACTERS, onChunk }) {
  if (typeof onChunk !== 'function') {
    throw new Error('createChatStreamBatching requires an onChunk callback');
  }

  let buffer = '';
  let nextIndex = 0;
  let timer = null;

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (buffer.length > 0) {
      onChunk(buffer, nextIndex);
      nextIndex += 1;
      buffer = '';
    }
  };

  const armTimer = () => {
    if (timer || buffer.length === 0) return;
    timer = setTimeout(flush, flushIntervalMs);
  };

  const push = (delta) => {
    if (!delta || delta.length === 0) return; // never buffer empty deltas
    buffer += delta;
    if (buffer.length >= flushCharacters) {
      flush();
    } else {
      armTimer();
    }
  };

  const dispose = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    buffer = '';
  };

  return {
    push,
    flush,
    dispose,
    // Number of chunks emitted so far (index of the NEXT chunk).
    chunkCount: () => nextIndex,
    // Text currently held that has not yet been flushed.
    pending: () => buffer,
  };
}

module.exports = {
  createChatStreamBatching,
  STREAM_BATCH_MS,
  STREAM_BATCH_CHARACTERS,
};