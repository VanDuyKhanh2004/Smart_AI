import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { StoreForm } from '@/features/admin/components/StoreForm';
import { PromotionForm } from '@/features/admin/components/PromotionForm';
import { ProductForm } from '@/features/admin/components/ProductForm';
import { AdminQAPage } from '@/features/admin/pages/AdminQAPage';
import { AdminAppointmentsPage } from '@/features/admin/pages/AdminAppointmentsPage';
import type { Question } from '@/types/qa.type';

vi.mock('leaflet', () => ({ default: { icon: () => ({}) } }));
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => null,
  Marker: () => null,
  useMapEvents: () => ({}),
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

const mockGetAllStoresAdmin = vi.fn();
const mockGetAllAppointments = vi.fn();
const mockUpdateAppointmentStatus = vi.fn();

vi.mock('@/features/stores/services/storeService', () => ({
  storeService: {
    getAllStoresAdmin: (...args: unknown[]) => mockGetAllStoresAdmin(...args),
  },
}));

vi.mock('@/features/stores/services/appointmentService', () => ({
  appointmentService: {
    getAllAppointments: (...args: unknown[]) => mockGetAllAppointments(...args),
    updateAppointmentStatus: (...args: unknown[]) => mockUpdateAppointmentStatus(...args),
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

function mockListResponse(questions: Question[]) {
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

const WEEKDAYS = [
  'Thứ hai',
  'Thứ ba',
  'Thứ tư',
  'Thứ năm',
  'Thứ sáu',
  'Thứ bảy',
  'Chủ nhật',
];

describe('Wave4B-2 G-A — StoreForm business hours (M01, S04)', () => {
  it('gives all 14 time inputs unique weekday-specific accessible names (M01)', () => {
    render(<StoreForm onSubmit={vi.fn()} onCancel={vi.fn()} />);

    // Sunday is closed by default (12 inputs visible); open it to expose all 14.
    fireEvent.click(screen.getByLabelText('Đóng cửa Chủ nhật'));

    const timeInputs = document.querySelectorAll<HTMLInputElement>('input[type="time"]');
    expect(timeInputs).toHaveLength(14);

    const names = Array.from(timeInputs).map((el) => el.getAttribute('aria-label'));
    expect(names.every((n) => !!n)).toBe(true);
    expect(new Set(names).size).toBe(14);

    expect(screen.getByLabelText('Giờ mở cửa Thứ hai')).toBeInTheDocument();
    expect(screen.getByLabelText('Giờ đóng cửa Thứ hai')).toBeInTheDocument();

    for (const day of WEEKDAYS) {
      expect(screen.getByLabelText(`Giờ mở cửa ${day}`)).toBeInTheDocument();
      expect(screen.getByLabelText(`Giờ đóng cửa ${day}`)).toBeInTheDocument();
    }
  });

  it('names each closed checkbox with its weekday (S04)', () => {
    render(<StoreForm onSubmit={vi.fn()} onCancel={vi.fn()} />);

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(7);
    for (const day of WEEKDAYS) {
      expect(screen.getByLabelText(`Đóng cửa ${day}`)).toBeInTheDocument();
    }

    // Default data keeps Sunday closed — value/behavior unchanged.
    expect(screen.getByLabelText('Đóng cửa Chủ nhật')).toBeChecked();
    expect(screen.getByLabelText('Đóng cửa Thứ hai')).not.toBeChecked();
  });

  it('exposes required semantics only on fields validated as required (S05)', () => {
    render(<StoreForm onSubmit={vi.fn()} onCancel={vi.fn()} />);

    for (const label of [
      /Tên cửa hàng/,
      /Số điện thoại/,
      /Số nhà, đường/,
      /Quận\/Huyện/,
      /Thành phố/,
      /Địa chỉ đầy đủ/,
    ]) {
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-required', 'true');
    }

    // Optional fields stay optional.
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-required');
    expect(screen.getByLabelText('Mô tả')).not.toHaveAttribute('aria-required');
    expect(screen.getByLabelText('Phường/Xã')).not.toHaveAttribute('aria-required');
  });

  it('connects failed-validation errors through aria-describedby (S06)', () => {
    render(<StoreForm onSubmit={vi.fn()} onCancel={vi.fn()} />);

    const name = screen.getByLabelText(/Tên cửa hàng/);
    expect(name).not.toHaveAttribute('aria-describedby');

    fireEvent.click(screen.getByRole('button', { name: 'Thêm cửa hàng' }));

    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name.getAttribute('aria-describedby')).toBe('store-name-error');
    const nameError = document.getElementById('store-name-error');
    expect(nameError).toHaveAttribute('role', 'alert');
    expect(nameError).toHaveTextContent('Tên cửa hàng là bắt buộc');

    const phone = screen.getByLabelText(/Số điện thoại/);
    expect(phone).toHaveAttribute('aria-invalid', 'true');
    expect(document.getElementById('store-phone-error')).toHaveTextContent(
      'Số điện thoại là bắt buộc'
    );

    for (const id of [
      'store-street-error',
      'store-district-error',
      'store-city-error',
      'store-full-address-error',
    ]) {
      expect(document.getElementById(id)).toHaveAttribute('role', 'alert');
    }

    // No submit reached — validation/business rules unchanged.
    expect(screen.queryByText('Đang xử lý...')).not.toBeInTheDocument();
  });
});

describe('Wave4B-2 G-A — AdminQAPage answer dialog (M02, S06)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllQuestions.mockResolvedValue(mockListResponse([makeQuestion()]));
    mockGetAllProducts.mockResolvedValue({
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
    });
  });

  it('associates the visible label, id, required and counter help (M02)', async () => {
    render(<AdminQAPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Trả lời/ }));

    const textarea = screen.getByLabelText('Câu trả lời:');
    expect(textarea).toHaveAttribute('id', 'qa-answer');
    expect(textarea).toHaveAttribute('aria-required', 'true');
    expect(textarea).toHaveAttribute('aria-invalid', 'false');
    expect(textarea.getAttribute('aria-describedby')).toContain('qa-answer-help');
    expect(document.getElementById('qa-answer-help')).toHaveTextContent('Tối thiểu 5 ký tự');
  });

  it('reflects length validation and connects submit errors (M02, S06)', async () => {
    mockCreateAnswer.mockRejectedValue(new Error('Không thể gửi câu trả lời'));

    render(<AdminQAPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Trả lời/ }));

    const textarea = screen.getByLabelText('Câu trả lời:') as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: 'abc' } });
    expect(textarea).toHaveAttribute('aria-invalid', 'true');

    fireEvent.change(textarea, { target: { value: 'Đây là câu trả lời hợp lệ' } });
    expect(textarea).toHaveAttribute('aria-invalid', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Gửi câu trả lời' }));

    await waitFor(() => expect(mockCreateAnswer).toHaveBeenCalled());
    await waitFor(() => expect(document.getElementById('qa-answer-error')).not.toBeNull());

    expect(textarea.getAttribute('aria-describedby')).toContain('qa-answer-help');
    expect(textarea.getAttribute('aria-describedby')).toContain('qa-answer-error');
    const error = document.getElementById('qa-answer-error');
    expect(error).toHaveAttribute('role', 'alert');
    expect(error).toHaveTextContent('Không thể gửi câu trả lời');
  });
});

