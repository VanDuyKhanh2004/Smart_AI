import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import chatService from '@/services/chat.service';
import type { ChatMessage, ChatServiceConfig, RegenerateAck, RetryAck } from '@/services/chat.service';

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

type MockConfig = {
  onRetryStarted: Mock;
  onRegenerateAccepted: Mock;
  onRegenerateStarted: Mock;
  onRegenerateUpdate: Mock;
  onRegenerateComplete: Mock;
  onRegenerateFailed: Mock;
  onRegenerateCancelled: Mock;
  onTurnRetryable: Mock;
  onStreamStart: Mock;
  onStreamCancelled: Mock;
  onStreamError: Mock;
  onError: Mock;
  onProcessingStatus: Mock;
};

function makeConfig() {
  return {
    onMessage: vi.fn(),
    onError: vi.fn(),
    onConnected: vi.fn(),
    onDisconnected: vi.fn(),
    onProcessingStatus: vi.fn(),
    onRetryStarted: vi.fn(),
    onRegenerateAccepted: vi.fn(),
    onRegenerateStarted: vi.fn(),
    onRegenerateUpdate: vi.fn(),
    onRegenerateComplete: vi.fn(),
    onRegenerateFailed: vi.fn(),
    onRegenerateCancelled: vi.fn(),
    onTurnRetryable: vi.fn(),
    onStreamStart: vi.fn(),
    onStreamCancelled: vi.fn(),
    onStreamError: vi.fn(),
  } as unknown as ChatServiceConfig & MockConfig;
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

function lastAiCall(emit: Mock<(...args: unknown[]) => void>): {
  event: string;
  payload: Record<string, unknown>;
  ack: (a: RetryAck | RegenerateAck) => void;
} {
  const calls = emit.mock.calls as Array<
    [string, Record<string, unknown>, (a: RetryAck | RegenerateAck) => void]
  >;
  const [event, payload, ack] = calls[calls.length - 1];
  return { event, payload, ack };
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

describe('ChatService Retry', () => {
  it('retryMessage emits the retryMessage event for the logical turn and makes it cancellable on accept', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();

    const clientMessageId = 'turn-1';
    expect(chatService.retryMessage(clientMessageId)).toBe(true);

    const { event, payload, ack } = lastAiCall(entry.socket.emit);
    expect(event).toBe('retryMessage');
    expect(payload).toMatchObject({ sessionId: chatService.getSessionId(), clientMessageId });

    ack({
      accepted: true,
      duplicate: false,
      status: 'accepted',
      clientMessageId,
      generationId: clientMessageId,
    });
    expect(chatService.getActiveGenerationId()).toBe(clientMessageId);
    expect(chatService.isActiveGeneration()).toBe(true);
    // Stop by the attempt identity (== logical id for retry) must be possible.
    expect(chatService.stopGenerationAttempt(clientMessageId)).toBe(true);
  });

  it('retry rejections surface user-facing errors', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();

    chatService.retryMessage('turn-1');
    lastAiCall(entry.socket.emit).ack({
      accepted: false,
      duplicate: false,
      status: 'already_completed',
      clientMessageId: 'turn-1',
      generationId: null,
    });
    expect(config.onError).toHaveBeenCalledWith(expect.stringContaining('Regenerate'));

    chatService.retryMessage('turn-2');
    lastAiCall(entry.socket.emit).ack({
      accepted: false,
      duplicate: false,
      status: 'not_found',
      clientMessageId: 'turn-2',
      generationId: null,
    });
    expect(config.onError).toHaveBeenCalledWith(expect.stringContaining('thử lại'));
  });
});

