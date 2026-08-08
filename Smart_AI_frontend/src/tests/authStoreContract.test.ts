import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuthStore } from '@/stores/authStore';
import { authService } from '@/services/auth.service';

vi.mock('@/services/auth.service', () => ({
  authService: {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshToken: vi.fn(),
    getMe: vi.fn(),
    verifyEmail: vi.fn(),
    resendVerification: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    linkGoogle: vi.fn(),
    unlinkGoogle: vi.fn(),
  },
}));

const REGISTER_BODY = {
  success: true,
  message: 'Vui long xac nhan email de kich hoat tai khoan',
  data: {
    email: 'thienhungpham5@gmail.com',
    requiresEmailVerification: true,
    user: {
      _id: '507f1f77bcf86cd799439011',
      name: 'Phạm Hùng Thiên',
      email: 'thienhungpham5@gmail.com',
      role: 'user' as const,
      emailVerified: false,
      loginMethod: 'password' as const,
      createdAt: '2026-08-08T00:00:00.000Z',
      updatedAt: '2026-08-08T00:00:00.000Z',
    },
  },
};

describe('authStore.register runtime contract', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      errorCode: null,
    });
    localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(authService.register).mockResolvedValue(REGISTER_BODY);
  });

  it('returns the registered email from the backend response data', async () => {
    const result = await useAuthStore.getState().register(
      'Phạm Hùng Thiên',
      'thienhungpham5@gmail.com',
      'password123'
    );

    expect(result.email).toBe('thienhungpham5@gmail.com');
    expect(authService.register).toHaveBeenCalledWith({
      name: 'Phạm Hùng Thiên',
      email: 'thienhungpham5@gmail.com',
      password: 'password123',
    });
  });

  it('returns requiresEmailVerification === true from the backend response', async () => {
    const result = await useAuthStore.getState().register(
      'Phạm Hùng Thiên',
      'thienhungpham5@gmail.com',
      'password123'
    );

    expect(result.requiresEmailVerification).toBe(true);
  });

  it('finds email from response data when available instead of the typed input', async () => {
    vi.mocked(authService.register).mockResolvedValue({
      ...REGISTER_BODY,
      data: { ...REGISTER_BODY.data, email: 'normalized@test.com' },
    });

    const result = await useAuthStore.getState().register('Người', 'typed@test.com', 'password123');

    expect(result.email).toBe('normalized@test.com');
  });

  it('does NOT auto-login or persist any access/refresh token on registration', async () => {
    await useAuthStore.getState().register(
      'Phạm Hùng Thiên',
      'thienhungpham5@gmail.com',
      'password123'
    );

    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('surfaces backend validation errors on failure and rethrows', async () => {
    vi.mocked(authService.register).mockRejectedValue({
      response: {
        data: { success: false, error: { code: 'EMAIL_EXISTS', message: 'Email đã được đăng ký' } },
      },
    });

    await expect(
      useAuthStore.getState().register('Người', 'existing@test.com', 'password123')
    ).rejects.toBeDefined();

    expect(useAuthStore.getState().error).toBe('Email đã được đăng ký');
    expect(useAuthStore.getState().errorCode).toBe('EMAIL_EXISTS');
    expect(useAuthStore.getState().isLoading).toBe(false);
  });
});