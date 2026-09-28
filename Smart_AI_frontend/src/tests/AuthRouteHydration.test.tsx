import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProtectedRoute from '@/components/ProtectedRoute';
import AdminRoute from '@/components/AdminRoute';
import { useAuthStore } from '@/stores/authStore';
import { authService } from '@/services/auth.service';
import type { User } from '@/types/auth.type';

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

const adminUser = {
  _id: 'a1',
  name: 'Admin',
  email: 'admin@test.com',
  role: 'admin' as const,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const regularUser: User = {
  _id: 'u1',
  name: 'User',
  email: 'user@test.com',
  role: 'user' as const,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

function resetStore(overrides: Record<string, unknown> = {}) {
  act(() => {
    useAuthStore.setState({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      hasHydrated: false,
      error: null,
      errorCode: null,
      ...overrides,
    });
  });
}

function renderProtected() {
  return render(
    <MemoryRouter initialEntries={['/checkout']}>
      <Routes>
        <Route
          path="/checkout"
          element={
            <ProtectedRoute>
              <div data-testid="protected">protected</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div data-testid="login">login</div>} />
        <Route path="/" element={<div data-testid="home">home</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function renderAdmin() {
  return render(
    <MemoryRouter initialEntries={['/admin/dashboard']}>
      <Routes>
        <Route
          path="/admin/dashboard"
          element={
            <AdminRoute>
              <div data-testid="admin">admin</div>
            </AdminRoute>
          }
        />
        <Route path="/login" element={<div data-testid="login">login</div>} />
        <Route path="/" element={<div data-testid="home">home</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function spinnerVisible() {
  return document.querySelector('.animate-spin') !== null;
}

describe('authStore hydration flag (H02-1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    resetStore();
  });

  it('starts with hasHydrated=false before initialize runs', () => {
    expect(useAuthStore.getState().hasHydrated).toBe(false);
  });

  it('sets hasHydrated=true at the END of the no-token path', async () => {
    expect(useAuthStore.getState().hasHydrated).toBe(false);
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().hasHydrated).toBe(true);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(authService.getMe).not.toHaveBeenCalled();
  });

  it('sets hasHydrated=true at the END of the token-present path (getMe success)', async () => {
    localStorage.setItem('accessToken', 'valid-access');
    localStorage.setItem('refreshToken', 'valid-refresh');
    vi.mocked(authService.getMe).mockResolvedValue(adminUser);

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().hasHydrated).toBe(true);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('sets hasHydrated=true when the token-present path fails', async () => {
    localStorage.setItem('accessToken', 'expired-access');
    localStorage.setItem('refreshToken', 'expired-refresh');
    vi.mocked(authService.getMe).mockRejectedValue(new Error('401 Unauthorized'));

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().hasHydrated).toBe(true);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

describe('ProtectedRoute waits for hydration before redirecting (H02-1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    resetStore();
  });

  it('renders the spinner and does NOT redirect to /login while unhydrated', () => {
    renderProtected();

    expect(spinnerVisible()).toBe(true);
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
    expect(screen.queryByTestId('login')).not.toBeInTheDocument();
  });

  it('redirects to /login with state.from only after hydration resolves unauthenticated', () => {
    renderProtected();
    expect(screen.queryByTestId('login')).not.toBeInTheDocument();

    act(() => {
      useAuthStore.setState({ hasHydrated: true, isAuthenticated: false });
    });

    expect(screen.getByTestId('login')).toBeInTheDocument();
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
    expect(screen.queryByTestId('home')).not.toBeInTheDocument();
  });

  it('renders protected content once hydrated and authenticated (no login flash)', () => {
    renderProtected();

    act(() => {
      useAuthStore.setState({
        hasHydrated: true,
        isAuthenticated: true,
        user: regularUser,
        accessToken: 'tok',
      });
    });

    expect(screen.getByTestId('protected')).toBeInTheDocument();
    expect(screen.queryByTestId('login')).not.toBeInTheDocument();
    expect(spinnerVisible()).toBe(false);
  });

  it('does not bounce hydrated authenticated users through /login (no redirect loop)', () => {
    renderProtected();

    act(() => {
      useAuthStore.setState({
        hasHydrated: true,
        isAuthenticated: true,
        user: regularUser,
        accessToken: 'tok',
      });
    });

    // Still on protected content after settling; login never appeared.
    expect(screen.getByTestId('protected')).toBeInTheDocument();
    expect(screen.queryByTestId('login')).not.toBeInTheDocument();
  });
});

describe('AdminRoute waits for hydration (H02-1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    resetStore();
  });

  it('renders the spinner and does NOT redirect while unhydrated', () => {
    renderAdmin();

    expect(spinnerVisible()).toBe(true);
    expect(screen.queryByTestId('admin')).not.toBeInTheDocument();
    expect(screen.queryByTestId('login')).not.toBeInTheDocument();
    expect(screen.queryByTestId('home')).not.toBeInTheDocument();
  });

  it('keeps the existing post-hydration logic: admin users get children', () => {
    renderAdmin();

    act(() => {
      useAuthStore.setState({
        hasHydrated: true,
        isAuthenticated: true,
        user: adminUser,
        accessToken: 'tok',
      });
    });

    expect(screen.getByTestId('admin')).toBeInTheDocument();
  });

  it('keeps the existing post-hydration logic: non-admins bounce to /', () => {
    renderAdmin();

    act(() => {
      useAuthStore.setState({
        hasHydrated: true,
        isAuthenticated: true,
        user: regularUser,
        accessToken: 'tok',
      });
    });

    expect(screen.getByTestId('home')).toBeInTheDocument();
    expect(screen.queryByTestId('admin')).not.toBeInTheDocument();
  });

  it('redirects unauthenticated users to /login only after hydration', () => {
    renderAdmin();
    expect(screen.queryByTestId('login')).not.toBeInTheDocument();

    act(() => {
      useAuthStore.setState({ hasHydrated: true, isAuthenticated: false });
    });

    expect(screen.getByTestId('login')).toBeInTheDocument();
  });
});
