import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CheckoutPage from '@/features/orders/pages/CheckoutPage';
import { PromotionInput } from '@/features/checkout';
import { orderService } from '@/services/order.service';
import { addressService } from '@/services/address.service';
import { promotionService } from '@/services/promotion.service';
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

vi.mock('@/services/promotion.service', () => ({
  promotionService: {
    validatePromotion: vi.fn(),
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

async function orderWithSavedAddress() {
  fireEvent.click(await screen.findByRole('button', { name: 'Chọn địa chỉ' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Đặt hàng' }));
}

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

describe('W4-S41 checkout loading and busy semantics', () => {
  it('announces the address loader politely', () => {
    vi.mocked(addressService.getAddresses).mockImplementation(
      () => new Promise(() => undefined)
    );
    renderCheckout();

    const statuses = screen.getAllByRole('status');
    expect(
      statuses.some((status) =>
        status.textContent?.includes('Đang tải địa chỉ...'),
      ),
    ).toBe(true);
  });

  it('marks the order button busy while order creation is pending', async () => {
    vi.mocked(orderService.createOrder).mockImplementation(
      () => new Promise(() => undefined)
    );
    renderCheckout();

    await orderWithSavedAddress();

    const loadingButton = await screen.findByRole('button', {
      name: /Đang xử lý/,
    });
    expect(loadingButton).toHaveAttribute('aria-busy', 'true');
    expect(loadingButton).toBeDisabled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('marks the manual form submit busy while order creation is pending', async () => {
    vi.mocked(addressService.getAddresses).mockResolvedValue({
      success: true,
      data: [],
    } as never);
    vi.mocked(orderService.createOrder).mockImplementation(
      () => new Promise(() => undefined)
    );
    renderCheckout();

    fireEvent.change(await screen.findByPlaceholderText('Nguyễn Văn A'), {
      target: { value: 'Nguyen Van A' },
    });
    fireEvent.change(screen.getByPlaceholderText('0901234567'), {
      target: { value: '0901234567' },
    });
    fireEvent.change(screen.getByPlaceholderText('Số nhà, tên đường'), {
      target: { value: '1 Pho X' },
    });
    fireEvent.change(screen.getByPlaceholderText('Phường 1'), {
      target: { value: 'Phuong 1' },
    });
    fireEvent.change(screen.getByPlaceholderText('Quận 1'), {
      target: { value: 'Quan 1' },
    });
    fireEvent.change(screen.getByPlaceholderText('TP. Hồ Chí Minh'), {
      target: { value: 'Ha Noi' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Đặt hàng' }));

    const loadingButton = await screen.findByRole('button', {
      name: /Đang xử lý/,
    });
    expect(loadingButton).toHaveAttribute('aria-busy', 'true');
    expect(loadingButton).toBeDisabled();
  });

  it('announces order failure once through role="alert" and clears busy', async () => {
    vi.mocked(orderService.createOrder).mockRejectedValue({
      response: { data: { message: 'Số lượng sản phẩm không đủ' } },
    } as never);
    renderCheckout();

    await orderWithSavedAddress();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Số lượng sản phẩm không đủ');
    expect(screen.getAllByRole('alert')).toHaveLength(1);

    const button = screen.getByRole('button', { name: 'Đặt hàng' });
    expect(button).toHaveAttribute('aria-busy', 'false');
    expect(button).toBeEnabled();
  });
});

describe('W4-S38 promotion failure feedback', () => {
  it('announces a promotion validation failure with role="alert"', async () => {
    vi.mocked(promotionService.validatePromotion).mockRejectedValue({
      response: { data: { message: 'Mã khuyến mãi không hợp lệ' } },
    } as never);

    render(
      <PromotionInput
        orderTotal={100000}
        appliedPromotion={null}
        onApplyPromotion={vi.fn()}
        onRemovePromotion={vi.fn()}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('Nhập mã khuyến mãi'), {
      target: { value: 'SALE' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Mã khuyến mãi không hợp lệ');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    // The alert is the only live region here — nothing is announced twice.
    expect(screen.queryByRole('status')).toBeNull();
  });
});
