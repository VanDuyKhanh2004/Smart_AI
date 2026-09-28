import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuthStore } from '@/stores/authStore';
import { useCartStore } from '@/stores/cartStore';
import { useWishlistStore } from '@/stores/wishlistStore';
import { bannerData } from '@/constants/banners';
import CartPage from '@/features/cart/pages/CartPage';
import CheckoutPage from '@/features/orders/pages/CheckoutPage';
import CompareHistoryPage from '@/features/compare/pages/CompareHistoryPage';
import BannerCarousel from '@/features/products/components/BannerCarousel';
import ProfilePage from '@/features/profile/pages/ProfilePage';
import WishlistPage from '@/features/wishlist/pages/WishlistPage';
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

const mockGetHistory = vi.fn();
const mockDeleteFromHistory = vi.fn();

vi.mock('@/services/compare.service', () => ({
  compareService: {
    getHistory: (...args: unknown[]) => mockGetHistory(...args),
    deleteFromHistory: (...args: unknown[]) => mockDeleteFromHistory(...args),
  },
}));

const mockCarouselApi = vi.hoisted(() => ({
  api: {
    selectedScrollSnap: vi.fn(() => 0),
    on: vi.fn(),
    canScrollNext: vi.fn(() => false),
    scrollNext: vi.fn(),
    scrollTo: vi.fn(),
  },
}));

vi.mock('@/components/ui/carousel', async () => {
  const react = await import('react');
  return {
    Carousel: ({
      setApi,
      children,
    }: {
      setApi: (api: unknown) => void;
      children: React.ReactNode;
    }) => {
      react.useEffect(() => {
        setApi(mockCarouselApi.api);
      }, [setApi]);
      return react.createElement('div', { 'data-testid': 'carousel' }, children);
    },
    CarouselContent: ({ children }: { children: React.ReactNode }) =>
      react.createElement('div', null, children),
    CarouselItem: ({ children }: { children: React.ReactNode }) =>
      react.createElement('div', null, children),
    CarouselPrevious: () =>
      react.createElement('button', { 'aria-label': 'Previous slide' }, 'prev'),
    CarouselNext: () =>
      react.createElement('button', { 'aria-label': 'Next slide' }, 'next'),
    CarouselApi: class {},
  };
});

const user: User = {
  _id: 'u1',
  name: 'Test User',
  email: 'test@example.com',
  role: 'user',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

function setAuth(authenticated: boolean, withUser = authenticated) {
  useAuthStore.setState({
    isAuthenticated: authenticated,
    isLoading: false,
    user: withUser ? user : null,
    accessToken: authenticated ? 'tok' : null,
    error: null,
    errorCode: null,
  });
}

function expectNoNestedInteractive(container: HTMLElement | null) {
  expect(container).not.toBeNull();
  expect(container!.querySelector('a button')).toBeNull();
  expect(container!.querySelector('button a')).toBeNull();
}

function renderPage(ui: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={['/test']}>
      <Routes>
        <Route path="/test" element={ui} />
      </Routes>
    </MemoryRouter>
  );
}

describe('D1-1: no nested interactive controls in rendered feature pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useCartStore.setState({ items: [], isLoading: false, error: null });
    useWishlistStore.setState({ items: [], isLoading: false, error: null });
    mockGetHistory.mockResolvedValue({ success: true, data: [] });
  });

  it('CartPage empty state: CTA is a single link (no a > button)', async () => {
    setAuth(false);
    const { container } = renderPage(<CartPage />);

    const link = await screen.findByRole('link', { name: 'Tiếp tục mua sắm' });
    expect(link).toHaveAttribute('href', '/products');
    expectNoNestedInteractive(container);
  });

  it('CheckoutPage empty-cart state: CTA is a single link', async () => {
    setAuth(true);
    const { container } = renderPage(<CheckoutPage />);

    const link = await screen.findByRole('link', { name: 'Tiếp tục mua sắm' });
    expect(link).toHaveAttribute('href', '/products');
    expectNoNestedInteractive(container);
  });

  it('CompareHistoryPage unauthenticated state: login CTA is a single link', async () => {
    setAuth(false);
    const { container } = renderPage(<CompareHistoryPage />);

    const link = await screen.findByRole('link', { name: 'Đăng nhập' });
    expect(link).toHaveAttribute('href', '/login');
    expectNoNestedInteractive(container);
  });

  it('CompareHistoryPage empty-history state: explore CTA is a single link', async () => {
    setAuth(true);
    const { container } = renderPage(<CompareHistoryPage />);

    const link = await screen.findByRole('link', { name: 'Khám phá sản phẩm' });
    expect(link).toHaveAttribute('href', '/products');
    expectNoNestedInteractive(container);
  });

  it('BannerCarousel: every banner CTA is a single link', async () => {
    const { container } = renderPage(<BannerCarousel />);

    for (const banner of bannerData) {
      const links = await screen.findAllByRole('link', { name: banner.buttonText });
      expect(links.length).toBeGreaterThanOrEqual(1);
      links.forEach((link) => {
        expect(link).toHaveAttribute('href', banner.buttonLink);
      });
    }
    expectNoNestedInteractive(container);
  });

  it('ProfilePage error state: re-login CTA is a single link', () => {
    setAuth(false, false);
    useAuthStore.setState({ user: null, isLoading: false });
    const { container } = renderPage(<ProfilePage />);

    const link = screen.getByRole('link', { name: 'Đăng nhập lại' });
    expect(link).toHaveAttribute('href', '/login');
    expectNoNestedInteractive(container);
  });

  it('ProfilePage addresses tab: manage-addresses CTA is a single link', async () => {
    setAuth(true);
    useAuthStore.setState({ isLoading: false, user });
    const { container } = renderPage(<ProfilePage />);

    await userEvent.click(screen.getByRole('tab', { name: 'Địa chỉ giao hàng' }));

    const link = await screen.findByRole('link', { name: 'Quản lý địa chỉ' });
    expect(link).toHaveAttribute('href', '/profile/addresses');
    expectNoNestedInteractive(container);
  });

  it('WishlistPage empty state: explore CTA is a single link', async () => {
    setAuth(false);
    const { container } = renderPage(<WishlistPage />);

    const link = await screen.findByRole('link', { name: 'Khám phá sản phẩm' });
    expect(link).toHaveAttribute('href', '/products');
    expectNoNestedInteractive(container);
  });
});
