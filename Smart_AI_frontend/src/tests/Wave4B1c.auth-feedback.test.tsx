import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RegisterForm from '@/features/auth/components/RegisterForm';
import ForgotPasswordPage from '@/features/auth/pages/ForgotPasswordPage';
import ResetPasswordPage from '@/features/auth/pages/ResetPasswordPage';
import VerifyEmailPage from '@/features/auth/pages/VerifyEmailPage';
import GoogleLoginButton from '@/features/auth/components/GoogleLoginButton';
import { useAuthStore } from '@/stores/authStore';
import { authService } from '@/services/auth.service';
import axios from 'axios';

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

const gis = vi.hoisted(() => ({
  callback: null as ((credential: string) => void) | null,
}));

vi.mock('@/lib/googleIdentity', () => ({
  initGoogleIdentity: vi.fn(),
  setGoogleCallback: vi.fn((cb: (credential: string) => void) => {
    gis.callback = cb;
  }),
  renderGoogleButton: vi.fn(),
}));

const REGISTER_BODY = {
  success: true,
  message: 'Vui long xac nhan email',
  data: {
    email: 'user@example.com',
    requiresEmailVerification: true,
    user: {
      _id: '507f1f77bcf86cd799439011',
      name: 'Test User',
      email: 'user@example.com',
      role: 'user' as const,
      emailVerified: false,
      loginMethod: 'password' as const,
      createdAt: '2026-08-08T00:00:00.000Z',
      updatedAt: '2026-08-08T00:00:00.000Z',
    },
  },
};

function resetStore() {
  useAuthStore.setState({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
    errorCode: null,
  });
}

function fillRegisterAndSubmit() {
  fireEvent.change(screen.getByLabelText('Họ và tên'), {
    target: { value: 'Test User' },
  });
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'user@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Mật khẩu'), {
    target: { value: 'password123' },
  });
  fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu'), {
    target: { value: 'password123' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Đăng ký' }));
  return act(async () => {});
}

