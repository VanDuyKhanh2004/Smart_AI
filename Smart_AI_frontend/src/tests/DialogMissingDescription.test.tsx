import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { AdminOrderDetailDialog } from '@/features/orders/components/AdminOrderDetailDialog';
import { OrderDetailDialog } from '@/features/orders/components/OrderDetailDialog';
import { ComplaintDetailDialog } from '@/features/complaints/components/ComplaintDetailDialog';
import { StoreDetailModal } from '@/features/stores/components/StoreDetailModal';
import { AppointmentForm } from '@/features/stores/components/AppointmentForm';
import { AdminProductPage } from '@/features/admin/pages/AdminProductPage';
import { AdminQAPage } from '@/features/admin/pages/AdminQAPage';
import type { Order } from '@/types/order.type';
import type { Complaint } from '@/types/complaint.type';
import type { Product } from '@/types/product.type';
import type { Question } from '@/types/qa.type';
import type { Store, BusinessHours, StoreWithDistance } from '@/features/stores/types';

const mockCreateProduct = vi.fn();
const mockUpdateProduct = vi.fn();
const mockGetAllProducts = vi.fn();
const mockDeleteProduct = vi.fn();

vi.mock('@/services/product.service', () => ({
  productService: {
    createProduct: (...args: unknown[]) => mockCreateProduct(...args),
    updateProduct: (...args: unknown[]) => mockUpdateProduct(...args),
    getAllProducts: (...args: unknown[]) => mockGetAllProducts(...args),
    deleteProduct: (...args: unknown[]) => mockDeleteProduct(...args),
  },
}));

const mockGetAllQuestions = vi.fn();
const mockUpdateQuestionStatus = vi.fn();
const mockDeleteQuestion = vi.fn();
const mockCreateAnswer = vi.fn();
const mockDeleteAnswer = vi.fn();

vi.mock('@/services/qa.service', () => ({
  qaService: {
    getAllQuestions: (...args: unknown[]) => mockGetAllQuestions(...args),
    updateQuestionStatus: (...args: unknown[]) => mockUpdateQuestionStatus(...args),
    deleteQuestion: (...args: unknown[]) => mockDeleteQuestion(...args),
    createAnswer: (...args: unknown[]) => mockCreateAnswer(...args),
    deleteAnswer: (...args: unknown[]) => mockDeleteAnswer(...args),
  },
}));

const mockGetAvailableSlots = vi.fn();
const mockCreateAppointment = vi.fn();

vi.mock('@/features/stores/services/appointmentService', () => ({
  appointmentService: {
    getAvailableSlots: (...args: unknown[]) => mockGetAvailableSlots(...args),
    createAppointment: (...args: unknown[]) => mockCreateAppointment(...args),
  },
}));

function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    orderNumber: 'ORD-TEST-001',
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

const complaint = {
  _id: 'c1',
  id: 'c1',
  subject: 'Sản phẩm lỗi',
  status: 'open',
  priority: 'medium',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
} as unknown as Complaint;

function buildBusinessHours(): BusinessHours {
  const defaults = { open: '08:00', close: '21:00', isClosed: false };
  const days: (keyof BusinessHours)[] = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ];
  const businessHours = {} as BusinessHours;
  for (const day of days) {
    businessHours[day] = { ...defaults };
  }
  return businessHours;
}

