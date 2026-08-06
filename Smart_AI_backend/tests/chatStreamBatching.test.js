/* ------------------------------------------------------------------ */
/*  Incremental token batching helper                                   */
/*                                                                     */
/*  Verifies chunk batching semantics: accumulated deltas are flushed   */
/*  as a single chunk (transport-agnostic), threshold + timer behavior, */
/*  no empty chunks, residual flush, exact order, and cleanup.          */
/* ------------------------------------------------------------------ */

const { createChatStreamBatching, STREAM_BATCH_MS, STREAM_BATCH_CHARACTERS } = require('../services/chatStreamBatching');

const tick = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

describe('createChatStreamBatching', () => {
  it('requires an onChunk callback', () => {
    expect(() => createChatStreamBatching({})).toThrow(/onChunk/);
  });

  it('flushes exactly when the character threshold is reached', () => {
    const chunks = [];
    const b = createChatStreamBatching({
      flushCharacters: 5,
      flushIntervalMs: 5000, // effectively disable the timer
      onChunk: (text, index) => chunks.push({ text, index }),
    });

    b.push('ab'); // 2
    b.push('cd'); // 4
    expect(chunks).toHaveLength(0); // not yet at 5
    b.push('e'); // 5 -> flush
    expect(chunks).toEqual([{ text: 'abcde', index: 0 }]);
  });

  it('emits a DELTA, never a running accumulator', () => {
    const chunks = [];
    const b = createChatStreamBatching({ flushCharacters: 3, flushIntervalMs: 5000, onChunk: (t) => chunks.push(t) });
    b.push('aaa');
    b.push('bbb');
    b.push('ccc');
    expect(chunks).toEqual(['aaa', 'bbb', 'ccc']);
  });

  it('never emits an empty chunk', () => {
    const chunks = [];
    const b = createChatStreamBatching({ flushCharacters: 2, flushIntervalMs: 5000, onChunk: (t) => chunks.push(t) });
    b.push(''); // ignore
    b.push(null); // ignore
    b.push('ab');
    b.flush(); // buffer was exactly flushed already; nothing buffered
    expect(chunks).toEqual(['ab']);
  });

  it('flushes residual buffered text on flush()', () => {
    const chunks = [];
    const b = createChatStreamBatching({ flushCharacters: 100, flushIntervalMs: 5000, onChunk: (t) => chunks.push(t) });
    b.push('hello ');
    b.push('world');
    expect(chunks).toHaveLength(0);
    b.flush();
    expect(chunks).toEqual(['hello world']);
  });

  it('flushes on the timer when below the character threshold', async () => {
    const chunks = [];
    const b = createChatStreamBatching({ flushCharacters: 100, flushIntervalMs: STREAM_BATCH_MS, onChunk: (t) => chunks.push(t) });
    b.push('small partial');
    expect(chunks).toHaveLength(0);
    await tick(STREAM_BATCH_MS + 30);
    expect(chunks).toEqual(['small partial']);
  });

  it('assigns monotonic chunk indexes and tracks chunkCount', () => {
    const chunks = [];
    const b = createChatStreamBatching({ flushCharacters: 2, flushIntervalMs: 5000, onChunk: (text, index) => chunks.push({ text, index }) });
    b.push('aa');
    b.push('bb');
    b.push('cc');
    expect(chunks.map((c) => c.index)).toEqual([0, 1, 2]);
    expect(b.chunkCount()).toBe(3);
    expect(b.pending()).toBe('');
  });

  it('dispose clears pending buffer and cancels the timer', async () => {
    const chunks = [];
    const b = createChatStreamBatching({ flushCharacters: 100, flushIntervalMs: 20, onChunk: (t) => chunks.push(t) });
    b.push('orphaned text');
    b.dispose();
    await tick(50);
    expect(chunks).toHaveLength(0);
    expect(b.pending()).toBe('');
  });
});