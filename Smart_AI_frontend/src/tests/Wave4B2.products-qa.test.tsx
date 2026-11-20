import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useState } from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

import { QuestionForm } from '@/features/products/components/QuestionForm';
import { QuestionList } from '@/features/products/components/QuestionList';
import { QuestionItem } from '@/features/products/components/QuestionItem';
import { ReviewForm } from '@/features/products/components/ReviewForm';
import { ReviewList } from '@/features/products/components/ReviewList';
import ComparePage from '@/features/compare/pages/ComparePage';
import ProductDetailPage from '@/features/products/pages/ProductDetailPage';
import { StarRating } from '@/components/ui/StarRating';
import type { Question } from '@/types/qa.type';
import type { Product } from '@/types/product.type';
import type { Pagination } from '@/types/api.type';

const mocks = vi.hoisted(() => {
  const auth = {
    isAuthenticated: true,
    user: { _id: 'u1', name: 'Người dùng Test', email: 'test@example.com' } as unknown,
  };
  const cart = {
    items: [] as unknown[],
    isLoading: false,
    error: null as string | null,
    addItem: vi.fn(),
    getTotalItems: vi.fn(() => 0),
    getTotalPrice: vi.fn(() => 0),
    updateQuantity: vi.fn(),
    removeItem: vi.fn(),
    clearCart: vi.fn(),
    fetchCart: vi.fn(),
    loadFromLocalStorage: vi.fn(),
  };
  const useCartStore = Object.assign(
    (selector?: (state: typeof cart) => unknown) =>
      selector ? selector(cart) : cart,
    { getState: () => cart },
  );
  return {
    auth,
    cart,
    useCartStore,
    getProductById: vi.fn(),
    getAllProducts: vi.fn(),
    getProductMeta: vi.fn(),
    getProductReviews: vi.fn(),
    canReviewProduct: vi.fn(),
    getCompareProducts: vi.fn(),
    saveToHistory: vi.fn(),
    getHistory: vi.fn(),
    deleteFromHistory: vi.fn(),
  };
});

vi.mock('@/stores/authStore', () => ({
  useAuthStore: Object.assign(() => mocks.auth, { getState: () => mocks.auth }),
}));

vi.mock('@/stores/cartStore', () => ({ useCartStore: mocks.useCartStore }));

vi.mock('@/services/product.service', () => ({
  productService: {
    getProductById: mocks.getProductById,
    getAllProducts: mocks.getAllProducts,
    getProductMeta: mocks.getProductMeta,
  },
}));

vi.mock('@/services/review.service', () => ({
  reviewService: {
    getProductReviews: mocks.getProductReviews,
    canReviewProduct: mocks.canReviewProduct,
    createReview: vi.fn(),
  },
}));

vi.mock('@/services/compare.service', () => ({
  compareService: {
    getCompareProducts: mocks.getCompareProducts,
    saveToHistory: mocks.saveToHistory,
    getHistory: mocks.getHistory,
    deleteFromHistory: mocks.deleteFromHistory,
  },
}));

vi.mock('@/features/products/components/QASection', () => ({
  QASection: () => <div data-testid="qa-section" />,
}));

vi.mock('@/features/products/components/ProductRecommendations', () => ({
  __esModule: true,
  default: () => <div data-testid="recommendations" />,
}));

vi.mock('@/components/ui/WishlistButton', () => ({
  __esModule: true,
  default: () => <button type="button">Yêu thích</button>,
}));

vi.mock('@/components/ui/CompareButton', () => ({
  __esModule: true,
  default: () => <button type="button">So sánh</button>,
}));

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

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    _id: 'p1',
    name: 'iPhone 14',
    brand: 'apple',
    price: 16000000,
    description: 'Mô tả sản phẩm',
    inStock: 3,
    colors: ['Đen', 'Trắng'],
    tags: [],
    image: 'https://example.com/phone.jpg',
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const paginationPage2: Pagination = {
  currentPage: 2,
  totalPages: 3,
  totalCount: 25,
  limit: 10,
  hasNextPage: true,
  hasPrevPage: true,
  nextPage: 3,
  prevPage: 1,
};

function InteractiveRating({
  initial = 0,
  ...props
}: { initial?: number } & Omit<React.ComponentProps<typeof StarRating>, 'rating' | 'onChange'>) {
  const [value, setValue] = useState(initial);
  return <StarRating {...props} rating={value} interactive onChange={setValue} />;
}