describe('Wave4B-2 G-A — PromotionForm (M03, S05, S06)', () => {
  it('associates the discount type label with the select trigger (M03)', () => {
    render(<PromotionForm onSubmit={vi.fn()} onCancel={vi.fn()} />);

    expect(document.querySelector('label[for="discountType"]')).not.toBeNull();
    const trigger = screen.getByLabelText(/Loại giảm giá/);
    expect(trigger).toHaveAttribute('id', 'discountType');
    expect(trigger).toHaveAttribute('role', 'combobox');
    expect(trigger).toHaveAttribute('aria-required', 'true');
  });

  it('marks required fields and preserves optional ones (S05)', () => {
    render(<PromotionForm onSubmit={vi.fn()} onCancel={vi.fn()} />);

    for (const label of [
      /Mã khuyến mãi/,
      /Giá trị giảm/,
      /Giới hạn sử dụng/,
      /Ngày bắt đầu/,
      /Ngày kết thúc/,
    ]) {
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-required', 'true');
    }

    expect(screen.getByLabelText(/Mô tả/)).not.toHaveAttribute('aria-required');
    expect(screen.getByLabelText(/Đơn hàng tối thiểu/)).not.toHaveAttribute('aria-required');
    expect(screen.getByLabelText(/Giảm tối đa/)).not.toHaveAttribute('aria-required');
  });

  it('connects validation errors and always links helper text (S06)', () => {
    render(<PromotionForm onSubmit={vi.fn()} onCancel={vi.fn()} />);

    const code = screen.getByLabelText(/Mã khuyến mãi/);
    expect(code.getAttribute('aria-describedby')).toBe('promotion-code-help');

    fireEvent.click(screen.getByRole('button', { name: 'Tạo mã' }));

    expect(code).toHaveAttribute('aria-invalid', 'true');
    expect(code.getAttribute('aria-describedby')).toContain('promotion-code-error');
    expect(code.getAttribute('aria-describedby')).toContain('promotion-code-help');
    const codeError = document.getElementById('promotion-code-error');
    expect(codeError).toHaveAttribute('role', 'alert');
    expect(codeError).toHaveTextContent('Mã khuyến mãi là bắt buộc');

    for (const [fieldId, errorId] of [
      ['Giá trị giảm', 'promotion-discount-value-error'],
      ['Giới hạn sử dụng', 'promotion-usage-limit-error'],
      ['Ngày bắt đầu', 'promotion-start-date-error'],
      ['Ngày kết thúc', 'promotion-end-date-error'],
    ] as const) {
      const field = screen.getByLabelText(new RegExp(fieldId));
      expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(field.getAttribute('aria-describedby')).toContain(errorId);
      expect(document.getElementById(errorId)).toHaveAttribute('role', 'alert');
    }

    expect(screen.getByLabelText(/Giảm tối đa/).getAttribute('aria-describedby')).toBe(
      'promotion-max-discount-help'
    );
  });
});

