import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import chatService from '@/services/chat.service';
import type { ChatServiceConfig } from '@/services/chat.service';
import { useAuthStore } from '@/stores/authStore';
import { authService } from '@/services/auth.service';
import { getSelectedSession, getRestoreMode } from '@/services/chatPersistence';
import type { User } from '@/types/auth.type';

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const SELECTED_SESSION_KEY = 'SMART_AI_SELECTED_CHAT_SESSION';
const RESTORE_MODE_KEY = 'SMART_AI_CHAT_RESTORE_MODE';

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
    login: vi.fn(),
    logout: vi.fn(() => Promise.resolve()),
    getMe: vi.fn(),
    refreshToken: vi.fn(),
  },
}));

vi.mock('@/services/cart.service', () => ({
  cartService: {
    getCart: vi.fn(() => Promise.resolve({ data: { items: [] } })),
    mergeCart: vi.fn(() => Promise.resolve({ data: { items: [] } })),
  },
}));

vi.mock('@/services/wishlist.service', () => ({
  wishlistService: {
    getWishlist: vi.fn(() => Promise.resolve({ data: { items: [] } })),
  },
}));

const mockUser = {
  _id: 'user1',
  name: 'Test User',
  email: 'test@example.com',
  role: 'user',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
} as User;

function makeConfig() {
  return {
    onMessage: vi.fn(),
    onError: vi.fn(),
    onConnected: vi.fn(),
    onDisconnected: vi.fn(),
    onProcessingStatus: vi.fn(),
  } as unknown as ChatServiceConfig;
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
  chatService.disconnect();
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

describe('authStore.login syncs the chat socket', () => {
  it('persists the token then creates an authenticated socket', async () => {
    const config = makeConfig();
    chatService.initialize(config);
    expect(ioMock).toHaveBeenCalledTimes(0);
    expect(config.onError).toHaveBeenCalledWith('Vui lòng đăng nhập để sử dụng chat');

    vi.mocked(authService.login).mockResolvedValue({
      success: true,
      data: {
        user: mockUser,
        accessToken: 'login-token',
        refreshToken: 'refresh-token',
      },
    });

    await useAuthStore.getState().login('test@example.com', 'password123');

    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('login-token');
    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(authOptions().auth).toEqual({ token: 'login-token' });
  });

  it('login after logout creates exactly one authenticated socket', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'tok');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'rtok');
    chatService.initialize(makeConfig());
    expect(ioMock).toHaveBeenCalledTimes(1);

    await useAuthStore.getState().logout();
    expect(ioMock).toHaveBeenCalledTimes(1);

    vi.mocked(authService.login).mockResolvedValue({
      success: true,
      data: {
        user: mockUser,
        accessToken: 'relogin-token',
        refreshToken: 'refresh-token',
      },
    });

    await useAuthStore.getState().login('test@example.com', 'password123');

    expect(ioMock).toHaveBeenCalledTimes(2);
    expect(authOptions().auth).toEqual({ token: 'relogin-token' });
  });

  it('does not recreate the socket when the token is unchanged', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'same-token');
    chatService.initialize(makeConfig());
    expect(ioMock).toHaveBeenCalledTimes(1);

    vi.mocked(authService.login).mockResolvedValue({
      success: true,
      data: {
        user: mockUser,
        accessToken: 'same-token',
        refreshToken: 'refresh-token',
      },
    });

    await useAuthStore.getState().login('test@example.com', 'password123');

    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(created[0].socket.disconnect).not.toHaveBeenCalled();
  });
});

describe('authStore.setAuth (Google login) syncs the chat socket', () => {
  it('creates an authenticated socket with the provided access token', async () => {
    chatService.initialize(makeConfig());
    expect(ioMock).toHaveBeenCalledTimes(0);

    useAuthStore.getState().setAuth(mockUser, 'google-token', 'google-refresh-token');

    await vi.waitFor(() => expect(ioMock).toHaveBeenCalledTimes(1));

    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('google-token');
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('google-refresh-token');
    expect(authOptions().auth).toEqual({ token: 'google-token' });
  });
});

describe('authStore.refreshToken syncs the chat socket', () => {
  it('reconnects with the new access token on success', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'old-token');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-token');
    chatService.initialize(makeConfig());
    expect(ioMock).toHaveBeenCalledTimes(1);
    const first = created[0];

    vi.mocked(authService.refreshToken).mockResolvedValue({
      success: true,
      data: { accessToken: 'new-token' },
    });

    const result = await useAuthStore.getState().refreshToken();

    expect(result).toBe(true);
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('new-token');
    expect(ioMock).toHaveBeenCalledTimes(2);
    expect(first.socket.disconnect).toHaveBeenCalled();
    expect(authOptions().auth).toEqual({ token: 'new-token' });
  });

  it('disconnects the socket when refresh fails', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'old-token');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-token');
    chatService.initialize(makeConfig());
    expect(ioMock).toHaveBeenCalledTimes(1);

    vi.mocked(authService.refreshToken).mockRejectedValue(new Error('Refresh failed'));

    const result = await useAuthStore.getState().refreshToken();

    expect(result).toBe(false);
    expect(created[0].socket.disconnect).toHaveBeenCalled();
    expect(ioMock).toHaveBeenCalledTimes(1);
  });
});

