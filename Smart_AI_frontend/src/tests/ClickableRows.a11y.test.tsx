import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { OrderTable } from '@/features/orders/components/OrderTable';
import { OrderCard } from '@/features/orders/components/OrderCard';
import { StoreCard } from '@/features/stores/components/StoreCard';
import { ComplaintTable } from '@/features/complaints/components/ComplaintTable';
import type { Order } from '@/types/order.type';
import type { Pagination } from '@/types/api.type';
import type { Complaint } from '@/types/complaint.type';
import type { StoreWithDistance } from '@/features/stores/types';

const order = {
  _id: 'o1',
  orderNumber: 'ORD-42',
  status: 'pending',
  total: 1290000,
  createdAt: '2024-01-01T00:00:00.000Z',
  user: { name: 'Nguyen Van A', email: 'a@b.com' },
  items: [],
} as unknown as Order;

const pagination: Pagination = {
  currentPage: 1,
  totalPages: 1,
  totalCount: 1,
  limit: 10,
  hasNextPage: false,
  hasPrevPage: false,
  nextPage: null,
  prevPage: null,
};

function buildBusinessHours() {
  const day = { open: '08:00', close: '21:00', isClosed: false };
  return {
    monday: day,
    tuesday: day,
    wednesday: day,
    thursday: day,
    friday: day,
    saturday: day,
    sunday: day,
  };
}

const store = {
  id: 's1',
  name: 'Smart AI Store',
  address: {
    street: '123 Test St',
    ward: 'Ward 1',
    district: 'District 1',
    city: 'Ho Chi Minh City',
    fullAddress: '123 Test St, Ward 1, District 1, Ho Chi Minh City',
  },
  location: { type: 'Point', coordinates: [106.6297, 10.8231] },
  phone: '0901234567',
  email: 'store@example.com',
  businessHours: buildBusinessHours(),
  isActive: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
} as unknown as StoreWithDistance;

const complaint = {
  id: 'CMP-abcdefgh-1234',
  sessionId: 's1',
  complaintSummary: 'Sản phẩm bị lỗi',
  status: 'open',
  priority: 'high',
  tags: [],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
} as unknown as Complaint;

describe('Clickable rows and cards are keyboard reachable (H04)', () => {
  it('OrderTable: the order number button opens the order with the keyboard', async () => {
    const onOrderClick = vi.fn();
    render(
      <OrderTable
        orders={[order]}
        pagination={pagination}
        onPageChange={vi.fn()}
        onOrderClick={onOrderClick}
      />
    );

    const button = screen.getByRole('button', {
      name: 'Xem chi tiết đơn hàng ORD-42',
    });
    button.focus();
    await userEvent.keyboard('{Enter}');
    expect(onOrderClick).toHaveBeenCalledTimes(1);

    onOrderClick.mockClear();
    await userEvent.keyboard(' ');
    expect(onOrderClick).toHaveBeenCalledTimes(1);
  });

  it('OrderTable: clicking elsewhere on the row still works for mouse users', () => {
    const onOrderClick = vi.fn();
    render(
      <OrderTable
        orders={[order]}
        pagination={pagination}
        onPageChange={vi.fn()}
        onOrderClick={onOrderClick}
      />
    );

    const nameCell = screen.getByText('Nguyen Van A').closest('td');
    fireEvent.click(nameCell as HTMLElement);
    expect(onOrderClick).toHaveBeenCalledTimes(1);
    // The button click must not double-fire the row handler
    fireEvent.click(
      screen.getByRole('button', { name: 'Xem chi tiết đơn hàng ORD-42' })
    );
    expect(onOrderClick).toHaveBeenCalledTimes(2);
  });

  it('OrderCard: the order number button activates with the keyboard', async () => {
    const onClick = vi.fn();
    render(<OrderCard order={order} onClick={onClick} />);

    const button = screen.getByRole('button', {
      name: 'Xem chi tiết đơn hàng ORD-42',
    });
    button.focus();
    await userEvent.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('OrderCard: renders plain text when no click handler is provided', () => {
    render(<OrderCard order={order} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('ORD-42')).toBeInTheDocument();
  });

  it('StoreCard: the store name button selects the store with the keyboard', async () => {
    const onSelect = vi.fn();
    render(
      <StoreCard
        store={store}
        onSelect={onSelect}
        onViewDetails={vi.fn()}
      />
    );

    const button = screen.getByRole('button', {
      name: 'Chọn cửa hàng Smart AI Store',
    });
    button.focus();
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('ComplaintTable: the id button announces its action and opens with the keyboard', async () => {
    const onRowClick = vi.fn();
    render(
      <ComplaintTable
        complaints={[complaint]}
        isLoading={false}
        pagination={pagination}
        onPageChange={vi.fn()}
        onRowClick={onRowClick}
      />
    );

    // Accessible name contains the visible id text plus the announced action
    const button = screen.getByRole('button', {
      name: 'Xem chi tiết khiếu nại CMP-abcd...',
    });
    button.focus();
    await userEvent.keyboard('{Enter}');
    expect(onRowClick).toHaveBeenCalledTimes(1);

    // Mouse row click still works and the button click does not double-fire
    onRowClick.mockClear();
    fireEvent.click(screen.getByText('Sản phẩm bị lỗi').closest('td') as HTMLElement);
    expect(onRowClick).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Xem chi tiết khiếu nại CMP-abcd...' })
    );
    expect(onRowClick).toHaveBeenCalledTimes(2);
  });
});
