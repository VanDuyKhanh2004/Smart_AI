import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminQAPage } from '@/features/admin/pages/AdminQAPage';
import { AdminOrderPage } from '@/features/orders/pages/AdminOrderPage';
import { AdminOrderDetailDialog } from '@/features/orders/components/AdminOrderDetailDialog';
import { OrderFilters } from '@/features/orders/components/OrderFilters';
import { OrderTable } from '@/features/orders/components/OrderTable';
import type { Question } from '@/types/qa.type';
import type { Order } from '@/types/order.type';

const mockGetAllQuestions = vi.fn();
const mockUpdateQuestionStatus = vi.fn();
const mockDeleteQuestion = vi.fn();
const mockCreateAnswer = vi.fn();
const mockDeleteAnswer = vi.fn();
const mockGetAllProducts = vi.fn();

vi.mock('@/services/qa.service', () => ({
  qaService: {
    getAllQuestions: (...args: unknown[]) => mockGetAllQuestions(...args),
    updateQuestionStatus: (...args: unknown[]) => mockUpdateQuestionStatus(...args),
    deleteQuestion: (...args: unknown[]) => mockDeleteQuestion(...args),
    createAnswer: (...args: unknown[]) => mockCreateAnswer(...args),
    deleteAnswer: (...args: unknown[]) => mockDeleteAnswer(...args),
  },
}));

vi.mock('@/services/product.service', () => ({
  productService: {
    getAllProducts: (...args: unknown[]) => mockGetAllProducts(...args),
  },
}));

const mockGetAllOrders = vi.fn();
const mockGetOrderStats = vi.fn();
const mockUpdateOrderStatus = vi.fn();
const mockGetOrderById = vi.fn();

vi.mock('@/services/order.service', () => ({
  orderService: {
    getAllOrders: (...args: unknown[]) => mockGetAllOrders(...args),
    getOrderStats: (...args: unknown[]) => mockGetOrderStats(...args),
    updateOrderStatus: (...args: unknown[]) => mockUpdateOrderStatus(...args),
    getOrderById: (...args: unknown[]) => mockGetOrderById(...args),
  },
}));

