import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminOrderDetailDialog } from '@/features/orders/components/AdminOrderDetailDialog';
import type { Order, UpdateOrderStatusRequest } from '@/types/order.type';

function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
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
    ...overrides,
  };
}

const mockOnUpdateStatus = vi.fn();
const mockOnClose = vi.fn();
const mockOnRefreshOrder = vi.fn();

function renderDialog(status: string) {
  return render(
    <AdminOrderDetailDialog
      order={buildOrder({ status: status as Order['status'] })}
      isOpen={true}
      onClose={mockOnClose}
      onUpdateStatus={mockOnUpdateStatus}
      onRefreshOrder={mockOnRefreshOrder}
    />
  );
}

describe('AdminOrderDetailDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('status dropdown options', () => {
    it('pending dropdown shows confirmed and cancelled', () => {
      renderDialog('pending');
      fireEvent.click(screen.getByRole('combobox'));
      expect(screen.getByRole('option', { name: 'Đã xác nhận' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Đã hủy' })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Đang xử lý' })).not.toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Đang giao' })).not.toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Đã giao' })).not.toBeInTheDocument();
    });

    it('confirmed dropdown shows processing and cancelled', () => {
      renderDialog('confirmed');
      fireEvent.click(screen.getByRole('combobox'));
      expect(screen.getByRole('option', { name: 'Đang xử lý' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Đã hủy' })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Chờ xác nhận' })).not.toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Đang giao' })).not.toBeInTheDocument();
    });

    it('processing dropdown shows shipping and cancelled', () => {
      renderDialog('processing');
      fireEvent.click(screen.getByRole('combobox'));
      expect(screen.getByRole('option', { name: 'Đang giao' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Đã hủy' })).toBeInTheDocument();
    });

    it('shipping dropdown shows delivered and cancelled', () => {
      renderDialog('shipping');
      fireEvent.click(screen.getByRole('combobox'));
      expect(screen.getByRole('option', { name: 'Đã giao' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Đã hủy' })).toBeInTheDocument();
    });

    it('delivered dropdown shows only current status disabled option', () => {
      renderDialog('delivered');
      fireEvent.click(screen.getByRole('combobox'));
      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(1);
      expect(options[0]).toHaveTextContent('Đã giao');
    });

    it('cancelled dropdown shows only current status disabled option', () => {
      renderDialog('cancelled');
      fireEvent.click(screen.getByRole('combobox'));
      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(1);
      expect(options[0]).toHaveTextContent('Đã hủy');
    });
  });

  describe('update button behavior', () => {
    it('disabled when no new status selected', () => {
      renderDialog('pending');
      expect(screen.getByRole('button', { name: /cập nhật/i })).toBeDisabled();
    });

    it('disabled when selected status equals current status', () => {
      renderDialog('pending');
      fireEvent.click(screen.getByRole('combobox'));
      fireEvent.click(screen.getByRole('option', { name: 'Chờ xác nhận' }));
      fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
      expect(screen.getByRole('button', { name: /cập nhật/i })).toBeDisabled();
    });

    it('enabled when valid next status selected', () => {
      renderDialog('pending');
      fireEvent.click(screen.getByRole('combobox'));
      fireEvent.click(screen.getByRole('option', { name: 'Đã xác nhận' }));
      expect(screen.getByRole('button', { name: /cập nhật/i })).not.toBeDisabled();
    });

    it('disabled while request is in progress', async () => {
      mockOnUpdateStatus.mockImplementation(() => new Promise(() => {}));
      renderDialog('pending');
      fireEvent.click(screen.getByRole('combobox'));
      fireEvent.click(screen.getByRole('option', { name: 'Đã xác nhận' }));
      fireEvent.click(screen.getByRole('button', { name: /cập nhật/i }));
      expect(screen.getByRole('button', { name: /cập nhật/i })).toBeDisabled();
    });
  });

  describe('successful update', () => {
    it('calls onUpdateStatus with correct params', async () => {
      mockOnUpdateStatus.mockResolvedValue(undefined);
      renderDialog('pending');
      fireEvent.click(screen.getByRole('combobox'));
      fireEvent.click(screen.getByRole('option', { name: 'Đã xác nhận' }));
      fireEvent.click(screen.getByRole('button', { name: /cập nhật/i }));

      await waitFor(() => {
        expect(mockOnUpdateStatus).toHaveBeenCalledWith('order-1', expect.objectContaining({ status: 'confirmed' }));
      });
    });
  });

  describe('error handling', () => {
    it('shows backend error message on INVALID_STATUS_TRANSITION', async () => {
      mockOnUpdateStatus.mockRejectedValue({
        response: { data: { message: 'Không thể chuyển từ trạng thái "pending" sang "delivered"', code: 'INVALID_STATUS_TRANSITION' } },
      });
      renderDialog('pending');
      fireEvent.click(screen.getByRole('combobox'));
      fireEvent.click(screen.getByRole('option', { name: 'Đã xác nhận' }));
      fireEvent.click(screen.getByRole('button', { name: /cập nhật/i }));

      await waitFor(() => {
        expect(screen.getByText(/Không thể chuyển/)).toBeInTheDocument();
      });
    });

    it('refetches order on INVALID_STATUS_TRANSITION', async () => {
      mockOnUpdateStatus.mockRejectedValue({
        response: { data: { message: 'Invalid transition', code: 'INVALID_STATUS_TRANSITION' } },
      });
      renderDialog('pending');
      fireEvent.click(screen.getByRole('combobox'));
      fireEvent.click(screen.getByRole('option', { name: 'Đã xác nhận' }));
      fireEvent.click(screen.getByRole('button', { name: /cập nhật/i }));

      await waitFor(() => {
        expect(mockOnRefreshOrder).toHaveBeenCalledWith('order-1');
      });
    });

    it('shows safe fallback for generic 500 error', async () => {
      mockOnUpdateStatus.mockRejectedValue({ response: { status: 500, data: {} } });
      renderDialog('pending');
      fireEvent.click(screen.getByRole('combobox'));
      fireEvent.click(screen.getByRole('option', { name: 'Đã xác nhận' }));
      fireEvent.click(screen.getByRole('button', { name: /cập nhật/i }));

      await waitFor(() => {
        expect(screen.getByText(/Cập nhật trạng thái thất bại/)).toBeInTheDocument();
      });
    });
  });
});