describe('ChatService Regenerate', () => {
  const LOGICAL = 'turn-1';
  const GEN = 'gen-fresh-1';

  it('regenerateMessage emits the event (original logical id) and records the fresh generationId', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();

    expect(chatService.regenerateMessage(LOGICAL, 'câu trả lời cũ')).toBe(true);
    const { event, payload, ack } = lastAiCall(entry.socket.emit);
    expect(event).toBe('regenerateMessage');
    expect(payload).toMatchObject({ sessionId: chatService.getSessionId(), clientMessageId: LOGICAL });

    ack({ accepted: true, status: 'accepted', clientMessageId: LOGICAL, generationId: GEN });
    expect(config.onRegenerateAccepted).toHaveBeenCalledWith(LOGICAL, GEN);
    // The fresh attempt is cancellable from the boundary.
    expect(chatService.getActiveGenerationId()).toBe(GEN);
    expect(chatService.stopGenerationAttempt(GEN)).toBe(true);
  });

  it('streams a regenerate replacement into the SAME logical bubble (started/update/complete)', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();

    chatService.regenerateMessage(LOGICAL, 'previous content');
    lastAiCall(entry.socket.emit).ack({ accepted: true, status: 'accepted', clientMessageId: LOGICAL, generationId: GEN });

    fire(entry.handlers, 'aiResponseStart', {
      sessionId: chatService.getSessionId(),
      clientMessageId: LOGICAL,
      generationId: GEN,
    });
    expect(config.onRegenerateStarted).toHaveBeenCalledWith(LOGICAL, GEN);

    fire(entry.handlers, 'aiResponseChunk', {
      sessionId: chatService.getSessionId(),
      clientMessageId: LOGICAL,
      generationId: GEN,
      chunk: 'Xin',
      chunkIndex: 0,
    });
    fire(entry.handlers, 'aiResponseChunk', {
      sessionId: chatService.getSessionId(),
      clientMessageId: LOGICAL,
      generationId: GEN,
      chunk: ' chào',
      chunkIndex: 1,
    });
    expect(config.onRegenerateUpdate).toHaveBeenNthCalledWith(1, LOGICAL, GEN, 'Xin');
    expect(config.onRegenerateUpdate).toHaveBeenNthCalledWith(2, LOGICAL, GEN, 'Xin chào');

    fire(entry.handlers, 'aiResponseComplete', {
      sessionId: chatService.getSessionId(),
      clientMessageId: LOGICAL,
      generationId: GEN,
      content: 'Câu trả lời mới',
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    expect(config.onRegenerateComplete).toHaveBeenCalledWith(
      LOGICAL,
      GEN,
      'Câu trả lời mới',
      new Date('2026-01-01T00:00:00.000Z'),
    );
    // The attempt finished: Stop is no longer available.
    expect(chatService.isActiveGeneration()).toBe(false);
  });

  it('a failed regenerate surfaces onRegenerateFailed', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();

    chatService.regenerateMessage(LOGICAL, 'previous content');
    lastAiCall(entry.socket.emit).ack({ accepted: true, status: 'accepted', clientMessageId: LOGICAL, generationId: GEN });

    fire(entry.handlers, 'error', {
      type: 'PROCESSING_ERROR',
      sessionId: chatService.getSessionId(),
      clientMessageId: LOGICAL,
      generationId: GEN,
      message: 'Đã xảy ra lỗi khi tạo lại câu trả lời',
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    expect(config.onRegenerateFailed).toHaveBeenCalledWith(LOGICAL, GEN);
    expect(config.onError).toHaveBeenCalledWith(expect.stringContaining('lỗi'));
    expect(chatService.isActiveGeneration()).toBe(false);
  });

  it('a cancelled regenerate attempt restores via onRegenerateCancelled', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();

    chatService.regenerateMessage(LOGICAL, 'previous content');
    lastAiCall(entry.socket.emit).ack({ accepted: true, status: 'accepted', clientMessageId: LOGICAL, generationId: GEN });

    fire(entry.handlers, 'messageProcessing', {
      sessionId: chatService.getSessionId(),
      clientMessageId: LOGICAL,
      generationId: GEN,
      status: 'cancelled',
    });
    expect(config.onRegenerateCancelled).toHaveBeenCalledWith(LOGICAL, GEN);
    expect(chatService.isActiveGeneration()).toBe(false);
  });

  it('rejects already_processing / not_completed with an error string', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();

    chatService.regenerateMessage(LOGICAL, 'old');
    lastAiCall(entry.socket.emit).ack({
      accepted: false,
      status: 'already_processing',
      clientMessageId: LOGICAL,
      generationId: null,
    });
    expect(config.onError).toHaveBeenCalledWith(expect.stringContaining('đang được xử lý'));

    chatService.regenerateMessage('turn-2', 'old');
    lastAiCall(entry.socket.emit).ack({
      accepted: false,
      status: 'not_completed',
      clientMessageId: 'turn-2',
      generationId: null,
    });
    expect(config.onError).toHaveBeenCalledWith(expect.stringContaining('tạo lại'));
  });

  it('every regenerate click mints a distinct generationId (no cross-attempt confusion)', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();

    chatService.regenerateMessage(LOGICAL, 'old');
    lastAiCall(entry.socket.emit).ack({ accepted: true, status: 'accepted', clientMessageId: LOGICAL, generationId: 'gen-a' });
    chatService.regenerateMessage(LOGICAL, 'old');
    lastAiCall(entry.socket.emit).ack({ accepted: true, status: 'accepted', clientMessageId: LOGICAL, generationId: 'gen-b' });

    expect(config.onRegenerateAccepted).toHaveBeenNthCalledWith(1, LOGICAL, 'gen-a');
    expect(config.onRegenerateAccepted).toHaveBeenNthCalledWith(2, LOGICAL, 'gen-b');
    expect(chatService.getActiveGenerationId()).toBe('gen-b');
  });

  it('stream events carrying an unregistered (ordinary) generationId never touch regenerate state', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();

    // Ordinary sends also carry a generationId on stream events, but it is never
    // registered as a regenerate attempt, so it must be routed as a normal turn.
    chatService.sendMessage('Xin chào');
    fire(entry.handlers, 'aiResponseStart', {
      sessionId: chatService.getSessionId(),
      clientMessageId: 'ordinary-logical',
      generationId: 'ordinary-logical',
    });
    expect(config.onRegenerateStarted).not.toHaveBeenCalled();
    expect(config.onMessage).toHaveBeenCalled();
  });
});

