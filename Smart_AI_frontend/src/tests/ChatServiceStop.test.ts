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
    onStreamCancelled: vi.fn(),
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
    onStreamCancelled: Mock;
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

/** clientMessageId of the Nth (default first) sendMessage emit. */
function sentClientMessageId(entry: CreatedEntry, index = 0): string {
  const calls = entry.socket.emit.mock.calls as Array<[string, SendPayload]>;
  const sendCalls = calls.filter(([e]) => e === 'sendMessage');
  const [, payload] = sendCalls[index];
  return payload.clientMessageId;
}

/** Create a live-stream placeholder for the Nth send and return its id. */
function startLiveStream(entry: CreatedEntry, index = 0): string {
  const clientMessageId = sentClientMessageId(entry, index);
  fire(entry.handlers, 'aiResponseStart', {
    sessionId: chatService.getSessionId(),
    clientMessageId,
  });
  return clientMessageId;
}

/** Emit a normal messageProcessing cancellation for the given id. */
function cancel(entry: CreatedEntry, clientMessageId: string) {
  fire(entry.handlers, 'messageProcessing', {
    sessionId: chatService.getSessionId(),
    clientMessageId,
    status: 'cancelled',
    reason: 'user_cancelled',
  });
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

describe('ChatService stopGeneration', () => {
  it('initiates a stopGeneration emit for a live stream', () => {
    chatService.initialize(makeConfig());
    const entry = connectedEntry();

    chatService.sendMessage('gợi ý iphone');
    const clientMessageId = startLiveStream(entry);

    const stopped = chatService.stopGeneration(clientMessageId);
    expect(stopped).toBe(true);

    const calls = entry.socket.emit.mock.calls as Array<[string, { sessionId: string; clientMessageId: string }]>;
    const stopCall = calls.find((c) => c[0] === 'stopGeneration');
    expect(stopCall).toBeDefined();
    expect(stopCall?.[1]).toEqual({ sessionId: chatService.getSessionId(), clientMessageId });
  });

  it('refuses to stop when no live stream exists (buffered/deterministic) — no emit', () => {
    chatService.initialize(makeConfig());
    const entry = connectedEntry();

    chatService.sendMessage('gợi ý iphone');
    const clientMessageId = sentClientMessageId(entry);

    // No aiResponseStart -> no live placeholder -> cannot stop.
    const stopped = chatService.stopGeneration(clientMessageId);
    expect(stopped).toBe(false);

    const calls = entry.socket.emit.mock.calls as Array<[string]>;
    expect(calls.some((c) => c[0] === 'stopGeneration')).toBe(false);
  });

  it('messageProcessing cancelled finalizes the placeholder once (keeps partial content)', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();
    const sessionId = chatService.getSessionId();

    chatService.sendMessage('gợi ý iphone');
    const clientMessageId = sentClientMessageId(entry);
    fire(entry.handlers, 'aiResponseStart', { sessionId, clientMessageId });
    fire(entry.handlers, 'aiResponseChunk', { sessionId, clientMessageId, chunk: 'nửa ', chunkIndex: 0 });
    fire(entry.handlers, 'aiResponseChunk', { sessionId, clientMessageId, chunk: 'câu', chunkIndex: 1 });

    cancel(entry, clientMessageId);

    // Partial content was accumulated and delivered via updates.
    const updates = config.onMessageUpdate.mock.calls as Array<[ChatMessage]>;
    expect(updates.at(-1)?.[0].content).toBe('nửa câu');

    // The cancellation callback fires exactly once; no completion.
    expect(config.onStreamCancelled).toHaveBeenCalledTimes(1);
    expect(config.onStreamCancelled).toHaveBeenCalledWith(clientMessageId);
    expect(config.onStreamComplete).not.toHaveBeenCalled();
    expect(config.onProcessingStatus).toHaveBeenCalledWith(false);
  });

  it('a late aiResponseComplete after cancellation is ignored', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();
    const sessionId = chatService.getSessionId();

    chatService.sendMessage('gợi ý iphone');
    const clientMessageId = startLiveStream(entry);
    cancel(entry, clientMessageId);

    fire(entry.handlers, 'aiResponseComplete', {
      sessionId,
      clientMessageId,
      content: 'late',
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    expect(config.onStreamComplete).not.toHaveBeenCalled();
    expect(config.onStreamCancelled).toHaveBeenCalledTimes(1);
  });

  it('isLiveStreaming reflects live placeholder existence', () => {
    chatService.initialize(makeConfig());
    const entry = connectedEntry();
    const sessionId = chatService.getSessionId();

    expect(chatService.isLiveStreaming()).toBe(false);

    chatService.sendMessage('gợi ý iphone');
    const clientMessageId = sentClientMessageId(entry);
    fire(entry.handlers, 'aiResponseStart', { sessionId, clientMessageId });
    expect(chatService.isLiveStreaming()).toBe(true);

    cancel(entry, clientMessageId);
    expect(chatService.isLiveStreaming()).toBe(false);
  });

  it('a cancelled signal for an unknown id is a no-op (no crash)', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();

    fire(entry.handlers, 'messageProcessing', {
      sessionId: chatService.getSessionId(),
      clientMessageId: '6ba7b810-9dad-11d1-80b4-00c04fd430ff',
      status: 'cancelled',
      reason: 'user_cancelled',
    });

    expect(config.onStreamCancelled).not.toHaveBeenCalled();
    expect(config.onProcessingStatus).toHaveBeenCalledWith(false);
  });

  it('a stale duplicate cancelled fires the callback only once', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();

    chatService.sendMessage('gợi ý iphone');
    const clientMessageId = startLiveStream(entry);

    cancel(entry, clientMessageId);
    cancel(entry, clientMessageId);

    expect(config.onStreamCancelled).toHaveBeenCalledTimes(1);
  });

  it('a cancelled stream is not rendered as an assistant bubble and can be re-sent', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();

    chatService.sendMessage('gợi ý iphone');
    const firstId = startLiveStream(entry);
    cancel(entry, firstId);

    // No assistant bubble via onMessage and no completion.
    const msgCalls = config.onMessage.mock.calls as Array<[ChatMessage]>;
    expect(msgCalls.filter(([m]) => m.role === 'assistant')).toHaveLength(0);
    expect(config.onStreamComplete).not.toHaveBeenCalled();

    // A fresh submission is independent (new id).
    chatService.sendMessage('giá Samsung');
    const secondId = sentClientMessageId(entry, 1);
    expect(secondId).not.toBe(firstId);
  });
});