function renderQuestionForm(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  render(
    <MemoryRouter>
      <QuestionForm onSubmit={onSubmit} />
    </MemoryRouter>,
  );
  return onSubmit;
}

function renderQuestionItem(
  question = makeQuestion(),
  handlers = {
    onUpvote: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
  },
) {
  render(
    <MemoryRouter>
      <QuestionItem question={question} onUpvote={handlers.onUpvote} onDelete={handlers.onDelete} />
    </MemoryRouter>,
  );
  return handlers;
}

beforeAll(() => {
  Object.defineProperty(window, 'scrollTo', {
    writable: true,
    configurable: true,
    value: vi.fn(),
  });
  if (!HTMLElement.prototype.scrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      writable: true,
      configurable: true,
      value: vi.fn(),
    });
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.isAuthenticated = true;
  mocks.auth.user = { _id: 'u1', name: 'Người dùng Test', email: 'test@example.com' };
  mocks.cart.addItem.mockResolvedValue(undefined);
  mocks.getProductById.mockResolvedValue({
    success: true,
    message: 'ok',
    data: makeProduct(),
  });
  mocks.getProductReviews.mockResolvedValue({
    success: true,
    data: { reviews: [], stats: { averageRating: 0, totalCount: 0 } },
  });
  mocks.canReviewProduct.mockResolvedValue({
    success: true,
    data: { canReview: false, reason: '' },
  });
});