describe('ChatService early-cancelled / early-failed turn retryable', () => {
  const LOGICAL = 'turn-early';

  it('early cancelled generation with no aiResponseStart marks the logical turn retryable', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();
    const sessionId = chatService.getSessionId();

    chatService.sendMessage('Yêu cầu dài để test');
    // A turn is only cancellable once messageProcessing 'started' arrives.
    fire(entry.handlers, 'messageProcessing', { sessionId, clientMessageId: LOGICAL, status: 'started' });

    // Stop before any aiResponseStart.
    fire(entry.handlers, 'messageProcessing', {
      sessionId,
      clientMessageId: LOGICAL,
      status: 'cancelled',
      reason: 'user_cancelled',
    });

    expect(config.onTurnRetryable).toHaveBeenCalledWith(LOGICAL, 'cancelled');
    expect(config.onStreamCancelled).not.toHaveBeenCalled();
    // The generic loading state is cleared.
    expect(config.onProcessingStatus).toHaveBeenCalledWith(false);
  });

  it('early cancelled turn does NOT create any assistant placeholder', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();
    const sessionId = chatService.getSessionId();

    chatService.sendMessage('Yêu cầu dài để test');
    fire(entry.handlers, 'messageProcessing', { sessionId, clientMessageId: LOGICAL, status: 'started' });
    fire(entry.handlers, 'messageProcessing', {
      sessionId, clientMessageId: LOGICAL, status: 'cancelled', reason: 'user_cancelled' });

    // No aiResponseStart ever fired -> no stream placeholder was created.
    expect(config.onStreamStart).not.toHaveBeenCalled();
    const assistants = (config.onMessage as Mock).mock.calls.filter(([m]) => (m as ChatMessage).role === 'assistant');
    expect(assistants).toHaveLength(0);
  });

  it('early cancelled retry is retryable again (repeat lifecycle)', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();
    const sessionId = chatService.getSessionId();

    // First: early cancel marks retryable.
    chatService.sendMessage('Yêu cầu dài để test');
    fire(entry.handlers, 'messageProcessing', { sessionId, clientMessageId: LOGICAL, status: 'started' });
    fire(entry.handlers, 'messageProcessing', { sessionId, clientMessageId: LOGICAL, status: 'cancelled', reason: 'user_cancelled' });
    expect(config.onTurnRetryable).toHaveBeenCalledWith(LOGICAL, 'cancelled');

    // Retry starts (reuses the same logical id).
    chatService.retryMessage(LOGICAL);
    lastAiCall(entry.socket.emit).ack({ accepted: true, duplicate: false, status: 'accepted', clientMessageId: LOGICAL, generationId: LOGICAL });
    fire(entry.handlers, 'messageProcessing', { sessionId, clientMessageId: LOGICAL, status: 'started' });

    // Stop the retry BEFORE first token -> retryable again.
    fire(entry.handlers, 'messageProcessing', {
      sessionId, clientMessageId: LOGICAL, status: 'cancelled', reason: 'user_cancelled' });
    expect(config.onTurnRetryable).toHaveBeenCalledWith(LOGICAL, 'cancelled');
    expect(config.onStreamCancelled).not.toHaveBeenCalled();
  });

  it('early cancelled turn with NO in-flight state is NOT reconstructed as retryable', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();
    const sessionId = chatService.getSessionId();

    // A stray cancelled for an id that was never in-flight must not create a
    // retry from an arbitrary user-only bubble.
    fire(entry.handlers, 'messageProcessing', {
      sessionId,
      clientMessageId: '6ba7b810-9dad-11d1-80b4-00c04fd430de',
      status: 'cancelled',
      reason: 'user_cancelled',
    });
    expect(config.onTurnRetryable).not.toHaveBeenCalled();
  });

  it('early correlated error marks the user turn retryable as failed', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();
    const sessionId = chatService.getSessionId();

    chatService.sendMessage('Yêu cầu dài để test');
    fire(entry.handlers, 'messageProcessing', { sessionId, clientMessageId: LOGICAL, status: 'started' });

    fire(entry.handlers, 'error', {
      type: 'PROCESSING_ERROR',
      sessionId,
      clientMessageId: LOGICAL,
      message: 'Lỗi khi xử lý tin nhắn',
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    expect(config.onTurnRetryable).toHaveBeenCalledWith(LOGICAL, 'failed');
    // No placeholder was ever created (the failure preceded aiResponseStart).
    expect(config.onStreamError).not.toHaveBeenCalled();
  });

  it('a partial assistant cancellation shows Retry via the assistant stream, not the user turn', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();
    const sessionId = chatService.getSessionId();

    chatService.sendMessage('Yêu cầu dài để test');
    fire(entry.handlers, 'messageProcessing', { sessionId, clientMessageId: LOGICAL, status: 'started' });
    // A live stream DID start -> an assistant placeholder exists.
    fire(entry.handlers, 'aiResponseStart', { sessionId, clientMessageId: LOGICAL });
    fire(entry.handlers, 'aiResponseChunk', { sessionId, clientMessageId: LOGICAL, chunk: 'nửa ', chunkIndex: 0 });

    fire(entry.handlers, 'messageProcessing', {
      sessionId, clientMessageId: LOGICAL, status: 'cancelled', reason: 'user_cancelled' });

    // Partial content preserved + assistant bubble hosts the retry (onStreamCancelled).
    expect(config.onStreamCancelled).toHaveBeenCalledWith(LOGICAL);
    expect(config.onTurnRetryable).not.toHaveBeenCalled(); // modal on user turn NOT used
  });

  it('a partial assistant correlated error preserves content and shows retry on the assistant', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();
    const sessionId = chatService.getSessionId();

    chatService.sendMessage('Yêu cầu dài để test');
    fire(entry.handlers, 'messageProcessing', { sessionId, clientMessageId: LOGICAL, status: 'started' });
    fire(entry.handlers, 'aiResponseStart', { sessionId, clientMessageId: LOGICAL });
    fire(entry.handlers, 'aiResponseChunk', { sessionId, clientMessageId: LOGICAL, chunk: 'nửa ', chunkIndex: 0 });

    fire(entry.handlers, 'error', {
      type: 'PROCESSING_ERROR',
      sessionId,
      clientMessageId: LOGICAL,
      message: 'Lỗi khi xử lý tin nhắn',
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    expect(config.onStreamError).toHaveBeenCalledWith(LOGICAL);
    expect(config.onTurnRetryable).not.toHaveBeenCalled();
  });
});