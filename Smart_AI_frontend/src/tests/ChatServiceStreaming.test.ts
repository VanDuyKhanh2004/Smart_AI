import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import chatService from '@/services/chat.service';
import type { ChatMessage, ChatServiceConfig } from '@/services/chat.service';

const ACCESS_TOKEN_KEY = 'accessToken';

type EventHandler = (...args: unknown[]) => void;

interface FakeSocket {
  id: string;
  connected: boolean;
  on: Mock<(event: string, cb: EventHandler) => void>;
  emit: Mock<(...args: unknown[]) => void>;
  disconnect: Mock<() => void>;
}

interface CreatedEntry {
  socket: FakeSocket;
  handlers: Map<string, EventHandler[]>;
}

const { ioMock, created } = vi.hoisted(() => {
  const created: CreatedEntry[] = [];
  const ioMock = vi.fn<(url: string, options: Record<string, unknown>) => FakeSocket>(() => {
    const handlers = new Map<string, EventHandler[]>();
    const socket: FakeSocket = {
      id: 'fake-socket-id',
      connected: false,
      on: vi.fn<(event: string, cb: EventHandler) => void>((event, cb) => {
        const list = handlers.get(event) ?? [];
        list.push(cb);
        handlers.set(event, list);
      }),
      emit: vi.fn<(...args: unknown[]) => void>(),
      disconnect: vi.fn<() => void>(() => {
        socket.connected = false;
      }),
    };
    created.push({ socket, handlers });
    return socket;
  });
  return { ioMock, created };
});

vi.mock('socket.io-client', () => ({ io: ioMock }));

function makeConfig() {
  return {
    onMessage: vi.fn(),
    onMessageUpdate: vi.fn(),
    onStreamStart: vi.fn(),
    onStreamComplete: vi.fn(),
    onStreamError: vi.fn(),
    onError: vi.fn(),
    onConnected: vi.fn(),
    onDisconnected: vi.fn(),
    onProcessingStatus: vi.fn(),
  } as unknown as ChatServiceConfig & {
    onMessage: Mock;
    onMessageUpdate: Mock;
    onStreamStart: Mock;
    onStreamComplete: Mock;
    onStreamError: Mock;
    onError: Mock;
    onConnected: Mock;
    onDisconnected: Mock;
    onProcessingStatus: Mock;
  };
}

function fire(handlers: Map<string, EventHandler[]>, event: string, ...args: unknown[]) {
  const list = handlers.get(event) ?? [];
  for (const cb of list) {
    cb(...args);
  }
}

function connectedEntry() {
  const entry = created[0];
  entry.socket.connected = true;
  fire(entry.handlers, 'connect');
  return entry;
}

interface SendPayload {
  sessionId: string;
  message: string;
  clientMessageId: string;
}

function lastSend(entry: CreatedEntry): { payload: SendPayload; ack: (a: unknown) => void } {
  const calls = entry.socket.emit.mock.calls as Array<[string, SendPayload, (a: unknown) => void]>;
  const [, payload, ack] = calls[calls.length - 1];
  return { payload, ack };
}

function assistantMessages(config: ReturnType<typeof makeConfig>) {
  const calls = config.onMessage.mock.calls as Array<[ChatMessage]>;
  return calls.map(([m]) => m).filter((m) => m.role === 'assistant');
}

function updates(config: ReturnType<typeof makeConfig>) {
  const calls = config.onMessageUpdate.mock.calls as Array<[ChatMessage]>;
  return calls.map(([m]) => m);
}

function starts(config: ReturnType<typeof makeConfig>) {
  const calls = config.onStreamStart.mock.calls as Array<[ChatMessage]>;
  return calls.map(([m]) => m);
}

function completes(config: ReturnType<typeof makeConfig>) {
  const calls = config.onStreamComplete.mock.calls as Array<[ChatMessage]>;
  return calls.map(([m]) => m);
}

/** Fire the full live-stream lifecycle (start -> chunks -> complete) for a send. */
function streamFull(entry: CreatedEntry, chunks: string[], opts: { content?: string; finishReason?: string } = {}) {
  const { payload } = lastSend(entry);
  const sessionId = chatService.getSessionId();
  fire(entry.handlers, 'aiResponseStart', { sessionId, clientMessageId: payload.clientMessageId });
  chunks.forEach((chunk, i) => {
    fire(entry.handlers, 'aiResponseChunk', { sessionId, clientMessageId: payload.clientMessageId, chunk, chunkIndex: i });
  });
  fire(entry.handlers, 'aiResponseComplete', {
    sessionId,
    clientMessageId: payload.clientMessageId,
    content: opts.content ?? chunks.join(''),
    finishReason: opts.finishReason ?? 'stop',
    totalChunks: chunks.length,
    timestamp: '2026-01-01T00:00:00.000Z',
  });
  return { payload };
}

