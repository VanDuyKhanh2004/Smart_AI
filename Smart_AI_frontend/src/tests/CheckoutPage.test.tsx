import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CheckoutPage from '@/features/orders/pages/CheckoutPage';
import { useCartStore } from '@/stores/cartStore';
import { useAuthStore } from '@/stores/authStore';
import type { CartItem } from '@/types/cart.type';
import type { User } from '@/types/auth.type';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom'
  );
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/services/order.service', () => ({
  orderService: {
    createOrder: vi.fn(),
  },
}));

vi.mock('@/services/address.service', () => ({
  addressService: {
    getAddresses: vi.fn().mockResolvedValue({ success: true, data: [] }),
  },
}));

vi.mock('@/features/addresses', () => ({
  AddressSelector: () => <div data-testid="address-selector" />,
}));

vi.mock('@/features/checkout', () => ({
  PromotionInput: () => <div data-testid="promotion-input" />,
}));

const mockFetchCart = vi.fn();
const mockClearCart = vi.fn();

function setCart(partial: { items?: CartItem[]; isLoading?: boolean }) {
  useCartStore.setState({
    items: partial.items ?? [],
    isLoading: partial.isLoading ?? false,
    error: null,
    fetchCart: mockFetchCart,
    clearCart: mockClearCart,
  });
}

function setAuth(isAuthenticated: boolean) {
  const user: User | null = isAuthenticated
    ? {
        _id: 'u1',
        name: 'T',
        email: 't@e.com',
        role: 'user',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      }
    : null;
  useAuthStore.setState({
    isAuthenticated,
    isLoading: false,
    user,
    accessToken: isAuthenticated ? 'tok' : null,
    error: null,
    errorCode: null,
  });
}

function renderCheckout() {
  return render(
    <MemoryRouter initialEntries={['/checkout']}>
      <Routes>
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/cart" element={<div>cart-page</div>} />
        <Route path="/login" element={<div>login-page</div>} />
        <Route path="/products" element={<div>products-page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const item: CartItem = {
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
  quantity: 1,
  color: 'black',
  addedAt: '2024-01-01T00:00:00.000Z',
};

describe('CheckoutPage cart hydration (LOAD-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchCart.mockResolvedValue(undefined);
    mockClearCart.mockResolvedValue(undefined);
    setAuth(true);
    setCart({ items: [], isLoading: false });
  });

  it('shows loader while cart is hydrating and does not show empty UI', async () => {
    setCart({ items: [], isLoading: true });

    renderCheckout();

    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Giỏ hàng trống')).not.toBeInTheDocument();
    expect(screen.queryByText('cart-page')).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalledWith('/cart');
    expect(mockFetchCart).toHaveBeenCalled();
  });

  it('redirects to /cart only after hydration completes with empty cart', async () => {
    setCart({ items: [], isLoading: false });

    renderCheckout();

    // Effect redirects once hydrated + empty; empty UI may render first
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/cart');
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders checkout UI when hydrated cart has items (no empty redirect)', async () => {
    setCart({ items: [item], isLoading: false });

    renderCheckout();

    expect(
      await screen.findByRole('heading', { name: 'Thanh toán' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Giỏ hàng trống')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalledWith('/cart');
  });

  it('redirects unauthenticated users to login', async () => {
    setAuth(false);
    setCart({ items: [], isLoading: false });

    renderCheckout();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/login', {
        state: { from: '/checkout' },
      });
    });
  });

  it('does not treat cart hydration flag as order submission loading', async () => {
    setCart({ items: [item], isLoading: true });

    // Cart isLoading=true but items present → not the hydration loader branch
    // (loader only when items empty). Checkout heading still reachable once
    // address state settles; order submit flag is local and starts false.
    renderCheckout();

    expect(
      await screen.findByRole('heading', { name: 'Thanh toán' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Đang xử lý...')).not.toBeInTheDocument();
  });
});