describe('Wave 4B-2 G-E — M18/S28: QuestionForm label and error association', () => {
  it('gives the textarea a programmatic name, required state and counter (M18)', () => {
    renderQuestionForm();

    const textarea = screen.getByLabelText('Câu hỏi của bạn');
    expect(textarea).toHaveAttribute('id', 'question-text');
    expect(textarea).toHaveAttribute('aria-required', 'true');
    expect(textarea).toHaveAttribute('aria-describedby', 'question-counter');
    expect(textarea).toHaveAttribute('aria-invalid', 'false');
  });

  it('links the validation error to the textarea and focuses it (M18/S28)', () => {
    renderQuestionForm();

    const textarea = screen.getByLabelText('Câu hỏi của bạn');
    fireEvent.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Câu hỏi phải có ít nhất 10 ký tự');
    expect(alert).toHaveAttribute('id', 'question-error');
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(textarea.getAttribute('aria-describedby')?.split(' ')).toEqual(
      expect.arrayContaining(['question-counter', 'question-error']),
    );
    expect(textarea).toHaveFocus();
    // The visible counter stays intact.
    expect(screen.getByText('0/500')).toBeInTheDocument();
  });

  it('associates a submit failure with the textarea and keeps the counter (S28)', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Lỗi máy chủ'));
    renderQuestionForm(onSubmit);

    const value = 'Câu hỏi hợp lệ';
    const textarea = screen.getByLabelText('Câu hỏi của bạn');
    fireEvent.change(textarea, { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Lỗi máy chủ');
    expect(alert).toHaveAttribute('id', 'question-error');
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(textarea.getAttribute('aria-describedby')?.split(' ')).toEqual(
      expect.arrayContaining(['question-counter', 'question-error']),
    );
    expect(screen.getByText(`${value.length}/500`)).toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledWith(value);
  });
});

describe('Wave 4B-2 G-E — M19: QuestionList pagination semantics', () => {
  it('wraps pagination in a named landmark with named controls and a live page status (M19)', () => {
    const onPageChange = vi.fn();
    render(
      <MemoryRouter>
        <QuestionList
          questions={[makeQuestion()]}
          pagination={paginationPage2}
          onPageChange={onPageChange}
          onUpvote={vi.fn()}
          onDelete={vi.fn()}
        />
      </MemoryRouter>,
    );

    const nav = screen.getByRole('navigation', { name: 'Phân trang câu hỏi' });
    const prev = within(nav).getByRole('button', { name: 'Trang trước' });
    const next = within(nav).getByRole('button', { name: 'Trang sau' });
    expect(prev).not.toBeDisabled();
    expect(next).not.toBeDisabled();
    expect(within(nav).getByRole('status')).toHaveTextContent('Trang 2 / 3');

    fireEvent.click(prev);
    expect(onPageChange).toHaveBeenCalledWith(1);
    fireEvent.click(next);
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('keeps the disabled state of the previous control on the first page', () => {
    render(
      <MemoryRouter>
        <QuestionList
          questions={[makeQuestion()]}
          pagination={{ ...paginationPage2, currentPage: 1, hasPrevPage: false, prevPage: null }}
          onPageChange={vi.fn()}
          onUpvote={vi.fn()}
          onDelete={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Trang sau' })).not.toBeDisabled();
  });
});

describe('Wave 4B-2 G-E — M20/S26: QuestionItem controls', () => {
  it('names the upvote toggle by purpose with pressed state, keeping the visible count (M20)', async () => {
    const handlers = renderQuestionItem(makeQuestion({ hasUpvoted: false }));

    const upvote = screen.getByRole('button', { name: 'Thích (3 lượt)' });
    expect(upvote).toHaveAttribute('aria-pressed', 'false');
    expect(upvote).toHaveAttribute('title', 'Thích');
    expect(within(upvote).getByText('3')).toBeInTheDocument();

    fireEvent.click(upvote);
    expect(handlers.onUpvote).toHaveBeenCalledWith('q1');
    // The busy state settles inside act.
    await waitFor(() => expect(upvote).not.toBeDisabled());
  });

  it('reflects the pressed state once the question is upvoted (M20)', () => {
    renderQuestionItem(makeQuestion({ hasUpvoted: true }));

    const upvote = screen.getByRole('button', { name: 'Bỏ thích (3 lượt)' });
    expect(upvote).toHaveAttribute('aria-pressed', 'true');
    expect(within(upvote).getByText('3')).toBeInTheDocument();
  });

  it('falls back to the login purpose label for guests (M20)', () => {
    mocks.auth.isAuthenticated = false;
    mocks.auth.user = null;
    renderQuestionItem();

    const upvote = screen.getByRole('button', { name: 'Đăng nhập để thích (3 lượt)' });
    expect(upvote).toBeDisabled();
    expect(upvote).toHaveAttribute('aria-pressed', 'false');
    expect(within(upvote).getByText('3')).toBeInTheDocument();
  });

  it('labels the owner delete button and exposes its busy state (S26)', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    let resolveDelete!: () => void;
    const onDelete = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );
    render(
      <MemoryRouter>
        <QuestionItem question={makeQuestion()} onUpvote={vi.fn()} onDelete={onDelete} />
      </MemoryRouter>,
    );

    const remove = screen.getByRole('button', { name: 'Xóa câu hỏi' });
    expect(remove).toHaveAttribute('aria-busy', 'false');
    expect(remove).toHaveAttribute('title', 'Xóa câu hỏi');

    fireEvent.click(remove);
    await waitFor(() => expect(remove).toHaveAttribute('aria-busy', 'true'));

    resolveDelete();
    await waitFor(() => expect(remove).toHaveAttribute('aria-busy', 'false'));
    expect(onDelete).toHaveBeenCalledWith('q1');
    confirmSpy.mockRestore();
  });
});

describe('Wave 4B-2 G-E — S27: ReviewForm rating group', () => {
  function renderReviewForm(onSubmit = vi.fn().mockResolvedValue(undefined)) {
    render(
      <MemoryRouter>
        <ReviewForm canReview onSubmit={onSubmit} />
      </MemoryRouter>,
    );
    return onSubmit;
  }

  it('labels the rating group as required and keeps the comment label (S27)', () => {
    renderReviewForm();

    const group = screen.getByRole('radiogroup', { name: /Đánh giá/ });
    expect(group).toHaveAttribute('aria-labelledby', 'review-rating-label');
    expect(group).toHaveAttribute('aria-required', 'true');
    expect(group).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    expect(screen.getByLabelText('Nhận xét (không bắt buộc)')).toBeInTheDocument();
  });

  it('links the required-rating error to the group through the error id (S27)', () => {
    renderReviewForm();

    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Vui lòng chọn số sao đánh giá');
    expect(alert).toHaveAttribute('id', 'review-error');
    const group = screen.getByRole('radiogroup', { name: /Đánh giá/ });
    expect(group.getAttribute('aria-describedby')?.split(' ')).toContain('review-error');
    expect(group).toHaveAttribute('aria-invalid', 'true');
    expect(alert).toHaveFocus();
  });

  it('routes a submit failure to the comment textarea (S28)', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Server lỗi'));
    renderReviewForm(onSubmit);

    const textarea = screen.getByLabelText('Nhận xét (không bắt buộc)');
    fireEvent.change(textarea, { target: { value: 'Tốt' } });
    fireEvent.click(screen.getByRole('radio', { name: '2 sao' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Server lỗi');
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(textarea.getAttribute('aria-describedby')?.split(' ')).toEqual(
      expect.arrayContaining(['comment-counter', 'review-error']),
    );
    expect(onSubmit).toHaveBeenCalledWith(2, 'Tốt');
    const group = screen.getByRole('radiogroup', { name: /Đánh giá/ });
    expect(group).not.toHaveAttribute('aria-describedby');
    expect(group).toHaveAttribute('aria-invalid', 'false');
  });

  it('links a length-validation error to the comment textarea and counter (S28)', async () => {
    renderReviewForm();

    const textarea = screen.getByLabelText('Nhận xét (không bắt buộc)');
    fireEvent.change(textarea, { target: { value: 'x'.repeat(1001) } });
    fireEvent.click(screen.getByRole('radio', { name: '2 sao' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Nhận xét không được vượt quá 1000 ký tự');
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(textarea.getAttribute('aria-describedby')?.split(' ')).toEqual(
      expect.arrayContaining(['comment-counter', 'review-error']),
    );
    expect(screen.getByText('1001/1000')).toBeInTheDocument();
  });
});

describe('Wave 4B-2 G-E — S29: loading announcements', () => {
  it('announces the question list loading copy through role="status"', () => {
    render(
      <MemoryRouter>
        <QuestionList questions={[]} isLoading onUpvote={vi.fn()} onDelete={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Đang tải câu hỏi...');
  });

  it('announces the review list loading copy through role="status"', () => {
    render(
      <MemoryRouter>
        <ReviewList reviews={[]} stats={{ averageRating: 0, totalCount: 0 }} isLoading />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Đang tải đánh giá...');
  });

  it('announces the compare loading copy and hides its spinner (S29)', () => {
    mocks.getCompareProducts.mockReturnValue(new Promise(() => {}));
    const { container } = render(
      <MemoryRouter initialEntries={['/compare?products=p1,p2']}>
        <ComparePage />
      </MemoryRouter>,
    );

    const loading = screen.getByText('Đang tải so sánh sản phẩm...');
    expect(loading.closest('[role="status"]')).toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Wave 4B-2 G-E — S32: ProductDetailPage color picker', () => {
  it('labels the color group and exposes the selected color as pressed state (S32)', async () => {
    render(
      <MemoryRouter initialEntries={['/products/p1']}>
        <Routes>
          <Route path="/products/:id" element={<ProductDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole('group', { name: /Số lượng/ });

    const colorGroup = screen.getByRole('group', { name: 'Màu sắc:' });
    const black = within(colorGroup).getByRole('button', { name: 'Đen' });
    const white = within(colorGroup).getByRole('button', { name: 'Trắng' });

    expect(black).toHaveAttribute('aria-pressed', 'true');
    expect(white).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(white);
    expect(white).toHaveAttribute('aria-pressed', 'true');
    expect(black).toHaveAttribute('aria-pressed', 'false');
  });

  it('exposes the group as "Màu sắc" with exactly one pressed color before and after switching', async () => {
    render(
      <MemoryRouter initialEntries={['/products/p1']}>
        <Routes>
          <Route path="/products/:id" element={<ProductDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole('group', { name: /Số lượng/ });

    const colorGroup = screen.getByRole('group', { name: /Màu sắc/ });
    const buttons = within(colorGroup).getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(
      buttons.filter((button) => button.getAttribute('aria-pressed') === 'true'),
    ).toHaveLength(1);
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(buttons[1]);

    const after = within(screen.getByRole('group', { name: /Màu sắc/ })).getAllByRole(
      'button',
    );
    expect(
      after.filter((button) => button.getAttribute('aria-pressed') === 'true'),
    ).toHaveLength(1);
    expect(after[0]).toHaveAttribute('aria-pressed', 'false');
    expect(after[1]).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Wave 4B-2 G-E — S34: StarRating keyboard model', () => {
  it('keeps exactly one tab stop that follows the checked star', () => {
    render(<InteractiveRating initial={0} />);

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(5);
    expect(radios.filter((radio) => radio.tabIndex === 0)).toHaveLength(1);
    expect(screen.getByRole('radio', { name: '1 sao' }).tabIndex).toBe(0);

    fireEvent.click(screen.getByRole('radio', { name: '3 sao' }));

    const checked = screen.getByRole('radio', { name: '3 sao' });
    expect(checked).toHaveAttribute('aria-checked', 'true');
    expect(checked.tabIndex).toBe(0);
    expect(
      screen.getAllByRole('radio').filter((radio) => radio.tabIndex === 0),
    ).toHaveLength(1);
  });

  it('starts with one tab stop on the selected star and -1 on every other star', () => {
    render(<InteractiveRating initial={4} />);

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(5);
    expect(screen.getByRole('radio', { name: '4 sao' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    radios.forEach((radio, index) => {
      expect(radio.tabIndex).toBe(index === 3 ? 0 : -1);
    });
  });

  it('reports the exact rating through onChange while moving focus across keys and limits', () => {
    const onChange = vi.fn();
    render(<StarRating rating={0} interactive onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole('radio', { name: '1 sao' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith(2);
    expect(screen.getByRole('radio', { name: '2 sao' })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('radio', { name: '2 sao' }), { key: 'ArrowDown' });
    expect(onChange).toHaveBeenLastCalledWith(3);
    expect(screen.getByRole('radio', { name: '3 sao' })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('radio', { name: '3 sao' }), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith(2);
    expect(screen.getByRole('radio', { name: '2 sao' })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('radio', { name: '2 sao' }), { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith(1);
    expect(screen.getByRole('radio', { name: '1 sao' })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('radio', { name: '1 sao' }), { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith(5);
    expect(screen.getByRole('radio', { name: '5 sao' })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('radio', { name: '5 sao' }), { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith(1);
    expect(screen.getByRole('radio', { name: '1 sao' })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('radio', { name: '1 sao' }), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith(1);

    fireEvent.keyDown(screen.getByRole('radio', { name: '5 sao' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith(5);
  });

  it('moves selection and focus with the arrow keys', () => {
    render(<InteractiveRating initial={0} />);

    fireEvent.keyDown(screen.getByRole('radio', { name: '1 sao' }), { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: '2 sao' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '2 sao' })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('radio', { name: '2 sao' }), { key: 'ArrowDown' });
    expect(screen.getByRole('radio', { name: '3 sao' })).toHaveAttribute('aria-checked', 'true');

    fireEvent.keyDown(screen.getByRole('radio', { name: '3 sao' }), { key: 'ArrowLeft' });
    expect(screen.getByRole('radio', { name: '2 sao' })).toHaveAttribute('aria-checked', 'true');

    fireEvent.keyDown(screen.getByRole('radio', { name: '2 sao' }), { key: 'ArrowUp' });
    expect(screen.getByRole('radio', { name: '1 sao' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '1 sao' })).toHaveFocus();
  });

  it('jumps to the ends with Home/End and clamps at the edges', () => {
    render(<InteractiveRating initial={3} />);

    fireEvent.keyDown(screen.getByRole('radio', { name: '3 sao' }), { key: 'End' });
    expect(screen.getByRole('radio', { name: '5 sao' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '5 sao' })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('radio', { name: '5 sao' }), { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: '5 sao' })).toHaveAttribute('aria-checked', 'true');

    fireEvent.keyDown(screen.getByRole('radio', { name: '5 sao' }), { key: 'Home' });
    expect(screen.getByRole('radio', { name: '1 sao' })).toHaveAttribute('aria-checked', 'true');

    fireEvent.keyDown(screen.getByRole('radio', { name: '1 sao' }), { key: 'ArrowLeft' });
    expect(screen.getByRole('radio', { name: '1 sao' })).toHaveAttribute('aria-checked', 'true');
  });

  it('passes labelledby/required/describedby/invalid through to the group (S27/S34)', () => {
    render(
      <>
        <span id="rating-lbl">Chấm điểm sản phẩm</span>
        <span id="rating-desc">Từ 1 đến 5 sao</span>
        <InteractiveRating
          aria-labelledby="rating-lbl"
          aria-describedby="rating-desc"
          aria-required
          aria-invalid
        />
      </>,
    );

    const group = screen.getByRole('radiogroup', { name: 'Chấm điểm sản phẩm' });
    expect(group).toHaveAttribute('aria-required', 'true');
    expect(group).toHaveAttribute('aria-describedby', 'rating-desc');
    expect(group).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByLabelText('Chọn đánh giá')).toBeNull();
  });

  it('keeps display mode unchanged: one labelled image, no radios, no tab stops', () => {
    render(<StarRating rating={4} size="sm" />);

    expect(screen.getByRole('img', { name: 'Đánh giá 4 trên 5 sao' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    const stars = screen.getAllByRole('button');
    expect(stars).toHaveLength(5);
    stars.forEach((star) => {
      expect(star).toBeDisabled();
      expect(star.tabIndex).toBe(-1);
    });
  });
});
