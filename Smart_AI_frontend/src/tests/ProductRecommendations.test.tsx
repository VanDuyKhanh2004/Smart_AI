import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProductRecommendations from '@/features/products/components/ProductRecommendations';

const mockProducts = [
  {
    _id: 'p1',
    name: 'iPhone 14',
    brand: 'apple',
    price: 16000000,
    inStock: 5,
    isActive: true,
    image: 'https://example.com/iphone14.jpg',
    colors: [],
    tags: [],
    description: '',
    createdAt: '',
    updatedAt: '',
  },
  {
    _id: 'p2',
    name: 'iPhone 15 Pro',
    brand: 'apple',
    price: 25000000,
    inStock: 3,
    isActive: true,
    image: '',
    colors: [],
    tags: [],
    description: '',
    createdAt: '',
    updatedAt: '',
  },
];

vi.mock('@/services/product.service', () => ({
  productService: {
    getProductRecommendations: vi.fn(),
  },
}));

import { productService } from '@/services/product.service';

const mockGetRecommendations = productService.getProductRecommendations as ReturnType<typeof vi.fn>;

const renderComponent = (productId: string = 'valid-id') => {
  return render(
    <MemoryRouter>
      <ProductRecommendations productId={productId} />
    </MemoryRouter>
  );
};

describe('ProductRecommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.scrollTo = vi.fn();
  });

  it('renders section title when products are returned', async () => {
    mockGetRecommendations.mockResolvedValue({
      success: true,
      message: 'Success',
      data: { sourceProduct: { _id: 'src', name: 'Source' }, products: mockProducts, recommendationMode: 'vector' },
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Sản phẩm tương tự')).toBeInTheDocument();
    });
  });

  it('renders recommended product names', async () => {
    mockGetRecommendations.mockResolvedValue({
      success: true,
      message: 'Success',
      data: { sourceProduct: { _id: 'src', name: 'Source' }, products: mockProducts, recommendationMode: 'vector' },
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('iPhone 14')).toBeInTheDocument();
      expect(screen.getByText('iPhone 15 Pro')).toBeInTheDocument();
    });
  });

  it('renders formatted prices', async () => {
    mockGetRecommendations.mockResolvedValue({
      success: true,
      message: 'Success',
      data: { sourceProduct: { _id: 'src', name: 'Source' }, products: mockProducts, recommendationMode: 'vector' },
    });

    renderComponent();

    await waitFor(() => {
      const priceElements = screen.getAllByText(/^\d+\.\d+\.\d+\s*₫$/);
      expect(priceElements).toHaveLength(2);
    });
  });

  it('renders brand names', async () => {
    mockGetRecommendations.mockResolvedValue({
      success: true,
      message: 'Success',
      data: { sourceProduct: { _id: 'src', name: 'Source' }, products: mockProducts, recommendationMode: 'vector' },
    });

    renderComponent();

    await waitFor(() => {
      const brandElements = screen.getAllByText('apple');
      expect(brandElements).toHaveLength(2);
    });
  });

  it('renders loading skeletons while fetching', async () => {
    mockGetRecommendations.mockImplementation(() => new Promise(() => {}));

    renderComponent();

    await waitFor(() => {
      const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  it('renders nothing when productId is empty', async () => {
    renderComponent('');
    expect(document.querySelector('section')).not.toBeInTheDocument();
  });

  it('hides section when API returns empty products', async () => {
    mockGetRecommendations.mockResolvedValue({
      success: true,
      message: 'Success',
      data: { sourceProduct: { _id: 'src', name: 'Source' }, products: [], recommendationMode: 'fallback' },
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.queryByText('Sản phẩm tương tự')).not.toBeInTheDocument();
    });
  });

  it('hides section on API failure', async () => {
    mockGetRecommendations.mockRejectedValue(new Error('API Error'));

    renderComponent();

    await waitFor(() => {
      expect(screen.queryByText('Sản phẩm tương tự')).not.toBeInTheDocument();
    });
  });

  it('calls service with correct productId and limit', async () => {
    mockGetRecommendations.mockResolvedValue({
      success: true,
      message: 'Success',
      data: { sourceProduct: { _id: 'src', name: 'Source' }, products: mockProducts, recommendationMode: 'vector' },
    });

    renderComponent('product-123');

    await waitFor(() => {
      expect(mockGetRecommendations).toHaveBeenCalledWith('product-123', 5);
    });
  });

  it('navigates to correct product detail on click', async () => {
    mockGetRecommendations.mockResolvedValue({
      success: true,
      message: 'Success',
      data: { sourceProduct: { _id: 'src', name: 'Source' }, products: mockProducts, recommendationMode: 'vector' },
    });

    renderComponent();

    await waitFor(() => {
      const link = screen.getByText('iPhone 14').closest('a');
      expect(link).toHaveAttribute('href', '/products/p1');
    });
  });

  it('refetches when productId changes', async () => {
    mockGetRecommendations.mockResolvedValue({
      success: true,
      message: 'Success',
      data: { sourceProduct: { _id: 'src', name: 'Source' }, products: [], recommendationMode: 'fallback' },
    });

    const { rerender } = render(
      <MemoryRouter>
        <ProductRecommendations productId="first-id" />
      </MemoryRouter>
    );

    expect(mockGetRecommendations).toHaveBeenCalledWith('first-id', 5);

    rerender(
      <MemoryRouter>
        <ProductRecommendations productId="second-id" />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockGetRecommendations).toHaveBeenCalledWith('second-id', 5);
    });
  });

  it('does not expose score or recommendationMode in the DOM', async () => {
    mockGetRecommendations.mockResolvedValue({
      success: true,
      message: 'Success',
      data: { sourceProduct: { _id: 'src', name: 'Source' }, products: mockProducts, recommendationMode: 'vector' },
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.queryByText(/score/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/vector/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/brand_price/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/fallback/i)).not.toBeInTheDocument();
    });
  });
});
