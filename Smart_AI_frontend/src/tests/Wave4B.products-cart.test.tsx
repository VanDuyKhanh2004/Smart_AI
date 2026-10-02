import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    isAuthenticated: false,
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
  useAuthStore: () => ({ isAuthenticated: mocks.isAuthenticated }),
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
  default: ({
    onClearCart,
    onCheckout,
  }: {
    onClearCart: () => void;
    onCheckout: () => void;
  }) => (
    <>
      <button type="button" onClick={onClearCart}>
        Xóa tất cả
      </button>
      <button type="button" onClick={onCheckout}>
        Thanh toán
      </button>
    </>
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

  mocks.isAuthenticated = false;
  mocks.cart.items = [{ _id: 'i1', product: { name: 'iPhone 14' }, quantity: 1 }];
  mocks.cart.isLoading = false;
  mocks.cart.error = null;
  mocks.cart.getTotalItems.mockReturnValue(1);
  mocks.cart.getTotalPrice.mockReturnValue(16000000);
  mocks.cart.updateQuantity.mockResolvedValue(undefined);
  mocks.cart.removeItem.mockResolvedValue(undefined);
  mocks.cart.clearCart.mockResolvedValue(undefined);
  mocks.cart.addItem.mockResolvedValue(undefined);

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

async function renderDetail() {
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

describe('W4-S19/S20 product detail load feedback', () => {
  it('announces the initial load politely', () => {
    mocks.getProductById.mockReturnValue(new Promise(() => {}));
    render(
      <MemoryRouter initialEntries={['/products/p1']}>
        <Routes>
          <Route path="/products/:id" element={<ProductDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const loading = screen.getByText('Đang tải thông tin sản phẩm...');
    expect(loading).toHaveAttribute('role', 'status');
  });

  it('announces load failures with role="alert"', async () => {
    mocks.getProductById.mockRejectedValue(new Error('network'));
    render(
      <MemoryRouter initialEntries={['/products/p1']}>
        <Routes>
          <Route path="/products/:id" element={<ProductDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /Không thể tải thông tin sản phẩm/,
      );
    });
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('W4-S15/S16 add-to-cart feedback', () => {
  beforeEach(() => {
    mocks.isAuthenticated = true;
  });

  it('announces add-to-cart success politely without any alert', async () => {
    await renderDetail();

    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào giỏ hàng' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Đã thêm iPhone 14 vào giỏ hàng.',
      );
    });
    expect(
      screen.getByRole('button', { name: /Đã thêm vào giỏ hàng/ }),
    ).toBeInTheDocument();
    expect(mocks.cart.addItem).toHaveBeenCalledWith('p1', 1, 'default');
    // Success must not also raise an alert (no duplicate channels).
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('announces add-to-cart failure once through role="alert"', async () => {
    mocks.cart.addItem.mockRejectedValue({
      response: { data: { message: 'Chỉ còn 2 sản phẩm trong kho' } },
    });
    await renderDetail();

    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào giỏ hàng' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Chỉ còn 2 sản phẩm trong kho',
      );
    });
    // The failure is not repeated in the polite success region.
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });
});

describe('W4-S03 product list refetch busy state', () => {
  it('marks results busy and announces while refetching over existing results', async () => {
    mocks.getAllProducts.mockResolvedValueOnce(makeListResponse());
    const { container } = renderList();
    await screen.findByText('iPhone 14');
    expect(screen.queryByText('Đang cập nhật kết quả...')).toBeNull();

    mocks.getAllProducts.mockReturnValue(new Promise(() => {}));
    fireEvent.change(screen.getByLabelText('Giá tối thiểu'), {
      target: { value: '1000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));

    const busyMessage = await screen.findByText('Đang cập nhật kết quả...');
    expect(busyMessage).toHaveAttribute('role', 'status');
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('stays silent about refetching during the initial load', () => {
    mocks.getAllProducts.mockReturnValue(new Promise(() => {}));
    const { container } = renderList();

    expect(screen.getByText('Đang tải danh sách sản phẩm...')).toHaveAttribute(
      'role',
      'status',
    );
    expect(screen.queryByText('Đang cập nhật kết quả...')).toBeNull();
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });
});

describe('W4-S28/S30/S31 cart feedback states', () => {
  it('announces an in-place cart load failure with role="alert"', () => {
    mocks.cart.error = 'Không thể tải giỏ hàng';
    renderCart();

    expect(screen.getByText('Không thể tải giỏ hàng')).toHaveAttribute(
      'role',
      'alert',
    );
    // A load failure is only surfaced through the alert, not the polite region.
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('announces the first-load spinner politely', () => {
    mocks.cart.isLoading = true;
    mocks.cart.items = [];
    renderCart();

    const statuses = screen.getAllByRole('status');
    expect(
      statuses.some((status) =>
        status.textContent?.includes('Đang tải giỏ hàng...'),
      ),
    ).toBe(true);
  });

  it('announces the checkout login gate through the polite region', () => {
    renderCart();

    fireEvent.click(screen.getByRole('button', { name: 'Thanh toán' }));

    expect(screen.getByRole('status')).toHaveTextContent(
      'Vui lòng đăng nhập để thanh toán',
    );
    // The visible Vietnamese notice box is preserved alongside the announcement.
    expect(
      screen.getAllByText('Vui lòng đăng nhập để thanh toán').length,
    ).toBeGreaterThan(1);
  });

  it('never announces the same mutation failure twice', async () => {
    mocks.cart.error = 'Số lượng không hợp lệ';
    mocks.cart.updateQuantity.mockRejectedValue(new Error('boom'));
    renderCart();

    expect(screen.getAllByRole('alert')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Tăng số lượng' }));
    await waitFor(() => expect(mocks.cart.updateQuantity).toHaveBeenCalled());

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });
});
