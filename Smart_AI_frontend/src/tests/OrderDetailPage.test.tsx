import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuthStore } from '@/stores/authStore';
import { OrderDetailPage } from '@/features/orders/pages/OrderDetailPage';
import type { Order } from '@/types/order.type';

const mockOrder: Order = {
  id: 'order-1',
  orderNumber: 'ORD-TEST-001',
  user: { id: 'u1', name: 'Test User', email: 'test@test.com' },
  items: [
    { product: 'p1', name: 'Test Product', price: 500000, quantity: 2, color: 'Black', image: 'https://example.com/img.jpg' },
  ],
  shippingAddress: { fullName: 'Test User', phone: '0123456789', address: '123 St', ward: 'W', district: 'D', city: 'C' },
  subtotal: 1000000,
  shippingFee: 30000,
  total: 1030000,
  status: 'pending',
  statusHistory: [{ status: 'pending', timestamp: '2024-12-09T10:00:00.000Z' }],
  createdAt: '2024-12-09T10:00:00.000Z',
  updatedAt: '2024-12-09T10:00:00.000Z',
};

vi.mock('@/services/order.service', () => ({
  orderService: {
    getOrderById: vi.fn(),
    cancelOrder: vi.fn(),
  },
}));

import { orderService } from '@/services/order.service';

const mockGetOrderById = orderService.getOrderById as ReturnType<typeof vi.fn>;

function renderAtRoute(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/orders/:id" element={<OrderDetailPage />} />
        <Route path="/orders" element={<div data-testid="orders-list-page">Orders List</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('OrderDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: { _id: 'u1', name: 'Test', email: 't@t.com', role: 'user', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }, isAuthenticated: true, isLoading: false });
  });

  it('renders order details when API succeeds', async () => {
    mockGetOrderById.mockResolvedValue({ success: true, data: mockOrder, message: '' });

    renderAtRoute('/orders/order-1');

    await waitFor(() => {
      expect(screen.getByText('Chi tiết đơn hàng ORD-TEST-001')).toBeInTheDocument();
    });

    expect(screen.getByText('Test Product')).toBeInTheDocument();
  });

  it('shows loading skeleton while fetching', () => {
    mockGetOrderById.mockReturnValue(new Promise(() => {}));

    renderAtRoute('/orders/order-1');

    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('handles 401/403 unauthorized error', async () => {
    mockGetOrderById.mockRejectedValue({ response: { status: 401 } });

    renderAtRoute('/orders/order-1');

    await waitFor(() => {
      expect(screen.getByText('Bạn cần đăng nhập để xem thông tin đơn hàng')).toBeInTheDocument();
    });
  });

  it('handles 404 not found error', async () => {
    mockGetOrderById.mockRejectedValue({ response: { status: 404 } });

    renderAtRoute('/orders/order-1');

    await waitFor(() => {
      expect(screen.getByText('Không tìm thấy đơn hàng')).toBeInTheDocument();
    });
  });

  it('handles generic API error', async () => {
    mockGetOrderById.mockRejectedValue(new Error('Network error'));

    renderAtRoute('/orders/order-1');

    await waitFor(() => {
      expect(screen.getByText('Đã xảy ra lỗi khi tải thông tin đơn hàng')).toBeInTheDocument();
    });
  });
});