function makeAnswer(overrides: Partial<Question['answers'][number]> = {}) {
  return {
    _id: 'ans1',
    question: 'q1',
    user: { _id: 'u2', name: 'Trần Văn Tư' },
    answerText: 'Sản phẩm có màu xanh.',
    isOfficial: true,
    isAISuggestion: false,
    createdAt: '2024-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    _id: 'q1',
    product: 'p1',
    user: { _id: 'u1', name: 'Nguyễn Văn A' },
    questionText: 'Sản phẩm này có màu xanh không?',
    status: 'answered',
    upvoteCount: 1,
    hasUpvoted: false,
    answers: [makeAnswer()],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function questionListResponse(questions: Question[]) {
  return {
    success: true,
    message: 'ok',
    data: {
      questions,
      pagination: {
        currentPage: 1,
        totalPages: 1,
        totalCount: questions.length,
        limit: 10,
        hasNextPage: false,
        hasPrevPage: false,
        nextPage: null,
        prevPage: null,
      },
    },
  };
}

function productListResponse() {
  return {
    success: true,
    message: 'ok',
    data: {
      products: [],
      pagination: {
        currentPage: 1,
        totalPages: 1,
        totalCount: 0,
        limit: 10,
        hasNextPage: false,
        hasPrevPage: false,
        nextPage: null,
        prevPage: null,
      },
    },
  };
}

function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    orderNumber: 'ORD-GC-001',
    user: { id: 'u1', name: 'Test User', email: 'test@test.com' },
    items: [
      { product: 'p1', name: 'Test Product', price: 500000, quantity: 2, color: 'Black', image: 'https://example.com/img.jpg' },
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

function ordersListResponse(orders: Order[]) {
  return {
    success: true,
    data: orders,
    pagination: { page: 1, totalPages: 1, limit: 10, total: orders.length },
  };
}

function statsResponse() {
  return {
    success: true,
    data: {
      total: 1,
      byStatus: { pending: 1, confirmed: 0, processing: 0, shipping: 0, delivered: 0, cancelled: 0 },
    },
  };
}

const mockOnUpdateStatus = vi.fn();
const mockOnClose = vi.fn();
const mockOnRefreshOrder = vi.fn();

function renderDialog(status: Order['status'] = 'pending') {
  return render(
    <AdminOrderDetailDialog
      order={buildOrder({ status })}
      isOpen={true}
      onClose={mockOnClose}
      onUpdateStatus={mockOnUpdateStatus}
      onRefreshOrder={mockOnRefreshOrder}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAllQuestions.mockResolvedValue(questionListResponse([makeQuestion()]));
  mockGetAllProducts.mockResolvedValue(productListResponse());
  mockGetAllOrders.mockResolvedValue(ordersListResponse([buildOrder()]));
  mockGetOrderStats.mockResolvedValue(statsResponse());
});

describe('Wave4B-2 G-C — M10: AdminQAPage icon-only action buttons', () => {
  it('names the expand/collapse, delete-question and delete-answer buttons and toggles aria-expanded', async () => {
    render(<AdminQAPage />);

    const expand = await screen.findByRole('button', { name: 'Câu trả lời của Nguyễn Văn A' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');

    expect(
      screen.getByRole('button', { name: 'Xóa câu hỏi của Nguyễn Văn A' })
    ).toBeInTheDocument();

    fireEvent.click(expand);
    expect(
      screen.getByRole('button', { name: 'Câu trả lời của Nguyễn Văn A' })
    ).toHaveAttribute('aria-expanded', 'true');

    expect(
      await screen.findByRole('button', { name: 'Xóa câu trả lời của Trần Văn Tư' })
    ).toBeInTheDocument();
  });
});

describe('Wave4B-2 G-C — M11, M12, S08: OrderFilters accessible names', () => {
  it('labels the search input and both date inputs (S08 status label already present)', () => {
    render(
      <OrderFilters filters={{}} onFilterChange={vi.fn()} onClearFilters={vi.fn()} />
    );

    expect(screen.getByRole('textbox', { name: 'Tìm kiếm đơn hàng' })).toBeInTheDocument();

    const from = screen.getByLabelText('Từ ngày');
    const to = screen.getByLabelText('Đến ngày');
    expect(from).toHaveAttribute('type', 'date');
    expect(to).toHaveAttribute('type', 'date');

    // S08: status combobox already labeled by G-B — guard against regressions.
    expect(screen.getByRole('combobox', { name: 'Lọc theo trạng thái' })).toBeInTheDocument();

    // Visible spans and placeholder preserved.
    expect(screen.getByText('Từ:')).toBeInTheDocument();
    expect(screen.getByText('Đến:')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Tìm theo mã đơn hoặc tên khách...')
    ).toBeInTheDocument();
  });
});

describe('Wave4B-2 G-C — M13: AdminOrderPage list-fetch error announcement', () => {
  it('announces a refetch failure once as role="alert" while existing rows stay visible', async () => {
    mockGetAllOrders
      .mockResolvedValueOnce(ordersListResponse([buildOrder()]))
      .mockRejectedValueOnce(new Error('Lỗi khi tải đơn hàng'));

    render(<AdminOrderPage />);

    expect(await screen.findByRole('button', { name: 'Xem chi tiết đơn hàng ORD-GC-001' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo trạng thái' }));
    fireEvent.click(screen.getByRole('option', { name: 'Chờ xác nhận' }));

    const alerts = await screen.findAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent('Lỗi khi tải đơn hàng');

    // Previous rows remain — OrderTable error path is not duplicated.
    expect(screen.getByRole('button', { name: 'Xem chi tiết đơn hàng ORD-GC-001' })).toBeInTheDocument();
  });
});

describe('Wave4B-2 G-C — S09, M14, M15, S13: AdminOrderDetailDialog', () => {
  it('S09: names the status combobox "Cập nhật trạng thái"', () => {
    renderDialog('pending');

    expect(screen.getByRole('combobox', { name: 'Cập nhật trạng thái' })).toBeInTheDocument();
  });

  it('M14: announces status-update failure as role="alert" and connects it to the combobox', async () => {
    mockOnUpdateStatus.mockRejectedValue({
      response: { data: { message: 'Không thể chuyển trạng thái' } },
    });
    renderDialog('pending');

    fireEvent.click(screen.getByRole('combobox', { name: 'Cập nhật trạng thái' }));
    fireEvent.click(screen.getByRole('option', { name: 'Đã xác nhận' }));
    fireEvent.click(screen.getByRole('button', { name: /cập nhật/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('id', 'order-status-error');
    expect(alert).toHaveTextContent('Không thể chuyển trạng thái');
    expect(
      screen.getByRole('combobox', { name: 'Cập nhật trạng thái' })
    ).toHaveAttribute('aria-describedby', 'order-status-error');
  });

  it('M15: the cancel-reason textarea has a visible required label and error association', async () => {
    mockOnUpdateStatus.mockRejectedValue({
      response: { data: { message: 'Lý do hủy đơn là bắt buộc' } },
    });
    renderDialog('pending');

    fireEvent.click(screen.getByRole('combobox', { name: 'Cập nhật trạng thái' }));
    fireEvent.click(screen.getByRole('option', { name: 'Đã hủy' }));

    const textarea = screen.getByLabelText(/Lý do hủy đơn/);
    expect(textarea).toHaveAttribute('id', 'order-cancel-reason');
    expect(textarea).toHaveAttribute('aria-required', 'true');
    expect(textarea).not.toHaveAttribute('aria-describedby');

    fireEvent.change(textarea, { target: { value: 'Khách yêu cầu' } });
    fireEvent.click(screen.getByRole('button', { name: /cập nhật/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Lý do hủy đơn là bắt buộc');
    expect(screen.getByLabelText(/Lý do hủy đơn/)).toHaveAttribute(
      'aria-describedby',
      'order-status-error'
    );
  });

  it('S13: shows success feedback only after a confirmed update, not while pending', async () => {
    let resolveUpdate: () => void = () => {};
    mockOnUpdateStatus.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveUpdate = resolve;
        })
    );
    renderDialog('pending');

    fireEvent.click(screen.getByRole('combobox', { name: 'Cập nhật trạng thái' }));
    fireEvent.click(screen.getByRole('option', { name: 'Đã xác nhận' }));
    fireEvent.click(screen.getByRole('button', { name: /cập nhật/i }));

    // Pending — no success announcement yet.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    resolveUpdate();
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Cập nhật trạng thái đơn hàng thành công');
  });

  it('S13: a failed update never reports success', async () => {
    mockOnUpdateStatus.mockRejectedValue({ response: { data: { message: 'Lỗi' } } });
    renderDialog('pending');

    fireEvent.click(screen.getByRole('combobox', { name: 'Cập nhật trạng thái' }));
    fireEvent.click(screen.getByRole('option', { name: 'Đã xác nhận' }));
    fireEvent.click(screen.getByRole('button', { name: /cập nhật/i }));

    await screen.findByRole('alert');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('Wave4B-2 G-C — S11: OrderTable loading announcement', () => {
  it('announces the loading state once via role="status" with aria-busy', () => {
    render(
      <OrderTable
        orders={[]}
        pagination={{ currentPage: 1, totalPages: 1, totalCount: 0, limit: 10, hasNextPage: false, hasPrevPage: false, nextPage: null, prevPage: null }}
        onPageChange={vi.fn()}
        onOrderClick={vi.fn()}
        isLoading={true}
      />
    );

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Đang tải...');
    expect(status).toHaveAttribute('aria-busy', 'true');
  });

  it('keeps the empty-state error retry row announced (existing W3-11 behavior)', () => {
    render(
      <OrderTable
        orders={[]}
        pagination={{ currentPage: 1, totalPages: 1, totalCount: 0, limit: 10, hasNextPage: false, hasPrevPage: false, nextPage: null, prevPage: null }}
        onPageChange={vi.fn()}
        onOrderClick={vi.fn()}
        isError={true}
        error="Không thể tải danh sách đơn hàng"
        onRetry={vi.fn()}
      />
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Không thể tải danh sách đơn hàng');
    expect(within(alert).getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });
});

describe('Wave4B-2 G-C — regression guards', () => {
  it('AdminOrderDetailDialog status options and update-button behavior stay intact', () => {
    renderDialog('pending');

    fireEvent.click(screen.getByRole('combobox', { name: 'Cập nhật trạng thái' }));
    expect(screen.getByRole('option', { name: 'Đã xác nhận' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Đã hủy' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Đang xử lý' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: 'Đã xác nhận' }));
    expect(screen.getByRole('button', { name: /cập nhật/i })).not.toBeDisabled();
  });

  it('AdminQAPage keeps its G-A answer dialog labels intact', async () => {
    render(<AdminQAPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Trả lời/ }));

    const textarea = screen.getByLabelText('Câu trả lời:');
    expect(textarea).toHaveAttribute('id', 'qa-answer');
    expect(textarea).toHaveAttribute('aria-required', 'true');
  });

  it('OrderFilters status options and clear button stay functional', () => {
    const onFilterChange = vi.fn();
    render(
      <OrderFilters filters={{}} onFilterChange={onFilterChange} onClearFilters={vi.fn()} />
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo trạng thái' }));
    fireEvent.click(screen.getByRole('option', { name: 'Đã giao' }));
    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'delivered' }));
  });
});