beforeEach(() => {
  created.length = 0;
  ioMock.mockClear();
  localStorage.clear();
  vi.clearAllMocks();
  localStorage.setItem(ACCESS_TOKEN_KEY, 'tok');
  chatService.resetSession();
});

afterEach(() => {
  chatService.disconnect();
});

describe('ChatService streaming contract (aiResponseStart/Chunk/Complete)', () => {
  it('creates exactly ONE placeholder per clientMessageId at aiResponseStart', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();

    chatService.sendMessage('gợi ý iphone');
    const { payload } = lastSend(entry);
    const sessionId = chatService.getSessionId();

    // A duplicate start is a no-op.
    fire(entry.handlers, 'aiResponseStart', { sessionId, clientMessageId: payload.clientMessageId });
    fire(entry.handlers, 'aiResponseStart', { sessionId, clientMessageId: payload.clientMessageId });

    const placeholders = starts(config);
    expect(placeholders).toHaveLength(1);
    expect(placeholders[0].id).toBe(`stream:${payload.clientMessageId}`);
    expect(placeholders[0].clientMessageId).toBe(payload.clientMessageId);
    expect(placeholders[0].role).toBe('assistant');
    expect(placeholders[0].content).toBe('');
    expect(placeholders[0].isLoading).toBe(true);
    // onMessage is NOT used for live streams.
    expect(assistantMessages(config)).toHaveLength(0);
  });

  it('appends deltas into the SAME placeholder via onMessageUpdate', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();

    chatService.sendMessage('gợi ý iphone');
    const { payload } = lastSend(entry);
    const sessionId = chatService.getSessionId();

    fire(entry.handlers, 'aiResponseStart', { sessionId, clientMessageId: payload.clientMessageId });
    fire(entry.handlers, 'aiResponseChunk', { sessionId, clientMessageId: payload.clientMessageId, chunk: 'Xin ', chunkIndex: 0 });
    fire(entry.handlers, 'aiResponseChunk', { sessionId, clientMessageId: payload.clientMessageId, chunk: 'chào!', chunkIndex: 1 });

    const partial = updates(config);
    expect(partial).toHaveLength(2);
    expect(partial[0].content).toBe('Xin ');
    expect(partial[1].content).toBe('Xin chào!');
    // Every update is the SAME message object id.
    expect(partial.every((m) => m.id === `stream:${payload.clientMessageId}`)).toBe(true);
    expect(partial.every((m) => m.isLoading === true)).toBe(true);
  });

  it('ignores chunks whose chunkIndex does not match the expected sequence (stale/duplicate/out-of-order)', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();

    chatService.sendMessage('gợi ý iphone');
    const { payload } = lastSend(entry);
    const sessionId = chatService.getSessionId();

    fire(entry.handlers, 'aiResponseStart', { sessionId, clientMessageId: payload.clientMessageId });
    fire(entry.handlers, 'aiResponseChunk', { sessionId, clientMessageId: payload.clientMessageId, chunk: 'a', chunkIndex: 1 }); // wrong order: index 0 expected
    fire(entry.handlers, 'aiResponseChunk', { sessionId, clientMessageId: payload.clientMessageId, chunk: 'a', chunkIndex: 0 });
    fire(entry.handlers, 'aiResponseChunk', { sessionId, clientMessageId: payload.clientMessageId, chunk: 'b', chunkIndex: 1 });
    fire(entry.handlers, 'aiResponseChunk', { sessionId, clientMessageId: payload.clientMessageId, chunk: 'x', chunkIndex: 1 }); // duplicate/stale

    const partial = updates(config);
    expect(partial).toHaveLength(2);
    expect(partial[0].content).toBe('a');
    expect(partial[1].content).toBe('ab');
  });

  it('ignores chunks with missing clientMessageId, empty chunk, or foreign session', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();

    chatService.sendMessage('gợi ý iphone');
    const { payload } = lastSend(entry);
    const sessionId = chatService.getSessionId();

    fire(entry.handlers, 'aiResponseStart', { sessionId, clientMessageId: payload.clientMessageId });
    fire(entry.handlers, 'aiResponseChunk', { sessionId, clientMessageId: payload.clientMessageId, chunk: '', chunkIndex: 0 });
    fire(entry.handlers, 'aiResponseChunk', { sessionId, clientMessageId: payload.clientMessageId, chunkIndex: 0 });
    fire(entry.handlers, 'aiResponseChunk', { sessionId: 'other-session', clientMessageId: payload.clientMessageId, chunk: 'stale ', chunkIndex: 0 });

    expect(updates(config)).toHaveLength(0);
  });

  it('aiResponseComplete finalizes the SAME placeholder with authoritative content (replaces accumulated)', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();

    chatService.sendMessage('gợi ý iphone');
    const { payload } = lastSend(entry);
    const sessionId = chatService.getSessionId();

    fire(entry.handlers, 'aiResponseStart', { sessionId, clientMessageId: payload.clientMessageId });
    fire(entry.handlers, 'aiResponseChunk', { sessionId, clientMessageId: payload.clientMessageId, chunk: 'partial ', chunkIndex: 0 });

    fire(entry.handlers, 'aiResponseComplete', {
      sessionId,
      clientMessageId: payload.clientMessageId,
      content: 'authoritative full answer',
      finishReason: 'stop',
      totalChunks: 1,
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    const finals = completes(config);
    expect(finals).toHaveLength(1);
    expect(finals[0].content).toBe('authoritative full answer');
    expect(finals[0].id).toBe(`stream:${payload.clientMessageId}`);
    expect(finals[0].isLoading).toBe(false);
    expect(config.onStreamStart).toHaveBeenCalledTimes(1);
    expect(config.onProcessingStatus).toHaveBeenCalledWith(false);
    // No second bubble via onMessage.
    expect(assistantMessages(config)).toHaveLength(0);
  });

  it('honors finishReason max_tokens from aiResponseComplete', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();

    chatService.sendMessage('gợi ý iphone');
    const { payload } = lastSend(entry);
    const sessionId = chatService.getSessionId();

    fire(entry.handlers, 'aiResponseStart', { sessionId, clientMessageId: payload.clientMessageId });
    fire(entry.handlers, 'aiResponseComplete', {
      sessionId,
      clientMessageId: payload.clientMessageId,
      content: 'x'.repeat(4000),
      finishReason: 'max_tokens',
      totalChunks: 0,
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    const finals = completes(config);
    expect(finals).toHaveLength(1);
    expect(finals[0].content.length).toBe(4000);
    expect(finals[0].isLoading).toBe(false);
  });

  it('a stray aiResponse for an already-delivered streamed id is ignored (no second bubble)', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();

    chatService.sendMessage('gợi ý iphone');
    const { payload } = streamFull(entry, ['done']);

    fire(entry.handlers, 'aiResponse', {
      sessionId: chatService.getSessionId(),
      clientMessageId: payload.clientMessageId,
      message: 'should not render',
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    expect(assistantMessages(config)).toHaveLength(0);
    expect(completes(config)).toHaveLength(1);
  });

  it('buffered/deterministic aiResponse (no stream) still renders via onMessage', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();

    chatService.sendMessage('gợi ý iphone');
    const { payload } = lastSend(entry);
    const sessionId = chatService.getSessionId();

    fire(entry.handlers, 'aiResponse', {
      sessionId,
      clientMessageId: payload.clientMessageId,
      message: 'buffered reply',
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    const calls = config.onMessage.mock.calls as Array<[ChatMessage]>;
    const assistant = calls.map(([m]) => m).find((m) => m.role === 'assistant');
    expect(assistant).toBeDefined();
    expect(assistant?.content).toBe('buffered reply');
    expect(config.onStreamStart).not.toHaveBeenCalled();
  });

  it('a correlated terminal error marks/removes the streaming placeholder exactly once', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();

    chatService.sendMessage('gợi ý iphone');
    const { payload } = lastSend(entry);
    const sessionId = chatService.getSessionId();

    fire(entry.handlers, 'aiResponseStart', { sessionId, clientMessageId: payload.clientMessageId });
    fire(entry.handlers, 'aiResponseChunk', { sessionId, clientMessageId: payload.clientMessageId, chunk: 'nửa câu', chunkIndex: 0 });

    fire(entry.handlers, 'error', {
      type: 'PROCESSING_ERROR',
      clientMessageId: payload.clientMessageId,
      message: 'Lỗi khi xử lý tin nhắn. Vui lòng thử lại sau.',
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    expect(config.onStreamError).toHaveBeenCalledTimes(1);
    expect(config.onStreamError).toHaveBeenCalledWith(payload.clientMessageId);
    expect(config.onStreamComplete).not.toHaveBeenCalled();
    expect(config.onError).toHaveBeenCalledTimes(1);
    expect(config.onProcessingStatus).toHaveBeenCalledWith(false);
  });

  it('two concurrent streams are isolated by clientMessageId', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();
    const sessionId = chatService.getSessionId();

    const first = chatService.sendMessage('gợi ý iphone');
    const second = chatService.sendMessage('giá samsung');

    expect(first?.clientMessageId).not.toBe(second?.clientMessageId);

    // Interleave the two streams.
    fire(entry.handlers, 'aiResponseStart', { sessionId, clientMessageId: first!.clientMessageId });
    fire(entry.handlers, 'aiResponseChunk', { sessionId, clientMessageId: first!.clientMessageId, chunk: 'iPhone ', chunkIndex: 0 });
    fire(entry.handlers, 'aiResponseStart', { sessionId, clientMessageId: second!.clientMessageId });
    fire(entry.handlers, 'aiResponseChunk', { sessionId, clientMessageId: second!.clientMessageId, chunk: 'Samsung ', chunkIndex: 0 });
    fire(entry.handlers, 'aiResponseChunk', { sessionId, clientMessageId: first!.clientMessageId, chunk: 'Pro', chunkIndex: 1 });

    const partial = updates(config);
    const byId = new Map<string, string>();
    for (const m of partial) {
      byId.set(m.clientMessageId!, m.content);
    }
    expect(byId.get(first!.clientMessageId!)).toBe('iPhone Pro');
    expect(byId.get(second!.clientMessageId!)).toBe('Samsung ');
    // distinct placeholder ids
    const ids = new Set(partial.map((m) => m.id));
    expect(ids.size).toBe(2);
  });

  it('resetSession clears streaming state; stale-session chunks after reset are ignored', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();

    chatService.sendMessage('gợi ý iphone');
    const { payload } = lastSend(entry);
    const oldSession = chatService.getSessionId();

    fire(entry.handlers, 'aiResponseStart', { sessionId: oldSession, clientMessageId: payload.clientMessageId });
    fire(entry.handlers, 'aiResponseChunk', { sessionId: oldSession, clientMessageId: payload.clientMessageId, chunk: 'abc', chunkIndex: 0 });

    chatService.resetSession();
    const newSession = chatService.getSessionId();
    expect(newSession).not.toBe(oldSession);

    fire(entry.handlers, 'aiResponseChunk', { sessionId: oldSession, clientMessageId: payload.clientMessageId, chunk: 'def', chunkIndex: 1 });

    expect(updates(config)).toHaveLength(1);
    expect(starts(config)).toHaveLength(1);
  });

  it('disconnect clears streaming and delivered state', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();

chatService.sendMessage('gợi ý iphone');
    streamFull(entry, ['done']);

    chatService.disconnect();
    // No crash, and a subsequent fresh session can stream again.
    chatService.initialize(config);
    const entry2 = created[1];
    fire(entry2.handlers, 'connect');
    chatService.sendMessage('gợi ý iphone');
    lastSend(entry2);
    streamFull(entry2, ['fresh'], { content: 'fresh reply' });
    expect(completes(config)).toHaveLength(2);
    expect(assistantMessages(config)).toHaveLength(0);
  });

  it('markdown content is preserved verbatim through the stream lifecycle', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();
    const sessionId = chatService.getSessionId();

    const first = chatService.sendMessage('giới thiệu sản phẩm');
    const chunks = ['**iPhone 16 Pro**\n\n', '- Giá: 29.990.000 VND\n', '- Tình trạng: Còn hàng'];
    chunks.forEach((chunk, i) => {
      fire(entry.handlers, 'aiResponseStart', { sessionId, clientMessageId: first!.clientMessageId });
      fire(entry.handlers, 'aiResponseChunk', { sessionId, clientMessageId: first!.clientMessageId, chunk, chunkIndex: i });
    });
    fire(entry.handlers, 'aiResponseComplete', {
      sessionId,
      clientMessageId: first!.clientMessageId,
      content: chunks.join(''),
      finishReason: 'stop',
      totalChunks: chunks.length,
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    const finals = completes(config);
    expect(finals[0].content).toContain('**iPhone 16 Pro**');
    expect(finals[0].content).toContain('29.990.000 VND');
  });

  it('ack status invalid clears pending without creating a stream', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();

    chatService.sendMessage('gợi ý iphone');
    const { payload, ack } = lastSend(entry);
    ack({ accepted: false, duplicate: false, status: 'invalid', clientMessageId: payload.clientMessageId });

    expect(config.onStreamStart).not.toHaveBeenCalled();
    // Only the user message was delivered via onMessage; no assistant reply.
    const msgCalls = config.onMessage.mock.calls as Array<[ChatMessage]>;
    expect(msgCalls.filter(([m]) => m.role === 'assistant')).toHaveLength(0);
    expect(config.onError).toHaveBeenCalled();
  });
});

