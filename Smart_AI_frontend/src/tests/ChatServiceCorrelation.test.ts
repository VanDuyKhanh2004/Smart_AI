import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import chatService from '@/services/chat.service';
import type { ChatMessage, ChatServiceConfig, SendAck } from '@/services/chat.service';

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
  onMessage: Mock;
  onError: Mock;
  onConnected: Mock;
  onDisconnected: Mock;
  onProcessingStatus: Mock;
};

function makeConfig() {
  return {
    onMessage: vi.fn(),
    onError: vi.fn(),
    onConnected: vi.fn(),
    onDisconnected: vi.fn(),
    onProcessingStatus: vi.fn(),
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

interface SendPayload {
  sessionId: string;
  message: string;
  clientMessageId: string;
}

function lastSend(entry: CreatedEntry): {
  payload: SendPayload;
  ack: (a: SendAck) => void;
} {
  const calls = entry.socket.emit.mock.calls as Array<[string, SendPayload, (a: SendAck) => void]>;
  const [, payload, ack] = calls[calls.length - 1];
  return { payload, ack };
}

function assistantMessages(config: ReturnType<typeof makeConfig>) {
  const calls = config.onMessage.mock.calls as Array<[ChatMessage]>;
  return calls.map(([m]) => m).filter((m) => m.role === 'assistant');
}

beforeEach(() => {
  created.length = 0;
  ioMock.mockClear();
  localStorage.clear();
  vi.clearAllMocks();
  localStorage.setItem(ACCESS_TOKEN_KEY, 'tok');
  // Reset singleton correlation state between tests.
  chatService.resetSession();
});

afterEach(() => {
  chatService.disconnect();
});

describe('ChatService message correlation', () => {
  it('two independent submissions with identical content get distinct clientMessageIds and two emits', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();

    const first = chatService.sendMessage('Xin chào');
    const second = chatService.sendMessage('Xin chào');

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first?.clientMessageId).not.toBe(second?.clientMessageId);
    expect(entry.socket.emit).toHaveBeenCalledTimes(2);

    const ids = entry.socket.emit.mock.calls.map((c) => (c[1] as SendPayload).clientMessageId);
    expect(ids[0]).not.toBe(ids[1]);

    const userMessages = (config.onMessage.mock.calls as Array<[ChatMessage]>).map(([m]) => m);
    expect(userMessages).toHaveLength(2);
  });

  it('every sendMessage call emits a fresh clientMessageId (no content collapse)', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();

    chatService.sendMessage('Xin chào');
    chatService.sendMessage('Xin chào');
    chatService.sendMessage('Xin chào');

    expect(entry.socket.emit).toHaveBeenCalledTimes(3);
    const ids = entry.socket.emit.mock.calls.map((c) => (c[1] as SendPayload).clientMessageId);
    expect(new Set(ids).size).toBe(3);
  });

  it('the completed ack is just a receipt: the replay aiResponse does the finishing, not the ack', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();

    chatService.sendMessage('Xin chào');
    const { payload, ack } = lastSend(entry);

    // A completed (duplicate) ack is a DELIVERY receipt, not a completion.
    // The pending slot is still held at this point; freeing it is the job of
    // the correlated aiResponse (the replayed/stored reply the server sends).
    ack({ accepted: false, duplicate: true, status: 'completed', clientMessageId: payload.clientMessageId });
    expect(config.onProcessingStatus).not.toHaveBeenCalledWith(false);

    // Deliver the replayed aiResponse; only now is the message finished.
    fire(entry.handlers, 'aiResponse', {
      sessionId: chatService.getSessionId(),
      clientMessageId: payload.clientMessageId,
      message: 'Chào bạn',
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    expect(config.onMessage.mock.calls.map(([m]) => m).some((m) => m.role === 'assistant')).toBe(true);
    expect(config.onProcessingStatus).toHaveBeenCalledWith(false);

    // The slot was freed by aiResponse, so a fresh submission still goes out.
    const second = chatService.sendMessage('Xin chào');
    expect(second).not.toBeNull();
    expect(second?.id).not.toBe(payload.clientMessageId);
    expect(entry.socket.emit).toHaveBeenCalledTimes(2);
  });

  it('renders a duplicate/replayed aiResponse exactly once per clientMessageId', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();

    chatService.sendMessage('Xin chào');
    const ai = {
      sessionId: chatService.getSessionId(),
      clientMessageId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      message: 'Chào bạn',
      timestamp: '2026-01-01T00:00:00.000Z',
    };
    fire(entry.handlers, 'aiResponse', ai);
    fire(entry.handlers, 'aiResponse', ai);

    const assistants = assistantMessages(config);
    expect(assistants).toHaveLength(1);
    expect(assistants[0].content).toBe('Chào bạn');
    expect(assistants[0].clientMessageId).toBe('6ba7b810-9dad-11d1-80b4-00c04fd430c8');
  });

  it('renders separate responses for different clientMessageIds with identical text', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();

    chatService.sendMessage('Xin chào');
    fire(entry.handlers, 'aiResponse', {
      sessionId: chatService.getSessionId(),
      clientMessageId: 'aaaaaaaa-b7da-11d1-80b4-00c04fd430c8',
      message: 'trả lời',
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    fire(entry.handlers, 'aiResponse', {
      sessionId: chatService.getSessionId(),
      clientMessageId: 'bbbbbbbb-c8ea-22d2-80b4-00c04fd430c9',
      message: 'trả lời',
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    expect(assistantMessages(config)).toHaveLength(2);
  });

  it('frees the pending slot on a correlated socket error event (manual resend allowed)', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();

    chatService.sendMessage('Xin chào');
    const { payload } = lastSend(entry);

    // Terminal failure arrives via the correlated socket 'error' event, which
    // fails and clears the pending entry so the user can send again.
    fire(entry.handlers, 'error', {
      type: 'PROCESSING_ERROR',
      clientMessageId: payload.clientMessageId,
      message: 'Lỗi khi xử lý tin nhắn. Vui lòng thử lại sau.',
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    expect(config.onError).toHaveBeenCalledWith('Lỗi khi xử lý tin nhắn. Vui lòng thử lại sau.');
    expect(config.onProcessingStatus).toHaveBeenCalledWith(false);

    const retry = chatService.sendMessage('Xin chào');
    expect(retry).not.toBeNull();
    expect(retry?.id).not.toBe(payload.clientMessageId);
    expect(entry.socket.emit).toHaveBeenCalledTimes(2);
  });

  it('an invalid ack surfaces an error and frees the pending slot', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();

    chatService.sendMessage('Xin chào');
    const { payload, ack } = lastSend(entry);
    ack({ accepted: false, duplicate: false, status: 'invalid', clientMessageId: payload.clientMessageId });

    expect(config.onError).toHaveBeenCalledWith('Tin nhắn không hợp lệ');
    expect(config.onProcessingStatus).toHaveBeenCalledWith(false);

    const retry = chatService.sendMessage('Xin chào');
    expect(retry).not.toBeNull();
    expect(entry.socket.emit).toHaveBeenCalledTimes(2);
  });

  it('disconnect frees pending slots', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();

    chatService.sendMessage('Xin chào');
    chatService.disconnect();

    expect(entry.socket.disconnect).toHaveBeenCalled();
    const retry = chatService.sendMessage('Xin chào');
    expect(retry).toBeNull(); // not connected
  });

  it('resetSession clears pending and rendered-response state', () => {
    const config = makeConfig();
    chatService.initialize(config);
    const entry = connectedEntry();

    const originalSession = chatService.getSessionId();
    chatService.sendMessage('Xin chào');
    fire(entry.handlers, 'aiResponse', {
      sessionId: originalSession,
      clientMessageId: 'aaaaaaaa-b7da-11d1-80b4-00c04fd430c8',
      message: 'trả lời trước',
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    expect(assistantMessages(config)).toHaveLength(1);

    chatService.resetSession();
    expect(chatService.getSessionId()).not.toBe(originalSession);

    // After a new session, a fresh submission and response are rendered again.
    chatService.sendMessage('Xin chào');
    fire(entry.handlers, 'aiResponse', {
      sessionId: chatService.getSessionId(),
      clientMessageId: 'aaaaaaaa-bbbb-11d1-80b4-00c04fd430c8',
      message: 'trả lời sau',
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    expect(assistantMessages(config)).toHaveLength(2);
  });
});