describe('authStore.initialize hydration syncs the chat socket', () => {
  it('creates a socket with the stored token after successful hydration', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'hydrated-token');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-token');
    vi.mocked(authService.getMe).mockResolvedValue(mockUser);

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(authOptions().auth).toEqual({ token: 'hydrated-token' });
  });

  it('disconnects a live socket when hydration fails', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'expired-token');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-token');
    chatService.initialize(makeConfig());
    expect(ioMock).toHaveBeenCalledTimes(1);

    vi.mocked(authService.getMe).mockRejectedValue(new Error('401 Unauthorized'));

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(created[0].socket.disconnect).toHaveBeenCalled();
    expect(ioMock).toHaveBeenCalledTimes(1);
  });

  it('does not create a socket when no tokens exist', async () => {
    localStorage.clear();

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(ioMock).not.toHaveBeenCalled();
  });
});

describe('authStore.logout disconnects the chat socket', () => {
  it('disconnects the socket via syncAuthentication(null)', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'tok');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'rtok');
    chatService.initialize(makeConfig());
    expect(ioMock).toHaveBeenCalledTimes(1);
    const entry = created[0];

    await useAuthStore.getState().logout();

    expect(authService.logout).toHaveBeenCalledTimes(1);
    expect(entry.socket.disconnect).toHaveBeenCalled();
    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
  });

  it('logout clears all chat persistence hints so a different user cannot resume it', async () => {
    localStorage.setItem(SELECTED_SESSION_KEY, '550e8400-e29b-41d4-a716-446655440000');
    localStorage.setItem(RESTORE_MODE_KEY, 'selected');
    localStorage.setItem(ACCESS_TOKEN_KEY, 'tok');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'rtok');
    chatService.initialize(makeConfig());
    expect(ioMock).toHaveBeenCalledTimes(1);

    await useAuthStore.getState().logout();

    expect(localStorage.getItem(SELECTED_SESSION_KEY)).toBeNull();
    // The mode is forced to 'new' so a reload after logout never hydrates.
    expect(localStorage.getItem(RESTORE_MODE_KEY)).toBe('new');
    expect(getSelectedSession()).toBeNull();
    expect(getRestoreMode()).not.toBe('selected');
  });

  it('logout clears chat hints even when the server logout throws', async () => {
    localStorage.setItem(SELECTED_SESSION_KEY, '550e8400-e29b-41d4-a716-446655440000');
    localStorage.setItem(RESTORE_MODE_KEY, 'selected');
    localStorage.setItem(ACCESS_TOKEN_KEY, 'tok');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'rtok');
    vi.mocked(authService.logout).mockRejectedValue(new Error('server down'));

    await useAuthStore.getState().logout();

    expect(getSelectedSession()).toBeNull();
    expect(getRestoreMode()).not.toBe('selected');
  });
});

describe('chat persistence survives token refresh (same user, same browser)', () => {
  it('successful refresh keeps the selected session hints intact', async () => {
    localStorage.setItem(SELECTED_SESSION_KEY, '550e8400-e29b-41d4-a716-446655440000');
    localStorage.setItem(RESTORE_MODE_KEY, 'selected');
    localStorage.setItem(ACCESS_TOKEN_KEY, 'old-token');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'rtok');
    chatService.initialize(makeConfig());
    vi.mocked(authService.refreshToken).mockResolvedValue({
      success: true,
      data: { accessToken: 'new-token' },
    });

    const result = await useAuthStore.getState().refreshToken();

    expect(result).toBe(true);
    // A refresh is the SAME user on the SAME browser — the chat session hint
    // must be preserved so the conversation is still resumed after reload.
    expect(getSelectedSession()).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(getRestoreMode()).toBe('selected');
  });

  it('failed refresh clears chat hints (treated as logged out)', async () => {
    localStorage.setItem(SELECTED_SESSION_KEY, '550e8400-e29b-41d4-a716-446655440000');
    localStorage.setItem(RESTORE_MODE_KEY, 'selected');
    localStorage.setItem(ACCESS_TOKEN_KEY, 'old-token');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'rt');
    chatService.initialize(makeConfig());
    vi.mocked(authService.refreshToken).mockRejectedValue(new Error('no'));

    const result = await useAuthStore.getState().refreshToken();
    expect(result).toBe(false);
    expect(getSelectedSession()).toBeNull();
    expect(getRestoreMode()).not.toBe('selected');
  });
});
