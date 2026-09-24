import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrderHistoryPage } from '@/features/orders/pages/OrderHistoryPage';

const mockGetUserOrders = vi.fn();

vi.mock('@/services/order.service', () => ({
  orderService: {
    getUserOrders: (...args: unknown[]) => mockGetUserOrders(...args),
  },
}));

vi.mock('@/features/orders/components/OrderDetailDialog', () => ({
  OrderDetailDialog: () => null,
}));

vi.mock('@/features/orders/components/OrderCard', () => ({
  OrderCard: ({ order }: { order: { orderNumber?: string } }) => (
    <div data-testid="order-card">{order.orderNumber ?? 'order'}</div>
  ),
}));

function emptyListResponse() {
  return {
    success: true,
    data: [],
    pagination: {
      page: 1,
      currentPage: 1,
      totalPages: 1,
      totalCount: 0,
      limit: 10,
    },
  };
}

function listOfOneOrder() {
  return {
    success: true,
    data: [
      {
        _id: 'o1',
        id: 'o1',
        orderNumber: 'ORD-100',
        status: 'pending',
        totalAmount: 1000000,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ],
    pagination: {
      page: 1,
      currentPage: 1,
      totalPages: 1,
      totalCount: 1,
      limit: 10,
    },
  };
}

function renderPage(
  state?: { orderCreated?: boolean; orderNumber?: string } | null
) {
  const entry =
    state === undefined
      ? '/orders'
      : { pathname: '/orders', state };
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/orders" element={<OrderHistoryPage />} />
        <Route path="/products" element={<div>products-page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('OrderHistoryPage post-purchase confirmation (ECOM-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserOrders.mockResolvedValue(emptyListResponse());
  });

  it('shows success Alert with orderNumber when navigation state has orderCreated', async () => {
    renderPage({ orderCreated: true, orderNumber: 'ORD-123' });

    expect(
      await screen.findByText('Đặt hàng thành công')
    ).toBeInTheDocument();
    expect(screen.getByText('ORD-123')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Tiếp tục mua sắm' })
    ).toHaveAttribute('href', '/products');
    expect(
      screen.getByRole('button', {
        name: 'Đóng thông báo đặt hàng thành công',
      })
    ).toBeInTheDocument();
  });

  it('handles missing orderNumber safely', async () => {
    renderPage({ orderCreated: true });

    expect(
      await screen.findByText('Đặt hàng thành công')
    ).toBeInTheDocument();
    expect(screen.queryByText(/ORD-/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Cảm ơn bạn đã mua hàng/)
    ).toBeInTheDocument();
  });

  it('dismiss clears confirmation state', async () => {
    const user = userEvent.setup();
    renderPage({ orderCreated: true, orderNumber: 'ORD-9' });

    expect(
      await screen.findByText('Đặt hàng thành công')
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: 'Đóng thông báo đặt hàng thành công',
      })
    );

    await waitFor(() => {
      expect(
        screen.queryByText('Đặt hàng thành công')
      ).not.toBeInTheDocument();
    });
  });

  it('does not show confirmation without navigation state', async () => {
    renderPage();

    await waitFor(() => expect(mockGetUserOrders).toHaveBeenCalled());
    expect(
      screen.queryByText('Đặt hàng thành công')
    ).not.toBeInTheDocument();
    expect(screen.getByText('Chưa có đơn hàng nào')).toBeInTheDocument();
  });

  it('keeps existing empty state compatible with confirmation absent', async () => {
    mockGetUserOrders.mockResolvedValue(listOfOneOrder());
    renderPage();

    expect(await screen.findByTestId('order-card')).toBeInTheDocument();
    expect(
      screen.queryByText('Đặt hàng thành công')
    ).not.toBeInTheDocument();
  });

  it('shows error state distinctly', async () => {
    mockGetUserOrders.mockRejectedValue(new Error('fail'));
    renderPage();

    expect(
      await screen.findByText('Đã xảy ra lỗi khi tải danh sách đơn hàng')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Đặt hàng thành công')
    ).not.toBeInTheDocument();
  });
});