describe('ChatService cancellable generation (Stop from messageProcessing started)', () => {
  /** Emit messageProcessing 'started' for the given id. */
  function started(entry: CreatedEntry, clientMessageId: string) {
    fire(entry.handlers, 'messageProcessing', {
      sessionId: chatService.getSessionId(),
      clientMessageId,
      status: 'started',
    });
  }

  it('isActiveGeneration is true and the id is set from messageProcessing started (before aiResponseStart)', () => {
    chatService.initialize(makeConfig());
    const entry = connectedEntry();

    expect(chatService.isActiveGeneration()).toBe(false);

    chatService.sendMessage('gợi ý iphone');
    const clientMessageId = sentClientMessageId(entry);
    started(entry, clientMessageId);

    // The generation is cancellable DURING the thinking phase, before any
    // aiResponseStart / stream placeholder exists.
    expect(chatService.isActiveGeneration()).toBe(true);
    expect(chatService.getActiveGenerationId()).toBe(clientMessageId);
    expect(chatService.isLiveStreaming()).toBe(false); // no stream placeholder yet
  });

  it('stopGeneration works BEFORE aiResponseStart (during thinking) and emits stopGeneration', () => {
    chatService.initialize(makeConfig());
    const entry = connectedEntry();

    chatService.sendMessage('gợi ý iphone');
    const clientMessageId = sentClientMessageId(entry);
    started(entry, clientMessageId);

    const stopped = chatService.stopGeneration(clientMessageId);
    expect(stopped).toBe(true);

    const calls = entry.socket.emit.mock.calls as Array<[string, { clientMessageId: string }]>;
    const stopCall = calls.find((c) => c[0] === 'stopGeneration');
    expect(stopCall).toBeDefined();
    expect(stopCall?.[1].clientMessageId).toBe(clientMessageId);
  });

  it('Stop stays available from started through aiResponseStart and streaming chunks', () => {
    chatService.initialize(makeConfig());
    const entry = connectedEntry();
    const sessionId = chatService.getSessionId();

    chatService.sendMessage('gợi ý iphone');
    const clientMessageId = sentClientMessageId(entry);
    started(entry, clientMessageId);
    expect(chatService.isActiveGeneration()).toBe(true);
    expect(chatService.getActiveGenerationId()).toBe(clientMessageId);

    // Stream placeholder replaces/joins, same id, Stop still shown.
    fire(entry.handlers, 'aiResponseStart', { sessionId, clientMessageId });
    expect(chatService.getActiveGenerationId()).toBe(clientMessageId);
    expect(chatService.isActiveGeneration()).toBe(true);

    fire(entry.handlers, 'aiResponseChunk', { sessionId, clientMessageId, chunk: 'nửa ', chunkIndex: 0 });
    expect(chatService.isActiveGeneration()).toBe(true);
    expect(chatService.stopGeneration(clientMessageId)).toBe(true);
  });

  it('aiResponseComplete retires the generation (Stop disappears)', () => {
    chatService.initialize(makeConfig());
    const entry = connectedEntry();
    const sessionId = chatService.getSessionId();

    chatService.sendMessage('gợi ý iphone');
    const clientMessageId = sentClientMessageId(entry);
    started(entry, clientMessageId);
    fire(entry.handlers, 'aiResponseStart', { sessionId, clientMessageId });
    fire(entry.handlers, 'aiResponseComplete', {
      sessionId, clientMessageId, content: 'done', timestamp: '2026-01-01T00:00:00.000Z' });
    // The single completion also retires the active generation.
    fire(entry.handlers, 'messageProcessing', {
      sessionId, clientMessageId, status: 'completed' });

    expect(chatService.isActiveGeneration()).toBe(false);
    expect(chatService.getActiveGenerationId()).toBe(null);
    expect(chatService.stopGeneration(clientMessageId)).toBe(false);
  });

  it('a deterministic instant completion (started -> completed) clears Stop with no stale generation', () => {
    chatService.initialize(makeConfig());
    const entry = connectedEntry();
    const sessionId = chatService.getSessionId();

    chatService.sendMessage('gợi ý iphone');
    const clientMessageId = sentClientMessageId(entry);
    started(entry, clientMessageId);
    expect(chatService.isActiveGeneration()).toBe(true);

    // Buffered/deterministic resolves immediately: messageProcessing completed.
    fire(entry.handlers, 'messageProcessing', { sessionId, clientMessageId, status: 'completed' });
    fire(entry.handlers, 'aiResponse', {
      sessionId, message: 'compatibility', clientMessageId, timestamp: '2026-01-01T00:00:00.000Z' });

    expect(chatService.isActiveGeneration()).toBe(false);
    expect(chatService.getActiveGenerationId()).toBe(null);
    expect(chatService.stopGeneration(clientMessageId)).toBe(false);
  });

  it('messageProcessing cancelled clears the active generation and fires onStreamCancelled once', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();
    const sessionId = chatService.getSessionId();

    chatService.sendMessage('gợi ý iphone');
    const clientMessageId = sentClientMessageId(entry);
    started(entry, clientMessageId);
    fire(entry.handlers, 'aiResponseStart', { sessionId, clientMessageId });
    fire(entry.handlers, 'aiResponseChunk', { sessionId, clientMessageId, chunk: 'phần ', chunkIndex: 0 });

    cancel(entry, clientMessageId);

    expect(chatService.isActiveGeneration()).toBe(false);
    expect(chatService.getActiveGenerationId()).toBe(null);
    expect(config.onStreamCancelled).toHaveBeenCalledTimes(1);
    // Partial text preserved on the placeholder.
    const updates = config.onMessageUpdate.mock.calls as Array<[ChatMessage]>;
    expect(updates.at(-1)?.[0].content).toBe('phần ');
  });

  it('a processing (system-level) error event clears the active generation', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();

    chatService.sendMessage('gợi ý iphone');
    const clientMessageId = sentClientMessageId(entry);
    started(entry, clientMessageId);
    expect(chatService.isActiveGeneration()).toBe(true);

    fire(entry.handlers, 'error', { clientMessageId, message: 'boom' });

    expect(chatService.isActiveGeneration()).toBe(false);
    expect(chatService.getActiveGenerationId()).toBe(null);
    expect(config.onError).toHaveBeenCalled();
  });

  it('two concurrent generations are isolated; the latest id drives Stop and stopping one does not disturb the other', () => {
    chatService.initialize(makeConfig());
    const entry = connectedEntry();

    chatService.sendMessage('iphone');
    const idA = sentClientMessageId(entry, 0);
    started(entry, idA);

    chatService.sendMessage('samsung');
    const idB = sentClientMessageId(entry, 1);
    started(entry, idB);

    // The most recent accepted generation drives the Stop control.
    expect(chatService.getActiveGenerationId()).toBe(idB);

    // Cancelling B retires only B; A (still active) remains cancellable by id.
    cancel(entry, idB);
    expect(chatService.stopGeneration(idA)).toBe(true);
    expect(chatService.isActiveGeneration()).toBe(true); // A is still active
    // The most recent accepted generation is B, so the id getter no longer
    // points at a retired id.
    expect(chatService.stopGeneration(idB)).toBe(false);
  });

  it('a late aiResponseComplete after cancellation does not resurrect a cancelled generation', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();
    const sessionId = chatService.getSessionId();

    chatService.sendMessage('gợi ý iphone');
    const clientMessageId = sentClientMessageId(entry);
    started(entry, clientMessageId);
    // Create the stream placeholder so a cancellation has a bubble to finalize.
    fire(entry.handlers, 'aiResponseStart', { sessionId, clientMessageId });
    cancel(entry, clientMessageId);

    fire(entry.handlers, 'aiResponseComplete', {
      sessionId, clientMessageId, content: 'late', timestamp: '2026-01-01T00:00:00.000Z' });

    expect(config.onStreamComplete).not.toHaveBeenCalled();
    expect(config.onStreamCancelled).toHaveBeenCalledTimes(1);
    expect(chatService.isActiveGeneration()).toBe(false);
  });

  it('a fresh submission creates a new active generation after a terminal one', () => {
    chatService.initialize(makeConfig());
    const entry = connectedEntry();
    const sessionId = chatService.getSessionId();

    chatService.sendMessage('iphone');
    const firstId = sentClientMessageId(entry, 0);
    started(entry, firstId);
    fire(entry.handlers, 'messageProcessing', { sessionId, clientMessageId: firstId, status: 'completed' });
    expect(chatService.isActiveGeneration()).toBe(false);

    chatService.sendMessage('samsung');
    const secondId = sentClientMessageId(entry, 1);
    started(entry, secondId);
    expect(chatService.isActiveGeneration()).toBe(true);
    expect(chatService.getActiveGenerationId()).toBe(secondId);
    expect(secondId).not.toBe(firstId);
    expect(chatService.stopGeneration(secondId)).toBe(true);
  });

  it('isActiveGeneration is cleared on disconnect', () => {
    chatService.initialize(makeConfig());
    const entry = connectedEntry();

    chatService.sendMessage('iphone');
    const clientMessageId = sentClientMessageId(entry);
    started(entry, clientMessageId);
    expect(chatService.isActiveGeneration()).toBe(true);

    chatService.disconnect();
    expect(chatService.isActiveGeneration()).toBe(false);
    expect(chatService.stopGeneration(clientMessageId)).toBe(false);
  });
});