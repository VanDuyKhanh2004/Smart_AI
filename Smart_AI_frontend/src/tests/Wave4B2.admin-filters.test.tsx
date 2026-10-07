import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { AdminQAPage } from '@/features/admin/pages/AdminQAPage';
import { AdminReviewsPage } from '@/features/admin/pages/AdminReviewsPage';
import { AdminPromotionPage } from '@/features/admin/pages/AdminPromotionPage';
import { AdminAppointmentsPage } from '@/features/admin/pages/AdminAppointmentsPage';
import { AdminDashboardPage } from '@/features/admin/pages/AdminDashboardPage';
import { AdminStoresPage } from '@/features/admin/pages/AdminStoresPage';
import { PromotionCard } from '@/features/admin/components/PromotionCard';
import { OrderFilters } from '@/features/orders/components/OrderFilters';
import type { Question } from '@/types/qa.type';
import type { Review } from '@/types/review.type';
import type { Promotion } from '@/types/promotion.type';
import type { Store, Appointment } from '@/features/stores/types';

vi.mock('@/features/admin/components/StoreForm', () => ({
  StoreForm: () => <div data-testid="mock-store-form" />,
}));

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

const mockGetAllReviews = vi.fn();
const mockUpdateReviewStatus = vi.fn();

vi.mock('@/services/review.service', () => ({
  reviewService: {
    getAllReviews: (...args: unknown[]) => mockGetAllReviews(...args),
    updateReviewStatus: (...args: unknown[]) => mockUpdateReviewStatus(...args),
  },
}));

const mockGetPromotions = vi.fn();
const mockCreatePromotion = vi.fn();
const mockUpdatePromotion = vi.fn();
const mockDeletePromotion = vi.fn();
const mockToggleStatus = vi.fn();

vi.mock('@/services/promotion.service', () => ({
  promotionService: {
    getPromotions: (...args: unknown[]) => mockGetPromotions(...args),
    createPromotion: (...args: unknown[]) => mockCreatePromotion(...args),
    updatePromotion: (...args: unknown[]) => mockUpdatePromotion(...args),
    deletePromotion: (...args: unknown[]) => mockDeletePromotion(...args),
    toggleStatus: (...args: unknown[]) => mockToggleStatus(...args),
  },
}));

const mockGetAllStoresAdmin = vi.fn();
const mockCreateStore = vi.fn();
const mockUpdateStore = vi.fn();
const mockDeleteStore = vi.fn();
const mockToggleStoreStatus = vi.fn();

vi.mock('@/features/stores/services/storeService', () => ({
  storeService: {
    getAllStoresAdmin: (...args: unknown[]) => mockGetAllStoresAdmin(...args),
    createStore: (...args: unknown[]) => mockCreateStore(...args),
    updateStore: (...args: unknown[]) => mockUpdateStore(...args),
    deleteStore: (...args: unknown[]) => mockDeleteStore(...args),
    toggleStoreStatus: (...args: unknown[]) => mockToggleStoreStatus(...args),
  },
}));

const mockGetAllAppointments = vi.fn();
const mockUpdateAppointmentStatus = vi.fn();

vi.mock('@/features/stores/services/appointmentService', () => ({
  appointmentService: {
    getAllAppointments: (...args: unknown[]) => mockGetAllAppointments(...args),
    updateAppointmentStatus: (...args: unknown[]) => mockUpdateAppointmentStatus(...args),
  },
}));

const mockGetDashboardSummary = vi.fn();
const mockGetRevenueStats = vi.fn();
const mockGetTopSellingProducts = vi.fn();
const mockGetOrderTrends = vi.fn();
const mockGetUserStats = vi.fn();

vi.mock('@/services/dashboard.service', () => ({
  dashboardService: {
    getDashboardSummary: (...args: unknown[]) => mockGetDashboardSummary(...args),
    getRevenueStats: (...args: unknown[]) => mockGetRevenueStats(...args),
    getTopSellingProducts: (...args: unknown[]) => mockGetTopSellingProducts(...args),
    getOrderTrends: (...args: unknown[]) => mockGetOrderTrends(...args),
    getUserStats: (...args: unknown[]) => mockGetUserStats(...args),
  },
}));

