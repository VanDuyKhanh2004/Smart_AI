import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

async function fillAndSubmit() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Họ và tên'), 'Phạm Hùng Thiên');
  await user.type(screen.getByLabelText('Email'), 'thienhungpham5@gmail.com');
  await user.type(screen.getByLabelText('Mật khẩu'), 'password123');
  await user.type(screen.getByLabelText('Xác nhận mật khẩu'), 'password123');
  await user.click(screen.getByRole('button', { name: 'Đăng ký' }));
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

    render(<RegisterForm />);
    await fillAndSubmit();

    const resendButton = await screen.findByRole('button', { name: 'Gửi lại email xác nhận' });
    await userEvent.click(resendButton);

    await waitFor(() => {
      expect(authService.resendVerification).toHaveBeenCalledWith({
        email: 'thienhungpham5@gmail.com',
      });
    });
    expect(await screen.findByText('Đã gửi lại email xác nhận')).toBeInTheDocument();
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