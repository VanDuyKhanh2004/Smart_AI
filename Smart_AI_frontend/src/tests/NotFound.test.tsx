import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import NotFound from '@/pages/NotFound';
import AppRouter from '@/routes/AppRouter';
import { useAuthStore } from '@/stores/authStore';

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

describe('NotFound page (H12)', () => {
  beforeEach(() => {
    // jsdom does not implement window.scrollTo (used by ScrollToTop)
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
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

  it('renders a Vietnamese heading and a CTA back to the product list', () => {
    render(
      <MemoryRouter initialEntries={['/khong-ton-tai']}>
        <NotFound />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('heading', { name: 'Không tìm thấy trang' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Tiếp tục mua sắm' })
    ).toHaveAttribute('href', '/products');
  });

  it('is rendered by the router inside the standard layout for unknown URLs', async () => {
    window.history.pushState({}, '', '/duong-dan-khong-ton-tai');
    render(<AppRouter />);

    const heading = await screen.findByRole('heading', {
      name: 'Không tìm thấy trang',
    });
    expect(heading).toBeInTheDocument();

    // Wrapped by Layout: header, footer and main landmark are present
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toContainElement(heading);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });
});