beforeAll(() => {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

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

function questionListResponse(questions: Question[] = [makeQuestion()]) {
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

function makeReview(overrides: Partial<Review> = {}): Review {
  return {
    _id: 'r1',
    user: { _id: 'u1', name: 'Nguyễn Văn A' },
    product: 'p1',
    rating: 5,
    comment: 'Sản phẩm tốt',
    status: 'pending',
    isVerifiedPurchase: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function reviewListResponse(reviews: Review[] = [makeReview()]) {
  return {
    success: true,
    message: 'ok',
    data: {
      reviews,
      pagination: {
        currentPage: 1,
        totalPages: 1,
        totalCount: reviews.length,
        limit: 10,
        hasNextPage: false,
        hasPrevPage: false,
        nextPage: null,
        prevPage: null,
      },
    },
  };
}

function makePromotion(code: string, overrides: Partial<Promotion> = {}): Promotion {
  return {
    _id: `pr-${code}`,
    code,
    discountType: 'percentage',
    discountValue: 10,
    minOrderValue: 0,
    usageLimit: 100,
    usedCount: 0,
    startDate: '2024-01-01T00:00:00.000Z',
    endDate: '2030-01-01T00:00:00.000Z',
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function promotionListResponse(promotions: Promotion[]) {
  return {
    success: true,
    data: promotions,
    pagination: { total: promotions.length, page: 1, limit: 12, totalPages: 1 },
  };
}

function makeStore(overrides: Partial<Store> = {}): Store {
  const businessHour = { open: '08:00', close: '22:00', isClosed: false };
  return {
    id: 's1',
    name: 'Cửa hàng Điện Máy Xanh Quận 1',
    address: {
      street: '123 Lê Lợi',
      district: 'Quận 1',
      city: 'Hồ Chí Minh',
      fullAddress: '123 Lê Lợi, Quận 1, Hồ Chí Minh',
    },
    location: { type: 'Point', coordinates: [106.6959, 10.7761] },
    phone: '0123456789',
    email: 'store1@example.com',
    businessHours: {
      monday: businessHour,
      tuesday: businessHour,
      wednesday: businessHour,
      thursday: businessHour,
      friday: businessHour,
      saturday: businessHour,
      sunday: businessHour,
    },
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'a1',
    store: 's1',
    date: '2024-06-01T00:00:00.000Z',
    timeSlot: { start: '09:00', end: '09:30' },
    purpose: 'consultation',
    status: 'pending',
    guestInfo: { name: 'Nguyễn Văn B', phone: '0901000001', email: 'b@example.com' },
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function resetDefaultMocks() {
  vi.clearAllMocks();
  mockGetAllQuestions.mockResolvedValue(questionListResponse());
  mockGetAllProducts.mockResolvedValue(productListResponse());
  mockGetAllReviews.mockResolvedValue(reviewListResponse());
  mockGetPromotions.mockResolvedValue(promotionListResponse([makePromotion('GIAM10')]));
  mockGetAllStoresAdmin.mockResolvedValue({ success: true, data: [makeStore()] });
  mockGetAllAppointments.mockResolvedValue({ success: true, data: [] });
}

describe('Wave4B-2 G-B — admin filter Select accessible names (M05–M09, S09)', () => {
  beforeEach(() => {
    resetDefaultMocks();
  });

  it('M05: AdminQAPage status and product filters expose labeled comboboxes', async () => {
    render(<AdminQAPage />);

    expect(
      await screen.findByRole('combobox', { name: 'Lọc theo trạng thái' })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('combobox', { name: 'Lọc theo sản phẩm' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
  });

  it('M06: AdminReviewsPage status filter exposes a labeled combobox', async () => {
    render(<AdminReviewsPage />);

    expect(
      await screen.findByRole('combobox', { name: 'Lọc theo trạng thái' })
    ).toBeInTheDocument();
  });

  it('M07: AdminPromotionPage status filter exposes a labeled combobox', async () => {
    render(<AdminPromotionPage />);

    expect(
      await screen.findByRole('combobox', { name: 'Lọc theo trạng thái' })
    ).toBeInTheDocument();
  });

  it('M08: AdminAppointmentsPage store and status filters expose labeled comboboxes (G-A date labels retained)', async () => {
    render(<AdminAppointmentsPage />);

    expect(
      await screen.findByRole('combobox', { name: 'Lọc theo cửa hàng' })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('combobox', { name: 'Lọc theo trạng thái' })
    ).toBeInTheDocument();

    // G-A date labels (M04) must stay untouched.
    expect(screen.getByLabelText('Từ ngày')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('Đến ngày')).toHaveAttribute('type', 'date');
  });

  it('M09: AdminDashboardPage period filter exposes a labeled combobox', async () => {
    mockGetDashboardSummary.mockResolvedValue({
      success: true,
      data: {
        totalRevenue: 0,
        revenueChange: 0,
        totalOrders: 0,
        ordersChange: 0,
        totalUsers: 0,
        usersChange: 0,
        pendingOrders: 0,
      },
    });
    mockGetRevenueStats.mockResolvedValue({ success: true, data: [] });
    mockGetTopSellingProducts.mockResolvedValue({ success: true, data: [] });
    mockGetOrderTrends.mockResolvedValue({ success: true, data: [] });
    mockGetUserStats.mockResolvedValue({ success: true, data: null });

    render(
      <MemoryRouter>
        <AdminDashboardPage />
      </MemoryRouter>
    );

    expect(
      await screen.findByRole('combobox', { name: 'Khoảng thời gian hiển thị' })
    ).toBeInTheDocument();
  });

  it('S09: OrderFilters status filter exposes a labeled combobox only (no G-C scope)', () => {
    render(
      <OrderFilters
        filters={{}}
        onFilterChange={vi.fn()}
        onClearFilters={vi.fn()}
      />
    );

    expect(screen.getByRole('combobox', { name: 'Lọc theo trạng thái' })).toBeInTheDocument();
    // G-C targets (search/date inputs) are out of scope — assert only the S09 control here.
    expect(screen.getByPlaceholderText('Tìm theo mã đơn hoặc tên khách...')).toBeInTheDocument();
  });
});

describe('Wave4B-2 G-B — admin row-action accessible names (S01–S03)', () => {
  beforeEach(() => {
    resetDefaultMocks();
  });

  it('S01: AdminStoresPage row actions are named with store context and keep their titles', async () => {
    const storeName = 'Cửa hàng Điện Máy Xanh Quận 1';
    render(<AdminStoresPage />);

    await screen.findByText(storeName);

    expect(
      screen.getByRole('button', { name: `Ẩn cửa hàng ${storeName}` })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: `Chỉnh sửa ${storeName}` })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: `Xóa ${storeName}` })
    ).toBeInTheDocument();

    // Titles stay exactly as before (tooltip + legacy getByTitle tests).
    expect(screen.getByTitle('Ẩn cửa hàng')).toBeInTheDocument();
    expect(screen.getByTitle('Chỉnh sửa')).toBeInTheDocument();
    expect(screen.getByTitle('Xóa')).toBeInTheDocument();
  });

  it('S02: AdminAppointmentsPage row actions are named with customer context', async () => {
    mockGetAllAppointments.mockResolvedValue({
      success: true,
      data: [
        makeAppointment({ id: 'a1', status: 'pending' }),
        makeAppointment({
          id: 'a2',
          status: 'confirmed',
          guestInfo: { name: 'Trần Thị C', phone: '0902000002', email: 'c@example.com' },
        }),
      ],
    });

    render(<AdminAppointmentsPage />);

    expect(
      await screen.findByRole('button', { name: 'Xác nhận lịch hẹn của Nguyễn Văn B' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Hoàn thành lịch hẹn của Trần Thị C' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Hủy lịch hẹn của Nguyễn Văn B' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Hủy lịch hẹn của Trần Thị C' })
    ).toBeInTheDocument();

    // Titles stay exactly as before.
    expect(screen.getByTitle('Xác nhận')).toBeInTheDocument();
    expect(screen.getByTitle('Hoàn thành')).toBeInTheDocument();
    expect(screen.getAllByTitle('Hủy').length).toBeGreaterThan(0);
  });

  it('S03: PromotionCard action names contain the promotion code and are unique across cards', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onToggle = vi.fn();

    render(
      <>
        <PromotionCard
          promotion={makePromotion('GIAM10')}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggle={onToggle}
        />
        <PromotionCard
          promotion={makePromotion('GIAM20')}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggle={onToggle}
        />
      </>
    );

    const expected = [
      'Tạm dừng mã GIAM10',
      'Chỉnh sửa mã GIAM10',
      'Xóa mã GIAM10',
      'Tạm dừng mã GIAM20',
      'Chỉnh sửa mã GIAM20',
      'Xóa mã GIAM20',
    ];
    const names = expected.map((name) => screen.getByRole('button', { name }));
    expect(names).toHaveLength(6);
    expect(new Set(names).size).toBe(6);

    // Titles stay exactly as before.
    expect(screen.getAllByTitle('Chỉnh sửa')).toHaveLength(2);
    expect(screen.getAllByTitle('Xóa')).toHaveLength(2);
    expect(screen.getAllByTitle('Tạm dừng')).toHaveLength(2);
  });
});

describe('Wave4B-2 G-B — list fetch failures announce via role="alert" (S07)', () => {
  beforeEach(() => {
    resetDefaultMocks();
  });

  it('S07 MUST: AdminQAPage rejected list fetch renders the error node as an alert', async () => {
    mockGetAllQuestions.mockRejectedValue(new Error('Lỗi khi tải câu hỏi'));

    render(<AdminQAPage />);

    const alerts = await screen.findAllByRole('alert');
    expect(
      alerts.some((el) => el.textContent?.includes('Lỗi khi tải câu hỏi'))
    ).toBe(true);
  });

  it('S07 MUST: AdminReviewsPage rejected list fetch renders the error node as an alert', async () => {
    mockGetAllReviews.mockRejectedValue(new Error('Lỗi khi tải đánh giá'));

    render(<AdminReviewsPage />);

    const alerts = await screen.findAllByRole('alert');
    expect(
      alerts.some((el) => el.textContent?.includes('Lỗi khi tải đánh giá'))
    ).toBe(true);
  });
});

describe('Wave4B-2 G-B — regression guards', () => {
  beforeEach(() => {
    resetDefaultMocks();
  });

  it('AdminQAPage keeps its G-A answer dialog labels intact', async () => {
    render(<AdminQAPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Trả lời/ }));

    const textarea = screen.getByLabelText('Câu trả lời:');
    expect(textarea).toHaveAttribute('id', 'qa-answer');
    expect(textarea).toHaveAttribute('aria-required', 'true');
    expect(textarea.getAttribute('aria-describedby')).toContain('qa-answer-help');
  });
});
