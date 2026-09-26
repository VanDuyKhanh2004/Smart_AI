import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CheckoutPage from '@/features/orders/pages/CheckoutPage';
import { orderService } from '@/services/order.service';
import { addressService } from '@/services/address.service';
import { useCartStore } from '@/stores/cartStore';
import { useAuthStore } from '@/stores/authStore';
import type { CartItem } from '@/types/cart.type';
import type { Address } from '@/types/address.type';
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
    getAddresses: vi.fn(),
  },
}));

vi.mock('@/features/addresses', () => ({
  AddressSelector: ({
    onSelectAddress,
  }: {
    onSelectAddress: (address: Address) => void;
  }) => (
    <button type="button" onClick={() => onSelectAddress(savedAddress)}>
      Chọn địa chỉ
    </button>
  ),
}));

vi.mock('@/features/checkout', () => ({
  PromotionInput: () => <div data-testid="promotion-input" />,
}));

const mockFetchCart = vi.fn();
const mockClearCart = vi.fn();

const savedAddress: Address = {
  id: 'a1',
  label: 'home',
  fullName: 'Nguyen Van A',
  phone: '0901234567',
  address: '1 Pho X',
  ward: 'Phuong 1',
  district: 'Quan 1',
  city: 'Ha Noi',
  isDefault: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

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
        <Route path="/orders" element={<div>orders-page</div>} />
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

async function selectAddressAndOrder(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Chọn địa chỉ' }));
  await user.click(await screen.findByRole('button', { name: 'Đặt hàng' }));
}

describe('CheckoutPage order submission (H01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchCart.mockResolvedValue(undefined);
    mockClearCart.mockResolvedValue(undefined);
    vi.mocked(addressService.getAddresses).mockResolvedValue({
      success: true,
      data: [savedAddress],
    } as never);
    setAuth(true);
    setCart({ items: [item], isLoading: false });
  });

  it('reports success and navigates when order creation succeeds', async () => {
    vi.mocked(orderService.createOrder).mockResolvedValue({
      data: { orderNumber: 'ORD-100' },
    } as never);
    const user = userEvent.setup();

    renderCheckout();
    await selectAddressAndOrder(user);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/orders', {
        state: { orderCreated: true, orderNumber: 'ORD-100' },
      });
    });
    expect(mockClearCart).toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the order failure message when order creation rejects', async () => {
    vi.mocked(orderService.createOrder).mockRejectedValue({
      response: { data: { message: 'Số lượng sản phẩm không đủ' } },
    } as never);
    const user = userEvent.setup();

    renderCheckout();
    await selectAddressAndOrder(user);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Số lượng sản phẩm không đủ');
    expect(mockNavigate).not.toHaveBeenCalledWith(
      '/orders',
      expect.anything()
    );
    expect(mockClearCart).not.toHaveBeenCalled();
    // Submission state is finalized on order failure: the button is usable again.
    expect(screen.getByRole('button', { name: 'Đặt hàng' })).toBeEnabled();
  });

  it('still reports order success when clearing the cart fails', async () => {
    vi.mocked(orderService.createOrder).mockResolvedValue({
      data: { orderNumber: 'ORD-200' },
    } as never);
    mockClearCart.mockRejectedValue(new Error('cart service down'));
    const user = userEvent.setup();

    renderCheckout();
    await selectAddressAndOrder(user);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/orders', {
        state: { orderCreated: true, orderNumber: 'ORD-200' },
      });
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // The cleanup failure must not trigger another order creation attempt.
    expect(vi.mocked(orderService.createOrder)).toHaveBeenCalledTimes(1);
  });

  it('shows the submission loading state while order creation is pending', async () => {
    vi.mocked(orderService.createOrder).mockImplementation(
      () => new Promise(() => undefined)
    );
    const user = userEvent.setup();

    renderCheckout();
    await selectAddressAndOrder(user);

    const loadingButton = await screen.findByRole('button', {
      name: /Đang xử lý/,
    });
    expect(loadingButton).toBeDisabled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
