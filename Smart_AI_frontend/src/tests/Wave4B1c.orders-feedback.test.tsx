import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { OrderHistoryPage } from '@/features/orders/pages/OrderHistoryPage';
import { OrderDetailPage } from '@/features/orders/pages/OrderDetailPage';
import { OrderCard } from '@/features/orders/components/OrderCard';
import { orderService } from '@/services/order.service';
import type { Order } from '@/types/order.type';

vi.mock('@/services/order.service', () => ({
  orderService: {
    getUserOrders: vi.fn(),
    getOrderById: vi.fn(),
    cancelOrder: vi.fn(),
  },
}));

function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    orderNumber: 'ORD-100',
    user: { id: 'u1', name: 'Test User', email: 'test@test.com' },
    items: [
      {
        product: 'p1',
        name: 'Test Product',
        price: 500000,
        quantity: 2,
        color: 'Black',
        image: 'https://example.com/img.jpg',
      },
    ],
    shippingAddress: {
      fullName: 'Test User',
      phone: '0123456789',
      address: '123 St',
      ward: 'W',
      district: 'D',
      city: 'C',
    },
    subtotal: 1000000,
    shippingFee: 30000,
    total: 1030000,
    status: 'pending',
    statusHistory: [{ status: 'pending', timestamp: '2024-12-09T10:00:00.000Z' }],
    createdAt: '2024-12-09T10:00:00.000Z',
    updatedAt: '2024-12-09T10:00:00.000Z',
    ...overrides,
  };
}

function listResponse(orders: Order[]) {
  return {
    success: true,
    data: orders,
    pagination: {
      page: 1,
      currentPage: 1,
      totalPages: 1,
      totalCount: orders.length,
      total: orders.length,
      limit: 10,
    },
  };
}

function renderHistory() {
  return render(
    <MemoryRouter initialEntries={['/orders']}>
      <Routes>
        <Route path="/orders" element={<OrderHistoryPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('M07 successful cancellation feedback', () => {
  it('announces a successful cancellation through a success status region', async () => {
    vi.mocked(orderService.getUserOrders).mockResolvedValue(
      listResponse([buildOrder()])
    );
    vi.mocked(orderService.cancelOrder).mockResolvedValue({
      success: true,
      data: buildOrder({
        status: 'cancelled',
        cancelReason: 'changed_mind',
        cancelledAt: '2024-12-10T10:00:00.000Z',
      }),
    } as never);

    renderHistory();

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Xem chi tiết đơn hàng ORD-100',
      })
    );

    const detailDialog = await screen.findByRole('dialog');
    fireEvent.click(
      within(detailDialog).getByRole('button', { name: /Hủy đơn hàng/ })
    );

    await screen.findByRole('button', { name: 'Xác nhận hủy' });
    fireEvent.click(screen.getAllByRole('radio')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận hủy' }));

    const title = await screen.findByText('Hủy đơn hàng thành công');
    expect(title.closest('[role="status"]')).not.toBeNull();
    expect(
      screen.getByText('Đơn hàng ORD-100 đã được hủy.')
    ).toBeInTheDocument();
    expect(orderService.cancelOrder).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});

describe('M09 order fetch errors are announced', () => {
  it('exposes the order list fetch failure as role="alert"', async () => {
    vi.mocked(orderService.getUserOrders).mockRejectedValue(
      new Error('network down')
    );

    renderHistory();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Đã xảy ra lỗi khi tải danh sách đơn hàng');
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });

  it('exposes the order detail fetch failure as role="alert"', async () => {
    vi.mocked(orderService.getOrderById).mockRejectedValue(
      Object.assign(new Error('not found'), { response: { status: 404 } })
    );

    render(
      <MemoryRouter initialEntries={['/orders/o1']}>
        <Routes>
          <Route path="/orders/:id" element={<OrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Không tìm thấy đơn hàng');
  });
});

describe('M10 order loading status semantics', () => {
  it('announces the order list skeleton through role="status"', () => {
    vi.mocked(orderService.getUserOrders).mockReturnValue(
      new Promise(() => undefined) as never
    );

    renderHistory();

    expect(
      screen.getByRole('status', { name: 'Đang tải đơn hàng' })
    ).toBeInTheDocument();
  });
});

describe('M11 promotion discount contrast classes', () => {
  it('renders the discount amount with the darker green-700 class', () => {
    const order = buildOrder({
      promotion: {
        code: 'SAVE10',
        discountType: 'percentage',
        discountValue: 10,
        discountAmount: 100000,
      },
    });

    const { container } = render(<OrderCard order={order} />);

    expect(container.querySelector('.text-green-700')).not.toBeNull();
    expect(container.querySelector('.text-green-600')).toBeNull();
  });
});
