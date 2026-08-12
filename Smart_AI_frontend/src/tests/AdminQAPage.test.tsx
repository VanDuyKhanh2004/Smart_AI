import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminQAPage } from '@/features/admin/pages/AdminQAPage';
import type { Question } from '@/types/qa.type';

const mockGetAllQuestions = vi.fn();
const mockUpdateQuestionStatus = vi.fn();
const mockDeleteQuestion = vi.fn();
const mockGetAllProducts = vi.fn();
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

vi.mock('@/services/product.service', () => ({
  productService: {
    getAllProducts: (...args: unknown[]) => mockGetAllProducts(...args),
  },
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

function getTableContainer() {
  return document.querySelector('[data-slot="table-container"]') as HTMLElement | null;
}

describe('AdminQAPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllQuestions.mockResolvedValue(mockListResponse([makeQuestion()]));
    mockGetAllProducts.mockResolvedValue({
      success: true,
      message: 'ok',
      data: { products: [], pagination: { currentPage: 1, totalPages: 1, totalCount: 0, limit: 10, hasNextPage: false, hasPrevPage: false, nextPage: null, prevPage: null } },
    });
  });

  it('renders questions inside a horizontally scrollable table container', async () => {
    render(<AdminQAPage />);

    expect(await screen.findByText(/Sản phẩm này có màu xanh không/)).toBeInTheDocument();
    const container = getTableContainer();
    expect(container).not.toBeNull();
    expect(container!.className).toContain('overflow-x-auto');
    expect(container!.className).toContain('w-full');
    expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument();
  });

  it('shows action buttons and updates status on approve', async () => {
    mockUpdateQuestionStatus.mockResolvedValue({
      success: true,
      message: 'ok',
      data: makeQuestion({ status: 'approved' }),
    });

    render(<AdminQAPage />);

    const approveButton = await screen.findByRole('button', { name: /Duyệt/ });
    fireEvent.click(approveButton);

    await waitFor(() => expect(mockUpdateQuestionStatus).toHaveBeenCalledWith('q1', 'approved'));
  });

  it('renders the page in a full-width wrapper (no centered container) so tables use available main width', async () => {
    const { container } = render(<AdminQAPage />);

    expect(await screen.findByText(/Sản phẩm này có màu xanh không/)).toBeInTheDocument();
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('w-full');
    expect(root.className).toContain('space-y-6');
    expect(root.className).not.toContain('container');
  });

  it('wraps long question text (no single-line truncation) and keeps the full value accessible', async () => {
    render(<AdminQAPage />);

    const questionText = await screen.findByText(/Sản phẩm này có màu xanh không/);
    expect(questionText.className).toContain('line-clamp-2');
    expect(questionText.className).not.toContain('truncate');
    expect(questionText.getAttribute('title')).toBe('Sản phẩm này có màu xanh không?');
  });
});
