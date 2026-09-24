import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import {
  MemoryRouter,
  Routes,
  Route,
  useLocation,
} from 'react-router-dom';
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

describe('LoginPage session-expired banner (ERR-01)', () => {
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

  function renderWithQuery(initialEntry: string) {
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>
    );
  }

  it('shows the session-expired Alert when ?expired=1', async () => {
    renderWithQuery('/login?expired=1');

    expect(
      await screen.findByText('Phiên đăng nhập đã hết hạn')
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Phiên đăng nhập của bạn đã hết hạn/)
    ).toBeInTheDocument();
    // Form still available — no redirect loop
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đăng nhập' })).toBeInTheDocument();
  });

  it('does not show the session-expired Alert without expired param', async () => {
    renderWithQuery('/login');

    expect(
      screen.queryByText('Phiên đăng nhập đã hết hạn')
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('cleans expired from the URL after reading it', async () => {
    let initialSearch: string | null = null;
    function LocationProbe() {
      const location = useLocation();
      // Capture search on first render, before LoginPage's cleanup effect runs
      if (initialSearch === null) {
        initialSearch = location.search;
      }
      return <div data-testid="location-search">{location.search}</div>;
    }

    render(
      <MemoryRouter initialEntries={['/login?expired=1']}>
        <LocationProbe />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>
    );

    // Initial URL carried expired=1
    expect(initialSearch).toContain('expired=1');

    // LoginPage strips expired=1 from the URL after first read
    await waitFor(() => {
      expect(screen.getByTestId('location-search')).not.toHaveTextContent(
        'expired'
      );
    });

    // Alert is preserved in state after query cleanup
    expect(
      screen.getByText('Phiên đăng nhập đã hết hạn')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('does not redirect an unauthenticated user away from login', async () => {
    renderWithQuery('/login?expired=1');

    await screen.findByText('Phiên đăng nhập đã hết hạn');
    expect(screen.getByRole('button', { name: 'Đăng nhập' })).toBeInTheDocument();
  });
});
