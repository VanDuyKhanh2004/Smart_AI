import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import WishlistPage from '@/features/wishlist/pages/WishlistPage';
import WishlistButton from '@/components/ui/WishlistButton';
import CompareButton from '@/components/ui/CompareButton';
import CompareBar from '@/components/CompareBar';
import ComparePage from '@/features/compare/pages/ComparePage';
import CompareHistoryPage from '@/features/compare/pages/CompareHistoryPage';
import UserActions from '@/components/layout/UserActions';
import { useWishlistStore } from '@/stores/wishlistStore';
import { useCompareStore } from '@/stores/compareStore';
import type { Product } from '@/types/product.type';
import type { WishlistItem, WishlistProduct } from '@/types/wishlist.type';
import type { CompareHistory } from '@/types/compare.type';

const mocks = vi.hoisted(() => {
  const cartState = {
    items: [] as Array<{ quantity: number }>,
    isLoading: false,
    error: null as string | null,
    addItem: vi.fn(),
  };
  const useCartStore = Object.assign(
    (selector?: (state: typeof cartState) => unknown) =>
      selector ? selector(cartState) : cartState,
    { getState: () => cartState },
  );
  return {
    cartState,
    useCartStore,
    isAuthenticated: false,
    getWishlist: vi.fn(),
    addToWishlist: vi.fn(),
    removeFromWishlist: vi.fn(),
    checkMultipleWishlistStatus: vi.fn(),
    clearWishlist: vi.fn(),
    getCompareProducts: vi.fn(),
    saveToHistory: vi.fn(),
    getHistory: vi.fn(),
    deleteFromHistory: vi.fn(),
  };
});

vi.mock('@/stores/cartStore', () => ({ useCartStore: mocks.useCartStore }));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ isAuthenticated: mocks.isAuthenticated }),
}));

