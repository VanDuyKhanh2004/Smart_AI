import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const { authState, cartState, wishlistState } = vi.hoisted(() => ({
  authState: {
    isAuthenticated: false,
    isLoading: false,
    user: null as null | {
      name: string;
      email: string;
      role: string;
      avatar?: string;
    },
    logout: vi.fn(),
  },
  cartState: {
    items: [
      {
        _id: 'i1',
        product: {
          _id: 'p1',
          name: 'iPhone',
          price: 1000000,
          image: '',
          brand: 'apple',
          colors: [],
          tags: [],
          description: '',
          inStock: 10,
          isActive: true,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        quantity: 2,
        color: 'black',
        addedAt: '2024-01-01T00:00:00.000Z',
      },
    ],
    getTotalPrice: () => 2000000,
  },
  wishlistState: {
    items: [] as string[],
  },
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector?: (s: typeof authState) => unknown) =>
    typeof selector === 'function' ? selector(authState) : authState,
}));

vi.mock('@/stores/cartStore', () => ({
  useCartStore: (selector?: (s: typeof cartState) => unknown) =>
    typeof selector === 'function' ? selector(cartState) : cartState,
}));

vi.mock('@/stores/wishlistStore', () => ({
  useWishlistStore: (selector?: (s: typeof wishlistState) => unknown) =>
    typeof selector === 'function' ? selector(wishlistState) : wishlistState,
}));

import Header from '@/components/layout/Header';
import MiniCartPreview from '@/components/layout/MiniCartPreview';

function renderHeader() {
  return render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>
  );
}

const NO_NESTED_INTERACTIVE = 'a button, button a, a a, button button';

describe('Header controls (W2B-M3)', () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.isLoading = false;
    authState.user = null;
  });

  it('renders header controls with no nested interactive elements (guest)', () => {
    renderHeader();

    expect(document.querySelectorAll(NO_NESTED_INTERACTIVE)).toHaveLength(0);
    expect(
      screen.getByRole('link', { name: 'Đăng nhập' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đăng ký' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Smart AI - Trang chủ' })).toBeInTheDocument();
    // desktop + mobile cart links both render (one hidden by CSS per breakpoint)
    expect(
      screen.getAllByRole('link', { name: /Giỏ hàng \(2 sản phẩm\)/ })
    ).toHaveLength(2);
    expect(
      screen.getByRole('navigation', { name: 'Điều hướng chính' })
    ).toBeInTheDocument();
  });

  it('renders header controls with no nested interactive elements (authenticated)', () => {
    authState.isAuthenticated = true;
    authState.user = {
      name: 'Nguyễn Văn A',
      email: 'a@example.com',
      role: 'customer',
    };
    renderHeader();

    expect(document.querySelectorAll(NO_NESTED_INTERACTIVE)).toHaveLength(0);
    expect(
      screen.getByRole('link', { name: 'Yêu thích (0 sản phẩm)' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Nguyễn Văn A/ })
    ).toBeInTheDocument();
  });

  it('keeps decorative header icons out of the accessibility tree', () => {
    renderHeader();

    const hamburger = screen.getByRole('button', { name: 'Mở menu' });
    expect(hamburger.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    const logo = screen.getByRole('link', { name: 'Smart AI - Trang chủ' });
    expect(logo.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('runs the full H08 drawer lifecycle through the real Header', () => {
    renderHeader();

    const trigger = screen.getByRole('button', { name: 'Mở menu' });
    expect(trigger).toHaveAttribute('id', 'mobile-menu-trigger');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-controls', 'mobile-nav-drawer');

    const drawer = document.getElementById('mobile-nav-drawer')!;
    expect(drawer).toHaveAttribute('inert', '');

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(drawer).not.toHaveAttribute('inert');
    expect(document.activeElement).toBe(document.getElementById('mobile-menu-close'));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(drawer).toHaveAttribute('inert', '');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(trigger);
  });
});

describe('MiniCartPreview controls (W2B-M3)', () => {
  it('renders populated preview actions without nested interactive elements', () => {
    render(
      <MemoryRouter>
        <MiniCartPreview isVisible={true} />
      </MemoryRouter>
    );

    expect(document.querySelectorAll(NO_NESTED_INTERACTIVE)).toHaveLength(0);
    expect(
      screen.getByRole('link', { name: 'Xem giỏ hàng' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thanh toán' })).toBeInTheDocument();
  });

  it('renders the empty-cart action without nested interactive elements', () => {
    const populatedItems = cartState.items;
    cartState.items = [];
    try {
      render(
        <MemoryRouter>
          <MiniCartPreview isVisible={true} />
        </MemoryRouter>
      );

      expect(document.querySelectorAll(NO_NESTED_INTERACTIVE)).toHaveLength(0);
      expect(screen.getByText('Giỏ hàng trống')).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Tiếp tục mua sắm' })
      ).toBeInTheDocument();
    } finally {
      cartState.items = populatedItems;
    }
  });
});
