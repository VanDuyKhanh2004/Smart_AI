import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import CartPage from '@/features/cart/pages/CartPage';
import ProductDetailPage from '@/features/products/pages/ProductDetailPage';
import ProductListPage from '@/features/products/pages/ProductListPage';
import type { Product } from '@/types/product.type';

const mocks = vi.hoisted(() => {
  const cart = {
    items: [] as Array<{ _id: string; product: { name: string }; quantity: number }>,
    isLoading: false,
    error: null as string | null,
    getTotalItems: vi.fn(() => 0),
    getTotalPrice: vi.fn(() => 0),
    fetchCart: vi.fn(),
    updateQuantity: vi.fn(),
    removeItem: vi.fn(),
    clearCart: vi.fn(),
    loadFromLocalStorage: vi.fn(),
    addItem: vi.fn(),
  };
  const useCartStore = Object.assign(() => cart, { getState: () => cart });
  return {
    cart,
    useCartStore,
    getProductById: vi.fn(),
    getAllProducts: vi.fn(),
    getProductMeta: vi.fn(),
    getProductReviews: vi.fn(),
    canReviewProduct: vi.fn(),
    checkMultipleStatus: vi.fn(),
  };
});

vi.mock('@/stores/cartStore', () => ({ useCartStore: mocks.useCartStore }));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ isAuthenticated: false }),
}));

vi.mock('@/stores/wishlistStore', () => ({
  useWishlistStore: () => ({ checkMultipleStatus: mocks.checkMultipleStatus }),
}));

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

vi.mock('@/features/cart/components/CartItem', () => ({
  __esModule: true,
  default: ({
    item,
    onUpdateQuantity,
    onRemove,
  }: {
    item: { _id: string; product: { name: string }; quantity: number };
    onUpdateQuantity: (id: string, quantity: number) => void;
    onRemove: (id: string) => void;
  }) => (
    <div>
      <span>{item.product.name}</span>
      <button type="button" onClick={() => onUpdateQuantity(item._id, item.quantity + 1)}>
        Tăng số lượng
      </button>
      <button type="button" onClick={() => onRemove(item._id)}>
        Xóa sản phẩm
      </button>
    </div>
  ),
}));

vi.mock('@/features/cart/components/CartSummary', () => ({
  __esModule: true,
  default: ({ onClearCart }: { onClearCart: () => void }) => (
    <button type="button" onClick={onClearCart}>
      Xóa tất cả
    </button>
  ),
}));

vi.mock('@/components/ui/WishlistButton', () => ({
  __esModule: true,
  default: () => <button type="button">Yêu thích</button>,
}));

vi.mock('@/components/ui/CompareButton', () => ({
  __esModule: true,
  default: () => <button type="button">So sánh</button>,
}));

vi.mock('@/components/ui/StarRating', () => ({
  StarRating: () => <div data-testid="star-rating" />,
}));

vi.mock('@/components/ui/carousel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/carousel')>();
  return {
    ...actual,
    Carousel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    CarouselContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    CarouselItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    CarouselNext: () => <button type="button">Next</button>,
    CarouselPrevious: () => <button type="button">Prev</button>,
  };
});

vi.mock('@/features/products/components/ReviewList', () => ({
  ReviewList: () => <div data-testid="review-list" />,
}));

vi.mock('@/features/products/components/ReviewForm', () => ({
  ReviewForm: () => <div data-testid="review-form" />,
}));

vi.mock('@/features/products/components/QASection', () => ({
  QASection: () => <div data-testid="qa-section" />,
}));

vi.mock('@/features/products/components/ProductRecommendations', () => ({
  __esModule: true,
  default: () => <div data-testid="recommendations" />,
}));

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    _id: 'p1',
    name: 'iPhone 14',
    brand: 'apple',
    price: 16000000,
    description: 'Mô tả sản phẩm',
    inStock: 3,
    colors: [],
    tags: [],
    image: 'https://example.com/phone.jpg',
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
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

function makePaginatedListResponse(products: Product[], currentPage: number, totalPages: number) {
  return {
    success: true,
    message: 'ok',
    data: {
      products,
      pagination: {
        currentPage,
        totalPages,
        totalCount: products.length,
        limit: 10,
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1,
        nextPage: currentPage < totalPages ? currentPage + 1 : null,
        prevPage: currentPage > 1 ? currentPage - 1 : null,
      },
    },
  };
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

  mocks.cart.items = [{ _id: 'i1', product: { name: 'iPhone 14' }, quantity: 1 }];
  mocks.cart.isLoading = false;
  mocks.cart.error = null;
  mocks.cart.getTotalItems.mockReturnValue(1);
  mocks.cart.getTotalPrice.mockReturnValue(16000000);
  mocks.cart.updateQuantity.mockResolvedValue(undefined);
  mocks.cart.removeItem.mockResolvedValue(undefined);
  mocks.cart.clearCart.mockResolvedValue(undefined);

  mocks.getProductById.mockResolvedValue({ success: true, message: 'ok', data: makeProduct() });
  mocks.getProductReviews.mockResolvedValue({
    success: true,
    data: { reviews: [], stats: { averageRating: 0, totalCount: 0 } },
  });
  mocks.canReviewProduct.mockResolvedValue({
    success: true,
    data: { canReview: false, reason: '' },
  });

  mocks.getAllProducts.mockResolvedValue(makeListResponse());
  mocks.getProductMeta.mockResolvedValue({ brands: ['apple', 'samsung'] });
});

function renderCart() {
  return render(
    <MemoryRouter>
      <CartPage />
    </MemoryRouter>,
  );
}