function buildStore(): StoreWithDistance {
  return {
    id: 'store-1',
    name: 'Smart AI Store',
    address: {
      street: '123 Test St',
      ward: 'Ward 1',
      district: 'District 1',
      city: 'Ho Chi Minh City',
      fullAddress: '123 Test St, Ward 1, District 1, Ho Chi Minh City',
    },
    location: { type: 'Point', coordinates: [106.6297, 10.8231] },
    phone: '0123456789',
    email: 'store@example.com',
    businessHours: buildBusinessHours(),
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeAppointmentStore(): Store {
  return {
    ...(buildStore() as unknown as Store),
    id: 's1',
    name: 'Cửa hàng Test',
  };
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    _id: 'p1',
    name: 'iPhone 14',
    brand: 'apple',
    price: 16000000,
    description: 'Mô tả sản phẩm',
    inStock: 10,
    colors: ['Đen'],
    tags: ['flagship'],
    image: 'https://example.com/old.jpg',
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function productListResponse() {
  return {
    success: true,
    message: 'ok',
    data: {
      products: [makeProduct()],
      pagination: {
        currentPage: 1,
        totalPages: 1,
        totalCount: 1,
        limit: 10,
        hasNextPage: false,
        hasPrevPage: false,
        nextPage: null,
        prevPage: null,
      },
    },
  };
}

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    _id: 'q1',
    product: 'p1',
    user: { _id: 'u1', name: 'Nguyễn Văn A' },
    questionText: 'Sản phẩm này có màu xanh không?',
    status: 'pending',
    upvoteCount: 3,
    hasUpvoted: false,
    answers: [],
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

let warnSpy: ReturnType<typeof vi.spyOn>;

function expectNoMissingDescriptionWarning() {
  const missing = warnSpy.mock.calls.filter((args: unknown[]) =>
    String(args[0]).includes('Missing `Description`')
  );
  expect(missing).toEqual([]);
}

describe('Radix dialogs expose a Description (D2-1)', () => {
  beforeAll(() => {
    if (typeof Element.prototype.scrollIntoView !== 'function') {
      Element.prototype.scrollIntoView = () => {};
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetAllProducts.mockResolvedValue(productListResponse());
    mockGetAllQuestions.mockResolvedValue(questionListResponse([makeQuestion()]));
    mockCreateAppointment.mockResolvedValue({ success: true, message: 'ok', data: {} });
    mockGetAvailableSlots.mockResolvedValue({
      success: true,
      data: { date: '2099-12-25', purpose: 'consultation', store: { id: 's1', name: 'Test' }, slots: [] },
    });
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('AdminOrderDetailDialog renders a visible description without warnings', () => {
    render(
      <AdminOrderDetailDialog
        order={buildOrder()}
        isOpen={true}
        onClose={vi.fn()}
        onUpdateStatus={vi.fn()}
        onRefreshOrder={vi.fn()}
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByText('Xem chi tiết và cập nhật trạng thái đơn hàng.')
    ).toBeInTheDocument();
    expectNoMissingDescriptionWarning();
  });

  it('OrderDetailDialog renders a visible description without warnings', () => {
    render(<OrderDetailDialog order={buildOrder()} isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByText('Xem sản phẩm, địa chỉ giao hàng và trạng thái đơn hàng.')
    ).toBeInTheDocument();
    expectNoMissingDescriptionWarning();
  });

  it('ComplaintDetailDialog renders a visible description without warnings', () => {
    render(
      <ComplaintDetailDialog
        complaint={complaint}
        isOpen={true}
        onClose={vi.fn()}
        onUpdateStatus={vi.fn()}
        onUpdateNotes={vi.fn()}
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByText('Xem chi tiết khiếu nại và trạng thái xử lý.')
    ).toBeInTheDocument();
    expectNoMissingDescriptionWarning();
  });

  it('StoreDetailModal renders a visible description without warnings', () => {
    render(
      <StoreDetailModal
        store={buildStore()}
        isOpen={true}
        onClose={vi.fn()}
        onBookAppointment={vi.fn()}
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByText('Xem thông tin cửa hàng, giờ mở cửa và chỉ đường.')
    ).toBeInTheDocument();
    expectNoMissingDescriptionWarning();
  });

  it('AppointmentForm renders a visible description without warnings', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <AppointmentForm
          store={makeAppointmentStore()}
          isOpen={true}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      </QueryClientProvider>
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByText('Chọn ngày và khung giờ bạn muốn đến cửa hàng.')
    ).toBeInTheDocument();
    expectNoMissingDescriptionWarning();
  });

  it('AdminProductPage create/edit dialog renders a description without warnings', async () => {
    render(<AdminProductPage />);

    await waitFor(() => expect(mockGetAllProducts).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('button', { name: /Thêm sản phẩm/ }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByText('Điền thông tin sản phẩm vào biểu mẫu bên dưới.')
    ).toBeInTheDocument();
    expectNoMissingDescriptionWarning();
  });

  it('AdminQAPage answer dialog renders a description without warnings', async () => {
    render(<AdminQAPage />);

    fireEvent.click(await screen.findByRole('button', { name: /Trả lời/ }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByText('Viết câu trả lời của bạn cho câu hỏi này.')
    ).toBeInTheDocument();
    expectNoMissingDescriptionWarning();
  });
});