beforeEach(() => {
  resetStore();
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('M01 RegisterForm feedback live regions', () => {
  it('exposes server registration errors as role="alert"', async () => {
    vi.mocked(authService.register).mockRejectedValue({
      response: {
        data: {
          success: false,
          error: { code: 'EMAIL_EXISTS', message: 'Email đã được đăng ký' },
        },
      },
    });

    render(<RegisterForm />);
    await fillRegisterAndSubmit();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Email đã được đăng ký');
  });

  it('exposes the success panel as role="status"', async () => {
    vi.mocked(authService.register).mockResolvedValue(REGISTER_BODY);

    render(<RegisterForm />);
    await fillRegisterAndSubmit();

    const panel = await screen.findByTestId('register-success');
    expect(panel).toHaveAttribute('role', 'status');
  });

  it('exposes the EMAIL_NOT_VERIFIED recovery panel as role="status"', async () => {
    vi.mocked(authService.register).mockRejectedValue({
      response: {
        data: {
          success: false,
          error: {
            code: 'EMAIL_NOT_VERIFIED',
            message: 'Tài khoản với email này chưa được xác nhận.',
          },
        },
      },
    });

    render(<RegisterForm />);
    await fillRegisterAndSubmit();

    const panel = await screen.findByTestId('register-recovery');
    expect(panel).toHaveAttribute('role', 'status');
  });

  it('exposes resend success as role="status"', async () => {
    vi.useFakeTimers();
    vi.mocked(authService.register).mockResolvedValue(REGISTER_BODY);
    vi.mocked(authService.resendVerification).mockResolvedValue({
      success: true,
      message: 'Đã gửi lại email xác nhận',
    });

    render(<RegisterForm />);
    await fillRegisterAndSubmit();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi lại email xác nhận' }));
    await act(async () => {});

    const region = screen.getByText('Đã gửi lại email xác nhận');
    expect(region).toHaveAttribute('role', 'status');
  });

  it('exposes resend failure as role="alert"', async () => {
    vi.useFakeTimers();
    vi.mocked(authService.register).mockResolvedValue(REGISTER_BODY);
    vi.mocked(authService.resendVerification).mockRejectedValue(
      new Error('Gửi lại thất bại')
    );

    render(<RegisterForm />);
    await fillRegisterAndSubmit();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi lại email xác nhận' }));
    await act(async () => {});

    const region = screen.getByText('Gửi lại thất bại');
    expect(region).toHaveAttribute('role', 'alert');
  });
});

describe('M03 password recovery and verification live regions', () => {
  it('exposes the forgot-password success message as role="status"', async () => {
    vi.mocked(authService.forgotPassword).mockResolvedValue({
      success: true,
      message: 'Vui lòng kiểm tra email để đặt lại mật khẩu',
    });

    render(
      <MemoryRouter initialEntries={['/forgot-password']}>
        <ForgotPasswordPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi link đặt lại' }));

    const region = await screen.findByText(
      'Vui lòng kiểm tra email để đặt lại mật khẩu'
    );
    expect(region).toHaveAttribute('role', 'status');
  });

  it('exposes the reset-password success message as role="status"', async () => {
    vi.mocked(authService.resetPassword).mockResolvedValue({
      success: true,
      message: 'Đặt lại mật khẩu thành công',
    });

    render(
      <MemoryRouter initialEntries={['/reset-password?token=abc123']}>
        <ResetPasswordPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Mật khẩu mới'), {
      target: { value: 'password123' },
    });
    fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cập nhật mật khẩu' }));

    const region = await screen.findByText('Đặt lại mật khẩu thành công');
    expect(region).toHaveAttribute('role', 'status');
  });

  it('keeps forgot-password failures as role="alert"', async () => {
    vi.mocked(authService.forgotPassword).mockRejectedValue(
      new Error('Yêu cầu thất bại')
    );

    render(
      <MemoryRouter initialEntries={['/forgot-password']}>
        <ForgotPasswordPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi link đặt lại' }));

    const region = await screen.findByText('Yêu cầu thất bại');
    expect(region).toHaveAttribute('role', 'alert');
  });

  it('exposes the verification success area as role="status"', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/verify-email?status=success&message=Email+da+duoc+kich+hoat',
        ]}
      >
        <VerifyEmailPage />
      </MemoryRouter>
    );

    const messages = await screen.findAllByText('Email da duoc kich hoat');
    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      expect(message.closest('[role="status"]')).not.toBeNull();
    }
  });

  it('exposes the verification failure area as role="alert"', async () => {
    render(
      <MemoryRouter
        initialEntries={['/verify-email?status=error&message=Xac+nhan+that+bai']}
      >
        <VerifyEmailPage />
      </MemoryRouter>
    );

    const messages = await screen.findAllByText('Xac nhan that bai');
    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      expect(message.closest('[role="alert"]')).not.toBeNull();
    }
  });

  it('announces the in-flight verification spinner as role="status"', () => {
    vi.mocked(authService.verifyEmail).mockReturnValue(
      new Promise(() => undefined) as never
    );

    render(
      <MemoryRouter initialEntries={['/verify-email?token=abc123']}>
        <VerifyEmailPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('status', { name: 'Đang xử lý' })).toBeInTheDocument();
  });
});

describe('M04 Google login feedback', () => {
  it('exposes a missing-client-id failure as role="alert"', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');

    render(
      <MemoryRouter initialEntries={['/login']}>
        <GoogleLoginButton />
      </MemoryRouter>
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Không tìm thấy VITE_GOOGLE_CLIENT_ID');
  });

  it('announces the sign-in pending state as role="status" and marks the region busy', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id');
    const postSpy = vi
      .spyOn(axios, 'post')
      .mockReturnValue(new Promise(() => undefined) as never);

    render(
      <MemoryRouter initialEntries={['/login']}>
        <GoogleLoginButton />
      </MemoryRouter>
    );

    expect(gis.callback).not.toBeNull();
    await act(async () => {
      gis.callback?.('credential-token');
    });

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Đang đăng nhập...');
    expect(status.closest('[aria-busy="true"]')).not.toBeNull();
    expect(postSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/google-login'),
      { credential: 'credential-token' }
    );
  });
});