async function renderDetail(overrides: Partial<Product> = {}) {
  mocks.getProductById.mockResolvedValue({
    success: true,
    message: 'ok',
    data: makeProduct(overrides),
  });
  render(
    <MemoryRouter initialEntries={['/products/p1']}>
      <Routes>
        <Route path="/products/:id" element={<ProductDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
  return await screen.findByRole('group', { name: /Số lượng/ });
}

function renderList() {
  return render(
    <MemoryRouter>
      <ProductListPage />
    </MemoryRouter>,
  );
}

describe('W4-S27 cart mutation announcements', () => {
  it('renders a persistent polite live region', () => {
    renderCart();

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toBeEmptyDOMElement();
  });

  it('announces a quantity update with the product name and new totals', async () => {
    renderCart();

    fireEvent.click(screen.getByRole('button', { name: 'Tăng số lượng' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Đã cập nhật số lượng iPhone 14');
    });
    expect(screen.getByRole('status')).toHaveTextContent('1 sản phẩm trong giỏ hàng');
    expect(screen.getByRole('status')).toHaveTextContent(/tạm tính/);
    expect(mocks.cart.updateQuantity).toHaveBeenCalledWith('i1', 2);
  });

  it('announces an item removal', async () => {
    renderCart();

    fireEvent.click(screen.getByRole('button', { name: 'Xóa sản phẩm' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Đã xóa iPhone 14 khỏi giỏ hàng');
    });
  });

  it('announces clearing the whole cart', async () => {
    renderCart();

    fireEvent.click(screen.getByRole('button', { name: 'Xóa tất cả' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Đã xóa tất cả sản phẩm trong giỏ hàng.',
      );
    });
  });

  it('announces a failed mutation through the same polite region', async () => {
    mocks.cart.updateQuantity.mockRejectedValue(new Error('boom'));
    renderCart();

    fireEvent.click(screen.getByRole('button', { name: 'Tăng số lượng' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Không thể cập nhật số lượng.');
    });
  });

  it('marks the cart grid aria-busy while loading', () => {
    mocks.cart.isLoading = true;
    const { container } = renderCart();

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('keeps aria-busy false when idle', () => {
    const { container } = renderCart();

    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });
});

describe('W4-S13 product quantity stepper', () => {
  it('exposes the stepper as a labelled group with named buttons', async () => {
    const group = await renderDetail();

    expect(within(group).getByRole('button', { name: 'Giảm số lượng' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Tăng số lượng' })).toBeInTheDocument();
    expect(group.querySelector('[aria-live="polite"]')).toHaveTextContent('1');
  });

  it('enforces the minimum and maximum with disabled states', async () => {
    const group = await renderDetail({ inStock: 2 });
    const minus = within(group).getByRole('button', { name: 'Giảm số lượng' });
    const plus = within(group).getByRole('button', { name: 'Tăng số lượng' });
    const value = () => group.querySelector('[aria-live="polite"]') as HTMLElement;

    expect(minus).toBeDisabled();
    expect(value()).toHaveTextContent('1');

    fireEvent.click(plus);
    expect(value()).toHaveTextContent('2');
    expect(plus).toBeDisabled();
    expect(minus).not.toBeDisabled();

    fireEvent.click(minus);
    expect(value()).toHaveTextContent('1');
    expect(minus).toBeDisabled();
  });
});

describe('W4-S01/S02/S05/S10 product list announcements', () => {
  it('announces the result count politely', async () => {
    renderList();

    const count = await screen.findByText(/Hiển thị 1 trong tổng số 1 sản phẩm/);
    expect(count).toHaveAttribute('role', 'status');
  });

  it('announces loading politely', () => {
    mocks.getAllProducts.mockReturnValue(new Promise(() => {}));
    renderList();

    const loading = screen.getByText('Đang tải danh sách sản phẩm...');
    expect(loading).toHaveAttribute('role', 'status');
  });

  it('announces load failures with role="alert"', async () => {
    mocks.getAllProducts.mockRejectedValue(new Error('network'));
    renderList();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Không thể tải danh sách sản phẩm/);
    });
  });

  it('announces page changes and moves focus to the results heading', async () => {
    mocks.getAllProducts.mockImplementation((params: Record<string, unknown>) => {
      const requestedPage = Number(params.page ?? 1);
      return Promise.resolve(
        makePaginatedListResponse(
          [makeProduct({ _id: `p${requestedPage}`, name: `Product page ${requestedPage}` })],
          requestedPage,
          3,
        ),
      );
    });
    renderList();

    await screen.findByText('Product page 1');
    fireEvent.click(screen.getByRole('link', { name: '2' }));
    await screen.findByText('Product page 2');

    await waitFor(() => {
      const statuses = screen.getAllByRole('status');
      expect(
        statuses.some((status) => status.textContent?.includes('Đang chuyển đến trang 2')),
      ).toBe(true);
    });
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Danh sách sản phẩm' })).toHaveFocus();
    });
  });
});

describe('W4-S04/S06 filter labels', () => {
  it('labels every filter control', async () => {
    renderList();
    await screen.findByText('iPhone 14');

    expect(screen.getByLabelText('Tìm kiếm')).toBeInTheDocument();
    expect(screen.getByLabelText('Thương hiệu')).toBeInTheDocument();
    expect(screen.getByLabelText('Tình trạng')).toBeInTheDocument();
    expect(screen.getByLabelText('Đánh giá')).toBeInTheDocument();
    expect(screen.getByLabelText('Sắp xếp')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Khoảng giá' })).toBeInTheDocument();
    expect(screen.getByLabelText('Giá tối thiểu')).toBeInTheDocument();
    expect(screen.getByLabelText('Giá tối đa')).toBeInTheDocument();
  });
});