describe('Wave4B-2 G-A — AdminAppointmentsPage date filters (M04)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllStoresAdmin.mockResolvedValue({ success: true, data: [] });
    mockGetAllAppointments.mockResolvedValue({ success: true, data: [] });
  });

  it('exposes Từ ngày and Đến ngày accessible names on the date controls', async () => {
    render(<AdminAppointmentsPage />);

    const from = await screen.findByLabelText('Từ ngày');
    const to = await screen.findByLabelText('Đến ngày');
    expect(from).toHaveAttribute('type', 'date');
    expect(to).toHaveAttribute('type', 'date');
  });
});

describe('Wave4B-2 G-A — ProductForm required and error association (S05, S06)', () => {
  it('marks validated fields required and leaves optional ones alone (S05)', () => {
    render(<ProductForm onSubmit={vi.fn()} onCancel={vi.fn()} />);

    for (const label of [/Tên sản phẩm/, /Thương hiệu/, /Giá \(VNĐ\)/, /Mô tả/]) {
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-required', 'true');
    }

    expect(screen.getByLabelText(/Số lượng tồn kho/)).not.toHaveAttribute('aria-required');
    expect(screen.getByLabelText(/Màu sắc/)).not.toHaveAttribute('aria-required');
    expect(screen.getByLabelText(/Tags/)).not.toHaveAttribute('aria-required');
  });

  it('connects failed-validation errors through aria-describedby (S06)', () => {
    render(<ProductForm onSubmit={vi.fn()} onCancel={vi.fn()} />);

    const name = screen.getByLabelText(/Tên sản phẩm/);
    expect(name).not.toHaveAttribute('aria-describedby');

    fireEvent.click(screen.getByRole('button', { name: 'Thêm sản phẩm' }));

    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name.getAttribute('aria-describedby')).toBe('product-name-error');
    const nameError = document.getElementById('product-name-error');
    expect(nameError).toHaveAttribute('role', 'alert');
    expect(nameError).toHaveTextContent('Tên sản phẩm là bắt buộc');

    const description = screen.getByLabelText(/Mô tả/);
    expect(description).toHaveAttribute('aria-invalid', 'true');
    expect(document.getElementById('product-description-error')).toHaveTextContent(
      'Mô tả là bắt buộc'
    );

    const price = screen.getByLabelText(/Giá \(VNĐ\)/);
    expect(price.getAttribute('aria-describedby')).toBe('product-price-error');
    expect(document.getElementById('product-price-error')).toHaveTextContent(
      'Giá phải lớn hơn 0'
    );
  });
});
