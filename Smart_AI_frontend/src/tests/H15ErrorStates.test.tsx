import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminProductTable } from '@/features/admin/components/AdminProductTable';
import { SummaryCards } from '@/features/admin/components/SummaryCards';
import { OrderStats } from '@/features/orders/components/OrderStats';
import { ReviewList } from '@/features/products/components/ReviewList';
import { AdminProductPage } from '@/features/admin/pages/AdminProductPage';
import type { Product } from '@/types/product.type';
import type { Review } from '@/types/review.type';

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

function makeProduct(): Product {
  return {
    _id: 'p1',
    name: 'iPhone 14',
    brand: 'apple',
    price: 16000000,
    description: 'Mô tả sản phẩm',
    inStock: 10,
    colors: ['Đen'],
    tags: ['flagship'],
    image: 'https://example.com/phone.jpg',
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

function makeListResponse(products: Product[] = [makeProduct()]) {
  return {
    success: true,
    message: 'ok',
    data: {
      products,
      pagination: {
        currentPage: 1,
        totalPages: 1,
        totalCount: products.length,
        limit: 10,
        hasNextPage: false,
        hasPrevPage: false,
        nextPage: null,
        prevPage: null,
      },
    },
  };
}

function makeReview(): Review {
  return {
    _id: 'r1',
    user: { _id: 'u1', name: 'Nguyễn Văn A' },
    product: 'p1',
    rating: 5,
    comment: 'Sản phẩm tốt',
    status: 'approved',
    isVerifiedPurchase: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  } as Review;
}

function pulseCount(container: HTMLElement) {
  return container.querySelectorAll('.animate-pulse').length;
}

describe('H15: AdminProductTable list states', () => {
  const base = { products: [], onEdit: vi.fn(), onDelete: vi.fn() };

  it('shows skeletons (not empty, not error) while the list is loading', () => {
    const { container } = render(<AdminProductTable {...base} isLoading />);

    expect(pulseCount(container)).toBeGreaterThan(0);
    expect(screen.queryByText('Không có sản phẩm nào')).toBeNull();
    expect(screen.queryByText('Không thể tải danh sách sản phẩm.')).toBeNull();
  });

  it('shows the legitimate empty state when a successful response has zero products', () => {
    render(<AdminProductTable {...base} />);

    expect(screen.getByText('Không có sản phẩm nào')).toBeInTheDocument();
    expect(screen.queryByText('Không thể tải danh sách sản phẩm.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  it('shows an error with retry instead of the empty state when the fetch failed', () => {
    const onRetry = vi.fn();
    render(<AdminProductTable {...base} isError onRetry={onRetry} />);

    expect(
      screen.getByText('Không thể tải danh sách sản phẩm.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Không có sản phẩm nào')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('H15: SummaryCards dashboard states', () => {
  const summary = {
    totalRevenue: 1000000,
    totalOrders: 12,
    totalUsers: 5,
    pendingOrders: 3,
    revenueChange: 1.5,
    ordersChange: -0.5,
    usersChange: 2,
  };

  it('shows skeletons (not an error) while the dashboard is loading', () => {
    const { container } = render(<SummaryCards summary={null} isLoading />);

    expect(pulseCount(container)).toBeGreaterThan(0);
    expect(screen.queryByText(/Không thể tải số liệu tổng quan/)).toBeNull();
  });

  it('replaces endless skeletons with an error + retry when the fetch failed', () => {
    const onRetry = vi.fn();
    const { container } = render(
      <SummaryCards summary={null} isError onRetry={onRetry} />
    );

    expect(
      screen.getByText('Không thể tải số liệu tổng quan.')
    ).toBeInTheDocument();
    expect(pulseCount(container)).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders the cards unchanged when the fetch succeeds', () => {
    render(<SummaryCards summary={summary} />);

    expect(screen.getByText('Tổng doanh thu')).toBeInTheDocument();
    expect(screen.queryByText(/Không thể tải số liệu tổng quan/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });
});

describe('H15: OrderStats states', () => {
  const stats = {
    total: 10,
    pending: 1,
    confirmed: 1,
    processing: 1,
    shipping: 1,
    delivered: 5,
    cancelled: 1,
  };

  it('shows skeletons (not an error) while the stats are loading', () => {
    const { container } = render(<OrderStats stats={null} isLoading />);

    expect(pulseCount(container)).toBeGreaterThan(0);
    expect(screen.queryByText(/Không thể tải thống kê đơn hàng/)).toBeNull();
  });

  it('replaces endless skeletons with an error + retry when the fetch failed', () => {
    const onRetry = vi.fn();
    const { container } = render(
      <OrderStats stats={null} isError onRetry={onRetry} />
    );

    expect(
      screen.getByText('Không thể tải thống kê đơn hàng.')
    ).toBeInTheDocument();
    expect(pulseCount(container)).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders the stat cards unchanged when the fetch succeeds', () => {
    render(<OrderStats stats={stats} />);

    expect(screen.getByText('Tổng đơn hàng')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });
});

describe('H15: ReviewList states', () => {
  const emptyStats = { averageRating: 0, totalCount: 0 };

  it('shows the loading state while reviews are pending', () => {
    render(<ReviewList reviews={[]} stats={emptyStats} isLoading />);

    expect(screen.getByText('Đang tải đánh giá...')).toBeInTheDocument();
    expect(
      screen.queryByText('Chưa có đánh giá nào cho sản phẩm này.')
    ).toBeNull();
    expect(
      screen.queryByText('Không thể tải đánh giá. Vui lòng thử lại sau.')
    ).toBeNull();
  });

  it('shows the legitimate empty state when a successful response has zero reviews', () => {
    render(<ReviewList reviews={[]} stats={emptyStats} />);

    expect(
      screen.getByText('Chưa có đánh giá nào cho sản phẩm này.')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Không thể tải đánh giá. Vui lòng thử lại sau.')
    ).toBeNull();
  });

  it('shows an error instead of the empty state when the reviews fetch failed', () => {
    const onRetry = vi.fn();
    render(
      <ReviewList
        reviews={[]}
        stats={emptyStats}
        error="Không thể tải đánh giá. Vui lòng thử lại sau."
        onRetry={onRetry}
      />
    );

    expect(
      screen.getByText('Không thể tải đánh giá. Vui lòng thử lại sau.')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Chưa có đánh giá nào cho sản phẩm này.')
    ).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('recovers to the normal rendering after the retry succeeds', () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <ReviewList
        reviews={[]}
        stats={emptyStats}
        error="Không thể tải đánh giá. Vui lòng thử lại sau."
        onRetry={onRetry}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(
      <ReviewList
        reviews={[makeReview()]}
        stats={{ averageRating: 5, totalCount: 1 }}
        onRetry={onRetry}
      />
    );

    expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument();
    expect(
      screen.queryByText('Không thể tải đánh giá. Vui lòng thử lại sau.')
    ).toBeNull();
    expect(
      screen.queryByText('Chưa có đánh giá nào cho sản phẩm này.')
    ).toBeNull();
  });
});

describe('H15: AdminProductPage list fetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllProducts.mockResolvedValue(makeListResponse());
    mockCreateProduct.mockResolvedValue({ success: true, message: 'ok', data: makeProduct() });
    mockUpdateProduct.mockResolvedValue({ success: true, message: 'ok', data: makeProduct() });
  });

  it('shows loading skeletons while the list request is pending', () => {
    mockGetAllProducts.mockReturnValue(new Promise(() => {}));

    const { container } = render(<AdminProductPage />);

    expect(pulseCount(container)).toBeGreaterThan(0);
    expect(screen.queryByText('Không có sản phẩm nào')).toBeNull();
    expect(screen.queryByText('Không thể tải danh sách sản phẩm.')).toBeNull();
  });

  it('shows an error (not the empty state) on failure, and Thử lại recovers to the list', async () => {
    mockGetAllProducts.mockRejectedValueOnce(new Error('network'));

    render(<AdminProductPage />);

    expect(
      await screen.findByText('Không thể tải danh sách sản phẩm.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Không có sản phẩm nào')).toBeNull();

    mockGetAllProducts.mockResolvedValue(makeListResponse());
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(await screen.findByText('iPhone 14')).toBeInTheDocument();
    expect(screen.queryByText('Không thể tải danh sách sản phẩm.')).toBeNull();
    expect(mockGetAllProducts.mock.calls.length).toBe(2);
  });
});
