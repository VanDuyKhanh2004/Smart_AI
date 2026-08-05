import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProductListPage from '@/features/products/pages/ProductListPage';
import type { Product } from '@/types/product.type';

const mockGetAllProducts = vi.fn();
const mockGetProductMeta = vi.fn();
vi.mock('@/services/product.service', () => ({
  productService: {
    getAllProducts: (...args: unknown[]) => mockGetAllProducts(...args),
    getProductMeta: (...args: unknown[]) => mockGetProductMeta(...args),
  },
}));

const mockCheckMultipleStatus = vi.fn();
const hoisted = vi.hoisted(() => ({ isAuthenticated: false }));
vi.mock('@/stores/wishlistStore', () => ({
  useWishlistStore: () => ({
    checkMultipleStatus: (...args: unknown[]) => mockCheckMultipleStatus(...args),
  }),
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ isAuthenticated: hoisted.isAuthenticated }),
}));

vi.mock('@/components/ui/CompareButton', () => ({
  __esModule: true,
  default: () => <button data-testid="compare-button">Compare</button>,
}));

vi.mock('@/components/ui/WishlistButton', () => ({
  __esModule: true,
  default: () => <button data-testid="wishlist-button">Wishlist</button>,
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
    CarouselNext: () => <button>Next</button>,
    CarouselPrevious: () => <button>Prev</button>,
  };
});

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    _id: 'p1',
    name: 'iPhone 14',
    brand: 'apple',
    price: 16000000,
    description: 'Mô tả sản phẩm',
    inStock: 10,
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

function typeSearch(text: string) {
  fireEvent.change(screen.getByPlaceholderText('Tìm kiếm sản phẩm...'), {
    target: { value: text },
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ProductListPage />
    </MemoryRouter>,
  );
}

describe('ProductListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.isAuthenticated = false;
    mockGetProductMeta.mockResolvedValue({ brands: ['apple', 'samsung'] });
    mockGetAllProducts.mockResolvedValue(makeListResponse());
  });

  it('fetches brands from the lightweight metadata endpoint on mount', async () => {
    renderPage();

    await waitFor(() => {
      expect(mockGetProductMeta).toHaveBeenCalledTimes(1);
    });
    expect(mockGetProductMeta).toHaveBeenCalledWith(
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('does not call getAllProducts with limit=1000 to extract brands', async () => {
    renderPage();

    await waitFor(() => {
      expect(mockGetAllProducts).toHaveBeenCalled();
    });

    const calls = mockGetAllProducts.mock.calls.map((c) => c[0] as Record<string, unknown>);
    expect(calls.some((params) => params.limit === 1000)).toBe(false);
  });

  it('continues to load products while the metadata request is pending', async () => {
    mockGetProductMeta.mockReturnValue(new Promise(() => {}));

    renderPage();

    await waitFor(() => {
      expect(mockGetAllProducts).toHaveBeenCalled();
    });
  });

  it('does not surface an error when the metadata request fails', async () => {
    mockGetProductMeta.mockRejectedValue(new Error('meta down'));

    renderPage();

    await waitFor(() => {
      expect(mockGetAllProducts).toHaveBeenCalled();
    });

    expect(screen.queryByText(/Không thể tải danh sách sản phẩm/)).toBeNull();
  });

  it('aborts the metadata request on unmount', async () => {
    let capturedSignal: AbortSignal | undefined;
    mockGetProductMeta.mockImplementation((options: { signal?: AbortSignal }) => {
      capturedSignal = options.signal;
      return Promise.resolve({ brands: [] });
    });

    const { unmount } = renderPage();
    await waitFor(() => {
      expect(capturedSignal).toBeDefined();
    });

    unmount();

    expect(capturedSignal!.aborted).toBe(true);
  });

  it('aborts the in-flight product list request when a new list fetch starts', async () => {
    const signals: AbortSignal[] = [];
    mockGetAllProducts.mockImplementation((_params, config: { signal?: AbortSignal }) => {
      signals.push(config.signal!);
      return new Promise(() => {});
    });

    renderPage();

    await waitFor(() => {
      expect(signals.length).toBe(1);
    });
    expect(signals[0].aborted).toBe(false);

    // Search change (debounced 300ms) triggers a refetch that aborts the stale request.
    typeSearch('iphone');

    await waitFor(() => {
      expect(signals.length).toBe(2);
    });

    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });

  it('cancelled product requests do not set an error state', async () => {
    mockGetAllProducts.mockReturnValue(new Promise(() => {}));

    renderPage();

    await waitFor(() => {
      expect(mockGetAllProducts).toHaveBeenCalled();
    });

    expect(screen.queryByText(/Không thể tải danh sách sản phẩm/)).toBeNull();
  });

  it('a cancelled stale request cannot overwrite newer results', async () => {
    const first = deferred<ReturnType<typeof makeListResponse>>();
    const signals: AbortSignal[] = [];
    mockGetAllProducts
      .mockImplementationOnce((_params, config: { signal?: AbortSignal }) => {
        signals.push(config.signal!);
        return first.promise;
      })
      .mockImplementationOnce((_params, config: { signal?: AbortSignal }) => {
        signals.push(config.signal!);
        return Promise.resolve(makeListResponse([makeProduct({ _id: 'p2', name: 'Galaxy S24', brand: 'samsung' })]));
      });

    renderPage();

    // Search change triggers the second (newer) fetch.
    typeSearch('samsung');

    await waitFor(() => {
      expect(signals.length).toBe(2);
    });

    // The newer result renders first.
    await waitFor(() => {
      expect(screen.getByText('Galaxy S24')).toBeInTheDocument();
    });

    // The stale first request resolves afterwards but its signal was aborted,
    // so it must NOT overwrite the newer products.
    act(() => {
      first.resolve(makeListResponse([makeProduct({ _id: 'p1', name: 'iPhone 14' })]));
    });

    await waitFor(() => {
      expect(signals[0].aborted).toBe(true);
    });

    expect(screen.getByText('Galaxy S24')).toBeInTheDocument();
    expect(screen.queryByText('iPhone 14')).toBeNull();
  });

  it('renders products and pagination metadata after the product list loads', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('iPhone 14')).toBeInTheDocument();
    });
    expect(screen.getByText(/1 trong tổng số 1 sản phẩm/)).toBeInTheDocument();
  });

  it('checks wishlist status for rendered products when authenticated', async () => {
    hoisted.isAuthenticated = true;
    mockCheckMultipleStatus.mockResolvedValue(undefined);

    renderPage();

    await waitFor(() => {
      expect(mockCheckMultipleStatus).toHaveBeenCalled();
    });
    expect(mockCheckMultipleStatus).toHaveBeenCalledWith(['p1']);
  });

  it('shows an error message when the product list fetch fails', async () => {
    mockGetAllProducts.mockRejectedValue(new Error('network'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Không thể tải danh sách sản phẩm/)).toBeInTheDocument();
    });
  });
});
