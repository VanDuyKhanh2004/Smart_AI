import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import chatService from '@/services/chat.service';
import type { ChatServiceConfig } from '@/services/chat.service';
import { useAuthStore } from '@/stores/authStore';
import { authService } from '@/services/auth.service';

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

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

vi.mock('@/services/auth.service', () => ({
  authService: {
    logout: vi.fn(() => Promise.resolve()),
  },
}));

function makeConfig() {
  return {
    onMessage: vi.fn(),
    onError: vi.fn(),
    onConnected: vi.fn(),
    onDisconnected: vi.fn(),
    onProcessingStatus: vi.fn(),
  } as unknown as ChatServiceConfig;
}

function fire(handlers: Map<string, EventHandler[]>, event: string, ...args: unknown[]) {
  const list = handlers.get(event) ?? [];
  for (const cb of list) {
    cb(...args);
  }
}

function authOptions() {
  const lastCall = ioMock.mock.calls[ioMock.mock.calls.length - 1];
  return (lastCall?.[1] ?? {}) as { auth?: { token?: string } };
}

beforeEach(() => {
  created.length = 0;
  ioMock.mockClear();
  localStorage.clear();
  vi.clearAllMocks();
  useAuthStore.setState({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
  });
});

afterEach(() => {
  chatService.disconnect();
});

