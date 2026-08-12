import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminReviewsPage } from '@/features/admin/pages/AdminReviewsPage';
import type { Review } from '@/types/review.type';

const mockGetAllReviews = vi.fn();

vi.mock('@/services/review.service', () => ({
  reviewService: {
    getAllReviews: (...args: unknown[]) => mockGetAllReviews(...args),
  },
}));

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

function getTableContainer() {
  return document.querySelector('[data-slot="table-container"]') as HTMLElement | null;
}

describe('AdminReviewsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllReviews.mockResolvedValue({
      success: true,
      message: 'ok',
      data: {
        reviews: [makeReview()],
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
    });
  });

  it('renders the page in a full-width wrapper (no centered container) so tables use available main width', async () => {
    const { container } = render(<AdminReviewsPage />);

    expect(await screen.findByText('Nguyễn Văn A')).toBeInTheDocument();
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('w-full');
    expect(root.className).toContain('space-y-6');
    expect(root.className).not.toContain('container');
  });

  it('renders reviews inside a horizontally scrollable table container', async () => {
    render(<AdminReviewsPage />);

    expect(await screen.findByText('Nguyễn Văn A')).toBeInTheDocument();
    const containerEl = getTableContainer();
    expect(containerEl).not.toBeNull();
    expect(containerEl!.className).toContain('overflow-x-auto');
    expect(containerEl!.className).toContain('w-full');
  });

  it('wraps review content instead of single-line truncation', async () => {
    render(<AdminReviewsPage />);

    expect(await screen.findByText('Nguyễn Văn A')).toBeInTheDocument();
    const comment = screen.getByText('Sản phẩm tốt');
    const commentCell = comment.closest('td') as HTMLElement;
    expect(commentCell.className).toContain('whitespace-normal');
    expect(commentCell.className).toContain('line-clamp-3');
    expect(commentCell.className).not.toContain('truncate');
    expect(commentCell.getAttribute('title')).toBe('Sản phẩm tốt');
  });
});
