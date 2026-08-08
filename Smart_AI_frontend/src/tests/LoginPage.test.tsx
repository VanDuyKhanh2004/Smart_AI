import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import LoginPage from '@/features/auth/pages/LoginPage';
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

const CREDENTIALS_ERROR = Object.assign(new Error('Request failed'), {
  response: {
    data: {
      success: false,
      error: {
        message: 'Email hoặc mật khẩu không đúng',
        code: 'INVALID_CREDENTIALS',
      },
    },
  },
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const routeWrapper = (
  <MemoryRouter initialEntries={['/login']}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
    </Routes>
  </MemoryRouter>
);

describe('LoginPage /login route keeps the form mounted during requests', () => {
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

  it('stays mounted while login is pending and preserves input values after a failure', async () => {
    const { promise, reject } = deferred<unknown>();
    vi.mocked(authService.login).mockReturnValue(promise as never);

    render(routeWrapper);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email'), 'user@test.com');
    await user.type(screen.getByLabelText('Mật khẩu'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(useAuthStore.getState().isLoading).toBe(true);

    await act(async () => {
      reject(CREDENTIALS_ERROR);
      await promise.catch(() => undefined);
    });

    expect(
      await screen.findByText('Email hoặc mật khẩu không đúng')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('user@test.com');
    expect(screen.getByLabelText('Mật khẩu')).toHaveValue('password123');
  });
});