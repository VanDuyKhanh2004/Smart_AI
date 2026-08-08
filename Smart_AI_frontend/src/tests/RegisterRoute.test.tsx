import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import AppRouter from '@/routes/AppRouter';
import RegisterPage from '@/features/auth/pages/RegisterPage';
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

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const routeWrapper = (
  <MemoryRouter initialEntries={['/register']}>
    <Routes>
      <Route path="/register" element={<RegisterPage />} />
    </Routes>
  </MemoryRouter>
);

async function fillAndSubmit() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Họ và tên'), 'Phạm Hùng Thiên');
  await user.type(screen.getByLabelText('Email'), 'thienhungpham5@gmail.com');
  await user.type(screen.getByLabelText('Mật khẩu'), 'password123');
  await user.type(screen.getByLabelText('Xác nhận mật khẩu'), 'password123');
  await user.click(screen.getByRole('button', { name: 'Đăng ký' }));
}

describe('Register /register route integration', () => {
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
  });

  it('AppRouter maps /register to RegisterPage rendering THIS RegisterForm', async () => {
    window.history.pushState({}, '', '/register');
    render(<AppRouter />);

    expect(await screen.findByText('Tạo tài khoản mới để sử dụng hệ thống')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đăng ký' })).toBeInTheDocument();
  });

  it('keeps RegisterForm mounted during submit and shows the success + verification panel after resolve', async () => {
    const { promise, resolve } = deferred<typeof REGISTER_BODY>();
    vi.mocked(authService.register).mockReturnValue(promise);

    render(routeWrapper);
    expect(await screen.findByText('Tạo tài khoản mới để sử dụng hệ thống')).toBeInTheDocument();

    await fillAndSubmit();

    expect(screen.getByLabelText('Mật khẩu')).toBeInTheDocument();
    expect(screen.getByText('Đang đăng ký...')).toBeInTheDocument();
    expect(useAuthStore.getState().isLoading).toBe(true);

    await act(async () => {
      resolve(REGISTER_BODY);
      await promise;
    });

    const panel = await screen.findByTestId('register-success');
    expect(panel).toHaveTextContent('Đăng ký thành công');
    expect(panel).toHaveTextContent('Chúng tôi đã gửi email xác nhận đến');
    expect(panel).toHaveTextContent('thienhungpham5@gmail.com');
    expect(panel).toHaveTextContent(
      'Bạn cần xác nhận email trước khi có thể đăng nhập và sử dụng tài khoản.'
    );
    expect(screen.getByRole('button', { name: 'Gửi lại email xác nhận' })).toBeInTheDocument();
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});