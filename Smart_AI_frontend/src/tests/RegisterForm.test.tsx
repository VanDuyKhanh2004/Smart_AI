import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterForm from '@/features/auth/components/RegisterForm';
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

async function fillAndSubmit(user = userEvent.setup()) {
  await user.type(screen.getByLabelText('Họ và tên'), 'Phạm Hùng Thiên');
  await user.type(screen.getByLabelText('Email'), 'thienhungpham5@gmail.com');
  await user.type(screen.getByLabelText('Mật khẩu'), 'password123');
  await user.type(screen.getByLabelText('Xác nhận mật khẩu'), 'password123');
  await user.click(screen.getByRole('button', { name: 'Đăng ký' }));
}

async function fillAndSubmitFireEvent() {
  fireEvent.change(screen.getByLabelText('Họ và tên'), { target: { value: 'Phạm Hùng Thiên' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'thienhungpham5@gmail.com' } });
  fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'password123' } });
  fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu'), { target: { value: 'password123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Đăng ký' }));
  await act(async () => {});
}

describe('RegisterForm success-state runtime contract', () => {
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

  afterEach(() => {
    vi.useRealTimers();
  });

  it('enters the success panel after a 201 service/store contract', async () => {
    render(<RegisterForm />);
    await fillAndSubmit();

    expect(await screen.findByTestId('register-success')).toBeInTheDocument();
    expect(screen.getByText(/Đăng ký thành công/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Đăng ký' })).toBeInTheDocument();
  });

  it('shows the exact registered email from the registration result', async () => {
    render(<RegisterForm />);
    await fillAndSubmit();

    const panel = await screen.findByTestId('register-success');
    expect(panel).toHaveTextContent('Chúng tôi đã gửi email xác nhận đến');
    expect(panel).toHaveTextContent('thienhungpham5@gmail.com');
    expect(screen.getByText('thienhungpham5@gmail.com')).toBeInTheDocument();
  });

  it('shows explicit verification-before-login wording', async () => {
    render(<RegisterForm />);
    await fillAndSubmit();

    const panel = await screen.findByTestId('register-success');
    expect(panel).toHaveTextContent(
      'Vui lòng kiểm tra email và xác nhận tài khoản trước khi đăng nhập.'
    );
    expect(panel).toHaveTextContent(
      'Bạn cần xác nhận email trước khi có thể đăng nhập và sử dụng tài khoản.'
    );
  });

  it('does not auto-login or persist any token after successful registration', async () => {
    render(<RegisterForm />);
    await fillAndSubmit();

    await screen.findByTestId('register-success');
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('keeps the resend-verification flow working after success', async () => {
    vi.mocked(authService.resendVerification).mockResolvedValue({
      success: true,
      message: 'Đã gửi lại email xác nhận',
    });
    vi.useFakeTimers();

    render(<RegisterForm />);
    await fillAndSubmitFireEvent();

    expect(screen.getByRole('button', { name: 'Gửi lại sau 60s' })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Gửi lại email xác nhận' }));
    await act(async () => {});

    expect(authService.resendVerification).toHaveBeenCalledWith({
      email: 'thienhungpham5@gmail.com',
    });
    expect(screen.getByText('Đã gửi lại email xác nhận')).toBeInTheDocument();
  });

  it('enters the 60s resend cooldown right after successful registration', async () => {
    render(<RegisterForm />);
    await fillAndSubmit();

    expect(screen.getByRole('button', { name: 'Gửi lại sau 60s' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gửi lại sau 60s' })).toBeDisabled();
  });

  it('shows Đang gửi... while a resend request is in flight', async () => {
    let resolveResend: (value: { success: boolean; message: string }) => void;
    vi.mocked(authService.resendVerification).mockReturnValue(
      new Promise((resolve) => {
        resolveResend = resolve;
      })
    );
    vi.useFakeTimers();

    render(<RegisterForm />);
    await fillAndSubmitFireEvent();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Gửi lại email xác nhận' }));
    await act(async () => {});

    expect(screen.getByRole('button', { name: 'Đang gửi...' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đang gửi...' })).toBeDisabled();

    act(() => {
      resolveResend({ success: true, message: 'Đã gửi lại email xác nhận' });
    });
  });

  it('syncs the countdown from a backend 429 retryAfterSeconds', async () => {
    const cooldownError = Object.assign(new Error('Request failed with status code 429'), {
      response: {
        data: {
          success: false,
          error: { code: 'VERIFICATION_EMAIL_COOLDOWN', message: 'Vui long cho truoc khi gui lai email xac nhan.' },
          data: { retryAfterSeconds: 42 },
        },
      },
    });
    vi.mocked(authService.resendVerification).mockRejectedValue(cooldownError);
    vi.useFakeTimers();

    render(<RegisterForm />);
    await fillAndSubmitFireEvent();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Gửi lại email xác nhận' }));
    await act(async () => {});

    expect(screen.getByText('Vui long cho truoc khi gui lai email xac nhan.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gửi lại sau 42s' })).toBeInTheDocument();
  });

  it('shows backend validation errors when registration fails', async () => {
    vi.mocked(authService.register).mockRejectedValue({
      response: {
        data: { success: false, error: { code: 'EMAIL_EXISTS', message: 'Email đã được đăng ký' } },
      },
    });

    render(<RegisterForm />);
    await fillAndSubmit();

    expect(await screen.findByText('Email đã được đăng ký')).toBeInTheDocument();
    expect(screen.queryByTestId('register-success')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gửi lại email xác nhận' })).not.toBeInTheDocument();
  });
});

describe('RegisterForm EMAIL_NOT_VERIFIED recovery contract', () => {
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
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the verification recovery UI instead of the generic duplicate-email error', async () => {
    render(<RegisterForm />);
    await fillAndSubmit();

    const panel = await screen.findByTestId('register-recovery');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveTextContent(
      'Tài khoản này đã được đăng ký nhưng chưa được xác nhận email.'
    );
    expect(screen.queryByTestId('register-success')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Đăng ký' })).toBeInTheDocument();
  });

  it('preserves and displays the submitted email in the recovery panel', async () => {
    render(<RegisterForm />);
    await fillAndSubmit();

    const panel = await screen.findByTestId('register-recovery');
    expect(panel).toHaveTextContent('thienhungpham5@gmail.com');
    expect(screen.getByText('thienhungpham5@gmail.com')).toBeInTheDocument();
  });

  it('resend button goes through the existing resendVerification flow', async () => {
    vi.mocked(authService.resendVerification).mockResolvedValue({
      success: true,
      message: 'Đã gửi lại email xác nhận',
    });

    render(<RegisterForm />);
    await fillAndSubmit();
    await screen.findByTestId('register-recovery');

    fireEvent.click(screen.getByRole('button', { name: 'Gửi lại email xác nhận' }));
    await act(async () => {});

    expect(authService.resendVerification).toHaveBeenCalledWith({
      email: 'thienhungpham5@gmail.com',
    });
    expect(screen.getByText('Đã gửi lại email xác nhận')).toBeInTheDocument();
  });

  it('starts the 60s resend cooldown after a successful resend in the recovered state', async () => {
    vi.mocked(authService.resendVerification).mockResolvedValue({
      success: true,
      message: 'Đã gửi lại email xác nhận',
    });
    vi.useFakeTimers();

    render(<RegisterForm />);
    await fillAndSubmitFireEvent();
    await act(async () => {});
    expect(screen.getByTestId('register-recovery')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Gửi lại email xác nhận' }));
    await act(async () => {});

    expect(screen.getByRole('button', { name: 'Gửi lại sau 60s' })).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.getByRole('button', { name: 'Gửi lại email xác nhận' })).toBeInTheDocument();
  });

  it('syncs the recovered-state countdown from a backend 429 retryAfterSeconds', async () => {
    const cooldownError = Object.assign(new Error('Request failed with status code 429'), {
      response: {
        data: {
          success: false,
          error: { code: 'VERIFICATION_EMAIL_COOLDOWN', message: 'Vui long cho truoc khi gui lai email xac nhan.' },
          data: { retryAfterSeconds: 42 },
        },
      },
    });
    vi.mocked(authService.resendVerification).mockRejectedValue(cooldownError);
    vi.useFakeTimers();

    render(<RegisterForm />);
    await fillAndSubmitFireEvent();
    await act(async () => {});
    expect(screen.getByTestId('register-recovery')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Gửi lại email xác nhận' }));
    await act(async () => {});

    expect(screen.getByText('Vui long cho truoc khi gui lai email xac nhan.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gửi lại sau 42s' })).toBeInTheDocument();
  });

  it('verified duplicate registration still shows the normal already-registered behavior', async () => {
    vi.mocked(authService.register).mockRejectedValue({
      response: {
        data: { success: false, error: { code: 'EMAIL_EXISTS', message: 'Email đã được đăng ký' } },
      },
    });

    render(<RegisterForm />);
    await fillAndSubmit();

    expect(await screen.findByText('Email đã được đăng ký')).toBeInTheDocument();
    expect(screen.queryByTestId('register-recovery')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gửi lại email xác nhận' })).not.toBeInTheDocument();
  });
});