describe('ChatService socket authentication', () => {
  it('sends the access token from localStorage via handshake auth.token', () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'test-access-token');

    chatService.initialize(makeConfig());

    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(authOptions().auth).toEqual({ token: 'test-access-token' });
  });

  it('does not call io() and reports login-required locally when no token is stored', () => {
    const config = makeConfig();

    chatService.initialize(config);

    expect(ioMock).not.toHaveBeenCalled();
    expect(created.length).toBe(0);
    expect(config.onError).toHaveBeenCalledWith('Vui lòng đăng nhập để sử dụng chat');
    expect(config.onDisconnected).toHaveBeenCalled();
    expect(config.onConnected).not.toHaveBeenCalled();
  });

  it('repeated initialization without a token creates zero sockets', () => {
    const config = makeConfig();

    chatService.initialize(config);
    chatService.initialize(config);

    expect(ioMock).not.toHaveBeenCalled();
    expect(created.length).toBe(0);
  });

  it('maps auth error codes to Vietnamese messages and disconnects (no infinite retry)', () => {
    const cases: Array<{ code: string; message: string }> = [
      { code: 'SOCKET_AUTH_REQUIRED', message: 'Vui lòng đăng nhập để sử dụng chat' },
      { code: 'SOCKET_AUTH_INVALID', message: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.' },
      { code: 'SOCKET_AUTH_EXPIRED', message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' },
      { code: 'SOCKET_USER_NOT_FOUND', message: 'Tài khoản không tồn tại. Vui lòng đăng nhập lại.' },
    ];

    for (const testCase of cases) {
      created.length = 0;
      ioMock.mockClear();

      const config = makeConfig();
      localStorage.setItem(ACCESS_TOKEN_KEY, 'tok');
      chatService.initialize(config);
      const entry = created[0];
      expect(entry).toBeDefined();

      fire(entry.handlers, 'connect_error', { data: { code: testCase.code } });

      expect(config.onError).toHaveBeenCalledWith(testCase.message);
      expect(config.onProcessingStatus).toHaveBeenCalledWith(false);
      expect(entry.socket.disconnect).toHaveBeenCalled();
    }
  });

  it('keeps reconnection allowed for non-auth connection errors', () => {
    const config = makeConfig();
    localStorage.setItem(ACCESS_TOKEN_KEY, 'tok');
    chatService.initialize(config);
    const entry = created[0];

    fire(entry.handlers, 'connect_error', new Error('xhr poll error'));

    expect(config.onError).toHaveBeenCalledWith('Không thể kết nối đến server chat');
    expect(entry.socket.disconnect).not.toHaveBeenCalled();
  });

  it('reconnects with a fresh token via reconnectWithToken', () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'old-token');
    chatService.initialize(makeConfig());
    expect(ioMock).toHaveBeenCalledTimes(1);
    const first = created[0];

    localStorage.setItem(ACCESS_TOKEN_KEY, 'new-token');
    chatService.reconnectWithToken();

    expect(ioMock).toHaveBeenCalledTimes(2);
    expect(first.socket.disconnect).toHaveBeenCalled();
    expect(authOptions().auth).toEqual({ token: 'new-token' });
  });

  it('creates a socket with an explicit token when none exists (syncAuthentication)', () => {
    chatService.syncAuthentication('explicit-token');

    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(authOptions().auth).toEqual({ token: 'explicit-token' });
  });

  it('re-reads the token from localStorage when syncAuthentication is called without an argument', () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'old-token');
    chatService.initialize(makeConfig());
    expect(ioMock).toHaveBeenCalledTimes(1);
    const first = created[0];

    localStorage.setItem(ACCESS_TOKEN_KEY, 'stored-token');
    chatService.syncAuthentication();

    expect(ioMock).toHaveBeenCalledTimes(2);
    expect(first.socket.disconnect).toHaveBeenCalled();
    expect(authOptions().auth).toEqual({ token: 'stored-token' });
  });

  it('disconnects the socket and creates no replacement when syncAuthentication(null) is called', () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'tok');
    const config = makeConfig();
    chatService.initialize(config);
    expect(ioMock).toHaveBeenCalledTimes(1);
    const entry = created[0];

    chatService.syncAuthentication(null);

    expect(entry.socket.disconnect).toHaveBeenCalled();
    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(config.onError).toHaveBeenCalledWith('Vui lòng đăng nhập để sử dụng chat');
  });

  it('does not recreate the socket when the token is unchanged (syncAuthentication is idempotent)', () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'same-token');
    chatService.initialize(makeConfig());
    expect(ioMock).toHaveBeenCalledTimes(1);

    chatService.syncAuthentication('same-token');

    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(created[0].socket.disconnect).not.toHaveBeenCalled();
  });

  it('reconnects with the new token when syncAuthentication receives a different token', () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'old-token');
    chatService.initialize(makeConfig());
    expect(ioMock).toHaveBeenCalledTimes(1);
    const first = created[0];

    chatService.syncAuthentication('new-token');

    expect(ioMock).toHaveBeenCalledTimes(2);
    expect(first.socket.disconnect).toHaveBeenCalled();
    expect(authOptions().auth).toEqual({ token: 'new-token' });
  });

  it('keeps emitting the same sendMessage event with sessionId and message', () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'tok');
    const config = makeConfig();
    chatService.initialize(config);
    const entry = created[0];

    fire(entry.handlers, 'connect');
    expect(config.onConnected).toHaveBeenCalled();

    const userMessage = chatService.sendMessage('Xin chào');
    expect(userMessage).not.toBeNull();
    expect(entry.socket.emit).toHaveBeenCalledWith('sendMessage', {
      sessionId: chatService.getSessionId(),
      message: 'Xin chào',
    });
    expect(config.onMessage).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'user', content: 'Xin chào' })
    );
  });

  it('delivers aiResponse to onMessage when the sessionId matches', () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'tok');
    const config = makeConfig();
    chatService.initialize(config);
    const entry = created[0];

    fire(entry.handlers, 'aiResponse', {
      sessionId: chatService.getSessionId(),
      message: 'Chào bạn',
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    expect(config.onMessage).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'assistant', content: 'Chào bạn' })
    );
    expect(config.onProcessingStatus).toHaveBeenCalledWith(false);
  });

  it('ignores aiResponse for a different sessionId', () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'tok');
    const config = makeConfig();
    chatService.initialize(config);
    const entry = created[0];

    fire(entry.handlers, 'aiResponse', {
      sessionId: 'other-session',
      message: 'Chào bạn',
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    expect(config.onMessage).not.toHaveBeenCalled();
  });
});

describe('ChatService disconnect on logout', () => {
  it('disconnects the live chat socket when the user logs out', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'tok');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'rtok');

    const config = makeConfig();
    chatService.initialize(config);
    const entry = created[0];

    await useAuthStore.getState().logout();

    expect(authService.logout).toHaveBeenCalledTimes(1);
    expect(entry.socket.disconnect).toHaveBeenCalled();
    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('logout does not produce SOCKET_AUTH_REQUIRED and causes no new connection', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'tok');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'rtok');

    const config = makeConfig();
    chatService.initialize(config);
    const entry = created[0];
    expect(ioMock).toHaveBeenCalledTimes(1);

    await useAuthStore.getState().logout();

    // A stale handshake failure arriving after logout must be ignored.
    fire(entry.handlers, 'connect_error', { data: { code: 'SOCKET_AUTH_REQUIRED' } });

    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(config.onError).toHaveBeenCalledTimes(1);
    expect(config.onError).toHaveBeenCalledWith('Vui lòng đăng nhập để sử dụng chat');
  });
});
