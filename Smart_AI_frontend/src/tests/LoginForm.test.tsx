import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import LoginForm from '@/features/auth/components/LoginForm';
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

const EMAIL_NOT_VERIFIED_ERROR = Object.assign(new Error('Request failed'), {
  response: {
    data: {
      success: false,
      error: {
        message: 'Vui lòng xác nhận email trước khi đăng nhập',
        code: 'EMAIL_NOT_VERIFIED',
      },
    },
  },
});

describe('LoginForm unverified-account messaging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      errorCode: null,
    });
  });

  it('shows the specific verification-required message when login is rejected as unverified', async () => {
    vi.mocked(authService.login).mockRejectedValue(EMAIL_NOT_VERIFIED_ERROR);

    render(
      <MemoryRouter>
        <LoginForm />
      </MemoryRouter>
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email'), 'user@test.com');
    await user.type(screen.getByLabelText('Mật khẩu'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(
      await screen.findByText('Tài khoản chưa được xác nhận. Vui lòng kiểm tra email để xác nhận tài khoản.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Gửi lại email xác nhận' })
    ).toBeInTheDocument();
  });

  it('keeps the Google login option mounted in the login form', async () => {
    render(
      <MemoryRouter>
        <LoginForm />
      </MemoryRouter>
    );

    expect(screen.getByText('Hoặc đăng nhập với')).toBeInTheDocument();
  });
});