vi.mock('@/services/wishlist.service', () => ({
  wishlistService: {
    getWishlist: mocks.getWishlist,
    addToWishlist: mocks.addToWishlist,
    removeFromWishlist: mocks.removeFromWishlist,
    checkMultipleWishlistStatus: mocks.checkMultipleWishlistStatus,
    clearWishlist: mocks.clearWishlist,
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

vi.mock('@/components/ui/StarRating', () => ({
  StarRating: () => <div data-testid="star-rating" />,
}));

vi.mock('@/components/layout/UserDropdown', () => ({
  __esModule: true,
  default: () => <div data-testid="mock-user-dropdown" />,
}));

vi.mock('@/components/layout/MiniCartPreview', () => ({
  __esModule: true,
  default: () => <div data-testid="mock-mini-cart" />,
}));

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    _id: 'p1',
    name: 'iPhone 14',
    brand: 'apple',
    price: 16000000,
    description: 'Mô tả sản phẩm',
    inStock: 5,
    colors: ['Đen', 'Trắng'],
    tags: [],
    image: 'https://example.com/phone.jpg',
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// 8 attributes carry values across the pair; 5 of them differ; three numeric
// rows produce best-value cells (weight has a value on one side only, so it
// renders "-" without a best marker).
const compareProductA = makeProduct({
  _id: 'p1',
  name: 'iPhone 14',
  specs: {
    screen: { size: '6.1 inch', resolution: '2532 x 1170', technology: 'OLED' },
    memory: { ram: '6 GB', storage: '128 GB' },
    battery: { capacity: '3200 mAh' },
    os: 'iOS 17',
    weight: '174 g',
  },
});

const compareProductB = makeProduct({
  _id: 'p2',
  name: 'iPhone 15',
  specs: {
    screen: { size: '6.7 inch', resolution: '2532 x 1170', technology: 'OLED' },
    memory: { ram: '8 GB', storage: '256 GB' },
    battery: { capacity: '4500 mAh' },
    os: 'iOS 17',
  },
});

function makeWishlistItem(overrides: Partial<WishlistItem> = {}): WishlistItem {
  return {
    _id: 'w1',
    addedAt: '2024-03-01T00:00:00.000Z',
    product: {
      _id: 'p1',
      name: 'iPhone 14',
      brand: 'apple',
      price: 16000000,
      image: 'https://example.com/phone.jpg',
      inStock: 5,
      isActive: true,
      colors: ['Đen', 'Trắng'],
    },
    ...overrides,
  };
}

const historyEntry: CompareHistory = {
  _id: 'h1',
  products: [compareProductA, compareProductB],
  createdAt: '2024-05-01T10:00:00.000Z',
  updatedAt: '2024-05-01T10:00:00.000Z',
};

beforeAll(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
    writable: true,
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.isAuthenticated = false;
  mocks.cartState.items = [];
  mocks.cartState.isLoading = false;
  mocks.cartState.error = null;
  mocks.cartState.addItem.mockResolvedValue(undefined);
  mocks.getWishlist.mockResolvedValue({ success: true, message: 'ok', data: { items: [] } });
  mocks.addToWishlist.mockResolvedValue({ success: true, message: 'ok', data: { items: [] } });
  mocks.removeFromWishlist.mockResolvedValue({ success: true, message: 'ok', data: { items: [] } });
  mocks.checkMultipleWishlistStatus.mockResolvedValue({ success: true, data: {} });
  mocks.clearWishlist.mockResolvedValue({ success: true, message: 'ok', data: {} });
  mocks.getCompareProducts.mockResolvedValue({
    success: true,
    message: 'ok',
    data: [compareProductA, compareProductB],
  });
  mocks.saveToHistory.mockResolvedValue({ success: true, message: 'ok', data: {} });
  mocks.getHistory.mockResolvedValue({ success: true, message: 'ok', data: [] });
  mocks.deleteFromHistory.mockResolvedValue({ success: true, message: 'ok', data: {} });
  vi.mocked(navigator.clipboard.writeText).mockResolvedValue(undefined);
  useWishlistStore.setState({ items: [], wishlistMap: {}, isLoading: false, error: null });
  useCompareStore.setState({ items: [] });
});

function renderWishlistPage() {
  return render(
    <MemoryRouter>
      <WishlistPage />
    </MemoryRouter>,
  );
}

function renderCompareBar() {
  return render(
    <MemoryRouter>
      <CompareBar />
    </MemoryRouter>,
  );
}

function renderComparePage(initialPath = '/compare?products=p1,p2') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ComparePage />
    </MemoryRouter>,
  );
}

function renderHistoryPage() {
  return render(
    <MemoryRouter>
      <CompareHistoryPage />
    </MemoryRouter>,
  );
}

describe('W4-S45/S46/S47/S48/S50 wishlist page feedback', () => {
  it('names the icon-only remove button with the product name (S45) and skips fetching while logged out', () => {
    useWishlistStore.setState({ items: [makeWishlistItem()] });
    renderWishlistPage();

    expect(
      screen.getByRole('button', { name: 'Xóa iPhone 14 khỏi danh sách yêu thích' }),
    ).toBeInTheDocument();
    expect(mocks.getWishlist).not.toHaveBeenCalled();
  });

  it('gives the deleted-product remove button a stable fallback name (S46)', () => {
    useWishlistStore.setState({
      items: [makeWishlistItem({ _id: 'w2', product: 'p999' as unknown as WishlistProduct })],
    });
    renderWishlistPage();

    expect(
      screen.getByRole('button', { name: 'Xóa khỏi danh sách yêu thích' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Sản phẩm đã bị xóa')).toBeInTheDocument();
  });

  it('announces successful removal politely without any alert (S47)', async () => {
    useWishlistStore.setState({ items: [makeWishlistItem()] });
    renderWishlistPage();

    fireEvent.click(
      screen.getByRole('button', { name: 'Xóa iPhone 14 khỏi danh sách yêu thích' }),
    );

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Đã xóa iPhone 14 khỏi danh sách yêu thích.',
      );
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('announces move-to-cart success politely without any alert (S47)', async () => {
    useWishlistStore.setState({ items: [makeWishlistItem()] });
    renderWishlistPage();

    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào giỏ hàng' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Đã thêm iPhone 14 vào giỏ hàng.',
      );
    });
    expect(mocks.cartState.addItem).toHaveBeenCalledWith('p1', 1, 'Đen');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('surfaces a removal failure exactly once through role="alert" (S50)', async () => {
    mocks.removeFromWishlist.mockRejectedValue({
      response: { data: { message: 'Không thể xóa sản phẩm' } },
    });
    useWishlistStore.setState({ items: [makeWishlistItem()] });
    renderWishlistPage();

    fireEvent.click(
      screen.getByRole('button', { name: 'Xóa iPhone 14 khỏi danh sách yêu thích' }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Không thể xóa sản phẩm');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('names the color selector trigger (S48)', () => {
    useWishlistStore.setState({ items: [makeWishlistItem()] });
    const { container } = renderWishlistPage();

    expect(container.querySelector('[aria-label="Chọn màu"]')).not.toBeNull();
  });

  it('announces the first-load spinner politely (S50)', () => {
    useWishlistStore.setState({ isLoading: true, items: [] });
    renderWishlistPage();

    const statuses = screen.getAllByRole('status');
    expect(
      statuses.some((status) =>
        status.textContent?.includes('Đang tải danh sách yêu thích...'),
      ),
    ).toBe(true);
  });
});

describe('W4-U07/U08/U09 toggle controls and badge', () => {
  it('exposes a pressed wishlist toggle with a stable name and AA active color', async () => {
    mocks.isAuthenticated = true;
    mocks.addToWishlist.mockResolvedValue({
      success: true,
      message: 'ok',
      data: {
        items: [
          {
            _id: 'w1',
            product: { _id: 'p1', name: 'iPhone 14' },
            addedAt: '2024-03-01T00:00:00.000Z',
          },
        ],
      },
    });
    render(
      <MemoryRouter>
        <WishlistButton productId="p1" />
      </MemoryRouter>,
    );

    const btn = screen.getByRole('button', { name: 'Yêu thích' });
    expect(btn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(btn);

    await waitFor(() => expect(btn).toHaveAttribute('aria-pressed', 'true'));
    expect(btn).toHaveAttribute('aria-label', 'Yêu thích');
    expect(btn.className).toContain('text-red-600');
    expect(btn.className).not.toContain('text-red-500');
  });

  it('marks a pending wishlist toggle busy instead of disabling it', async () => {
    mocks.isAuthenticated = true;
    mocks.addToWishlist.mockReturnValue(new Promise(() => {}));
    render(
      <MemoryRouter>
        <WishlistButton productId="p1" />
      </MemoryRouter>,
    );

    const btn = screen.getByRole('button', { name: 'Yêu thích' });
    fireEvent.click(btn);

    await waitFor(() => expect(btn).toHaveAttribute('aria-busy', 'true'));
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveAttribute('aria-pressed', 'false');
  });

  it('lets visible text carry the wishlist name when showText is set', () => {
    mocks.isAuthenticated = true;
    useWishlistStore.setState({ wishlistMap: { p1: true } });
    render(
      <MemoryRouter>
        <WishlistButton productId="p1" showText />
      </MemoryRouter>,
    );

    const btn = screen.getByRole('button', { name: 'Đã yêu thích' });
    expect(btn).not.toHaveAttribute('aria-label');
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  it('exposes a pressed compare toggle with a stable name and AA active color', () => {
    render(
      <MemoryRouter>
        <CompareButton productId="p1" />
      </MemoryRouter>,
    );

    const btn = screen.getByRole('button', { name: 'So sánh' });
    expect(btn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(btn);

    expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(btn).toHaveAttribute('aria-label', 'So sánh');
    expect(btn.className).toContain('text-blue-600');
    expect(btn.className).not.toContain('text-blue-500');
    expect(btn).toHaveAttribute('title', 'Xóa khỏi so sánh');
  });

  it('keeps the full comparison list control disabled with an explanatory tooltip', () => {
    useCompareStore.setState({ items: ['c1', 'c2', 'c3', 'c4'] });
    render(
      <MemoryRouter>
        <CompareButton productId="c5" />
      </MemoryRouter>,
    );

    const btn = screen.getByRole('button', { name: 'So sánh' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', 'Chỉ có thể so sánh tối đa 4 sản phẩm');
  });

  it('paints the header wishlist badge with the AA red (U07)', () => {
    useWishlistStore.setState({
      items: [makeWishlistItem(), makeWishlistItem({ _id: 'w2' }), makeWishlistItem({ _id: 'w3' })],
    });
    const { container } = render(
      <MemoryRouter>
        <UserActions isAuthenticated={true} isLoading={false} />
      </MemoryRouter>,
    );

    expect(container.querySelector('.bg-red-600')).not.toBeNull();
    expect(container.querySelector('.bg-red-500')).toBeNull();
    expect(screen.getByText('Yêu thích (3 sản phẩm)')).toBeInTheDocument();
  });
});

describe('W4-S52/S53/S62/S63 compare bar', () => {
  it('announces list changes politely and keeps the region after the bar hides (S52)', async () => {
    useCompareStore.setState({ items: ['p1', 'p2'] });
    renderCompareBar();

    expect(screen.getByRole('status')).toHaveTextContent('Danh sách so sánh: 2/4 sản phẩm');

    const removeBtn = await screen.findByRole('button', {
      name: 'Xóa iPhone 14 khỏi so sánh',
    });
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Đã xóa iPhone 14 khỏi danh sách so sánh. 1/4 sản phẩm',
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Xóa tất cả' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Đã xóa tất cả sản phẩm khỏi danh sách so sánh.',
      );
    });
    expect(document.querySelector('.fixed.bottom-0')).toBeNull();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('announces additions with the new count (S52)', async () => {
    useCompareStore.setState({ items: ['p1'] });
    renderCompareBar();
    await screen.findByRole('button', { name: 'Xóa iPhone 14 khỏi so sánh' });

    act(() => {
      useCompareStore.getState().addToCompare('p2');
    });

    expect(screen.getByRole('status')).toHaveTextContent(
      'Đã thêm vào danh sách so sánh. 2/4 sản phẩm',
    );
  });

  it('keeps the bar hidden on an empty list while the region stays mounted (S52)', () => {
    renderCompareBar();

    expect(document.querySelector('.fixed.bottom-0')).toBeNull();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(mocks.getCompareProducts).not.toHaveBeenCalled();
  });

  it('marks the thumbnails region busy while product names load (S52)', async () => {
    useCompareStore.setState({ items: ['p1'] });
    mocks.getCompareProducts.mockReturnValue(new Promise(() => {}));
    const { container } = renderCompareBar();

    await waitFor(() => {
      expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    });
  });

  it('uses AA colors for the clear-all action and empty slots (S62/S63)', async () => {
    useCompareStore.setState({ items: ['p1'] });
    const { container } = renderCompareBar();

    const clearBtn = await screen.findByRole('button', { name: 'Xóa tất cả' });
    expect(clearBtn.className).toContain('text-red-600');
    expect(clearBtn.className).not.toContain('text-red-500');

    const slots = Array.from(container.querySelectorAll('span')).filter(
      (span) => span.textContent === '+',
    );
    expect(slots).toHaveLength(3);
    slots.forEach((slot) => {
      expect(slot.className).toContain('text-gray-500');
      expect(slot.className).not.toContain('text-gray-400');
    });
  });
});

describe('W4-S54/S55/S56/S57 compare page feedback', () => {
  it('announces a successful link copy politely (S54)', async () => {
    renderComparePage();
    await screen.findByRole('heading', { name: 'iPhone 14' });

    fireEvent.click(screen.getByRole('button', { name: /Chia sẻ/ }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Đã sao chép link so sánh.');
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('/compare?products=p1,p2'),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('announces a link copy failure once through role="alert" (S54)', async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('denied'));
    renderComparePage();
    await screen.findByRole('heading', { name: 'iPhone 14' });

    fireEvent.click(screen.getByRole('button', { name: /Chia sẻ/ }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Không thể sao chép link so sánh.');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('announces the filtered row counts (S55)', async () => {
    renderComparePage();
    await screen.findByRole('heading', { name: 'iPhone 14' });
    const checkbox = screen.getByRole('checkbox', { name: 'Chỉ hiện khác biệt' });

    fireEvent.click(checkbox);
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Đã lọc: 5 thông số khác biệt được hiển thị.',
      );
    });

    fireEvent.click(checkbox);
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Đã hiển thị toàn bộ 8 thông số.',
      );
    });
  });

  it('announces add-to-cart success politely (S56)', async () => {
    mocks.isAuthenticated = true;
    renderComparePage();
    await screen.findByRole('heading', { name: 'iPhone 14' });

    fireEvent.click(screen.getAllByRole('button', { name: 'Thêm vào giỏ' })[0]);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Đã thêm iPhone 14 vào giỏ hàng.',
      );
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('announces an add-to-cart failure once through role="alert" (S56)', async () => {
    mocks.isAuthenticated = true;
    mocks.cartState.addItem.mockRejectedValueOnce(new Error('out of stock'));
    renderComparePage();
    await screen.findByRole('heading', { name: 'iPhone 14' });

    fireEvent.click(screen.getAllByRole('button', { name: 'Thêm vào giỏ' })[0]);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Không thể thêm iPhone 14 vào giỏ hàng.');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('announces a load failure through role="alert" with AA error text (S57)', async () => {
    mocks.getCompareProducts.mockRejectedValue(new Error('network'));
    renderComparePage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Không thể tải thông tin sản phẩm. Vui lòng thử lại sau.');
    expect(alert.querySelector('p')).toHaveClass('text-red-600');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('keeps the polite region mounted while the page loads (S57)', () => {
    mocks.getCompareProducts.mockReturnValue(new Promise(() => {}));
    renderComparePage();

    expect(screen.getByText('Đang tải so sánh sản phẩm...')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('gives the comparison table a caption, column scopes, named region and best markers (S60/S61/U01)', async () => {
    renderComparePage();
    await screen.findByRole('heading', { name: 'iPhone 14' });

    const table = screen.getByRole('table');
    expect(within(table).getByText('So sánh thông số kỹ thuật')).toBeInTheDocument();

    const headers = within(table).getAllByRole('columnheader');
    const productHeaders = headers.filter((header) => header.textContent !== 'Thông số');
    expect(productHeaders).toHaveLength(2);
    productHeaders.forEach((header) => expect(header).toHaveAttribute('scope', 'col'));

    expect(
      screen.getByRole('region', { name: 'Bảng so sánh thông số' }),
    ).toBeInTheDocument();

    expect(screen.getAllByText('(tốt nhất)')).toHaveLength(3);
  });

  it('renders missing values with the AA gray (S63)', async () => {
    renderComparePage();
    await screen.findByRole('heading', { name: 'iPhone 14' });

    const missingCell = screen.getByText('-').closest('td');
    expect(missingCell).not.toBeNull();
    expect(missingCell).toHaveClass('text-gray-500');
    expect(missingCell).not.toHaveClass('text-gray-400');
  });
});

describe('W4-S58/S59 compare history feedback', () => {
  beforeEach(() => {
    mocks.isAuthenticated = true;
    mocks.getHistory.mockResolvedValue({
      success: true,
      message: 'ok',
      data: [historyEntry],
    });
  });

  it('uniquely names the delete control with the entry timestamp (S59)', async () => {
    renderHistoryPage();
    await screen.findByText('iPhone 14');

    const btn = screen.getByRole('button', { name: /^Xóa lịch sử so sánh lúc/ });
    expect(btn).not.toBeDisabled();
    expect(btn.getAttribute('aria-label')).toContain('01/05/2024');
  });

  it('announces a successful deletion politely without any alert (S59)', async () => {
    renderHistoryPage();
    await screen.findByText('iPhone 14');

    fireEvent.click(
      screen.getByRole('button', { name: /^Xóa lịch sử so sánh lúc/ }),
    );

    await waitFor(() => {
      expect(screen.getByText('Chưa có lịch sử so sánh')).toBeInTheDocument();
    });
    const status = screen.getByRole('status');
    expect(status.textContent).toMatch(/^Đã xóa lịch sử so sánh lúc/);
    expect(status.textContent).toContain('01/05/2024');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('marks a pending delete busy instead of disabling it (S58)', async () => {
    let resolveDelete!: (value: unknown) => void;
    mocks.deleteFromHistory.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDelete = resolve;
        }),
    );
    renderHistoryPage();
    await screen.findByText('iPhone 14');

    const btn = screen.getByRole('button', { name: /^Xóa lịch sử so sánh lúc/ });
    fireEvent.click(btn);

    await waitFor(() => expect(btn).toHaveAttribute('aria-busy', 'true'));
    expect(btn).not.toBeDisabled();

    await act(async () => {
      resolveDelete({ success: true, message: 'ok', data: {} });
    });
    await waitFor(() => {
      expect(screen.getByText('Chưa có lịch sử so sánh')).toBeInTheDocument();
    });
  });

  it('surfaces a delete failure exactly once through role="alert" (S59)', async () => {
    mocks.deleteFromHistory.mockResolvedValue({ success: false, message: 'fail', data: null });
    renderHistoryPage();
    await screen.findByText('iPhone 14');

    fireEvent.click(
      screen.getByRole('button', { name: /^Xóa lịch sử so sánh lúc/ }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Không thể xóa lịch sử so sánh');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('announces a history load failure through role="alert" (S59)', async () => {
    mocks.getHistory.mockRejectedValue(new Error('network'));
    renderHistoryPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Không thể tải lịch sử so sánh. Vui lòng thử lại sau.');
  });
});
