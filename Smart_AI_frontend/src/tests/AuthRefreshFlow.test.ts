import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuthStore } from '@/stores/authStore';
import { authService } from '@/services/auth.service';
import apiClient from '@/lib/axios';

vi.mock('@/services/auth.service', () => ({
  authService: {
    getMe: vi.fn(),
    refreshToken: vi.fn(),
  },
}));

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

const mockUser = {
  _id: 'user1',
  name: 'Test User',
  email: 'test@example.com',
  role: 'user' as const,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

function setTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, access);
  localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
}

function getRequestHandler() {
  const handlers = (apiClient.interceptors.request as any).handlers;
  return handlers?.[0]?.fulfilled;
}

function getResponseErrorHandler() {
  const handlers = (apiClient.interceptors.response as any).handlers;
  return handlers?.[0]?.rejected;
}

describe('authStore.initialize', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('authenticates user when getMe succeeds (valid access token)', async () => {
    setTokens('valid-access-token', 'valid-refresh-token');
    vi.mocked(authService.getMe).mockResolvedValue(mockUser);
    await useAuthStore.getState().initialize();
    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockUser);
    expect(state.isAuthenticated).toBe(true);
    expect(state.isLoading).toBe(false);
    expect(authService.getMe).toHaveBeenCalledTimes(1);
  });

  it('sets unauthenticated when getMe fails (expired token, no valid refresh)', async () => {
    setTokens('expired-access-token', 'expired-refresh-token');
    vi.mocked(authService.getMe).mockRejectedValue(new Error('401 Unauthorized'));
    await useAuthStore.getState().initialize();
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
  });

  it('does not call getMe when no tokens exist', async () => {
    localStorage.clear();
    await useAuthStore.getState().initialize();
    const state = useAuthStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.isAuthenticated).toBe(false);
    expect(authService.getMe).not.toHaveBeenCalled();
  });

  it('does not call getMe when refreshToken is missing', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'some-token');
    await useAuthStore.getState().initialize();
    const state = useAuthStore.getState();
    expect(state.isLoading).toBe(false);
    expect(authService.getMe).not.toHaveBeenCalled();
  });

  it('updates store accessToken from localStorage after successful getMe', async () => {
    setTokens('token-from-localStorage', 'valid-refresh-token');
    vi.mocked(authService.getMe).mockResolvedValue(mockUser);
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().accessToken).toBe('token-from-localStorage');
  });
});

describe('authStore.refreshToken', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('returns true and stores new accessToken on success', async () => {
    setTokens('old-token', 'valid-refresh-token');
    vi.mocked(authService.refreshToken).mockResolvedValue({
      success: true,
      data: { accessToken: 'new-access-token' },
    });
    const result = await useAuthStore.getState().refreshToken();
    expect(result).toBe(true);
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('new-access-token');
    expect(useAuthStore.getState().accessToken).toBe('new-access-token');
  });

  it('returns false and clears auth when refresh fails', async () => {
    setTokens('old-token', 'bad-refresh-token');
    useAuthStore.setState({ user: mockUser, isAuthenticated: true });
    vi.mocked(authService.refreshToken).mockRejectedValue(new Error('Refresh failed'));
    const result = await useAuthStore.getState().refreshToken();
    expect(result).toBe(false);
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('returns false immediately when no refresh token in localStorage', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'some-token');
    const result = await useAuthStore.getState().refreshToken();
    expect(result).toBe(false);
    expect(authService.refreshToken).not.toHaveBeenCalled();
  });
});

describe('clearAuthStorage (axios.ts)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('removes accessToken, refreshToken, and user from localStorage', () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'tok');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'rtok');
    localStorage.setItem('user', JSON.stringify(mockUser));

    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('tok');
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('rtok');
    expect(localStorage.getItem('user')).toBeTruthy();
  });
});

describe('Axios request interceptor', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('adds Bearer token from localStorage to every request', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'my-bearer-token');
    const handler = getRequestHandler();
    expect(handler).toBeDefined();
    const config = { headers: {} } as any;
    const result = await handler(config);
    expect(result.headers.Authorization).toBe('Bearer my-bearer-token');
  });

  it('does not add Authorization when no token exists', async () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    const handler = getRequestHandler();
    expect(handler).toBeDefined();
    const config = { headers: {} } as any;
    const result = await handler(config);
    expect(result.headers.Authorization).toBeUndefined();
  });
});

describe('Axios response interceptor', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('skips refresh when the failing request is to /auth/refresh', async () => {
    const handler = getResponseErrorHandler();
    expect(handler).toBeDefined();
    const error = {
      response: { status: 401 },
      config: { url: '/auth/refresh', headers: {} },
    };
    await expect(handler(error)).rejects.toBe(error);
  });

  it('passes through non-401 errors without refresh', async () => {
    const handler = getResponseErrorHandler();
    expect(handler).toBeDefined();
    const error = {
      response: { status: 500 },
      config: { url: '/auth/me', headers: {} },
    };
    await expect(handler(error)).rejects.toBe(error);
  });

  it('skips refresh when _retry is already true', async () => {
    const handler = getResponseErrorHandler();
    expect(handler).toBeDefined();
    const error = {
      response: { status: 401 },
      config: { url: '/auth/me', headers: {}, _retry: true },
    };
    await expect(handler(error)).rejects.toBe(error);
  });

  it('redirects to /login when no refresh token is in localStorage', async () => {
    const originalLocation = window.location.href;
    const handler = getResponseErrorHandler();
    expect(handler).toBeDefined();
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    const error = {
      response: { status: 401 },
      config: { url: '/auth/me', headers: {} },
    };
    window.location.href = '/login';
    Object.defineProperty(window, 'location', {
      value: { href: '/login' },
      writable: true,
    });
    await expect(handler(error)).rejects.toBe(error);
    Object.defineProperty(window, 'location', {
      value: { href: originalLocation },
      writable: true,
    });
  });
});
