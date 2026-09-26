import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminProductPage } from '@/features/admin/pages/AdminProductPage';
import { AdminPromotionPage } from '@/features/admin/pages/AdminPromotionPage';
import { ComplaintDetailDialog } from '@/features/complaints/components/ComplaintDetailDialog';
import CartSummary from '@/features/cart/components/CartSummary';
import type { Product } from '@/types/product.type';
import type { Promotion } from '@/types/promotion.type';
import type { Complaint } from '@/types/complaint.type';

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

const mockGetPromotions = vi.fn();
const mockCreatePromotion = vi.fn();
const mockUpdatePromotion = vi.fn();
const mockDeletePromotion = vi.fn();
const mockToggleStatus = vi.fn();

vi.mock('@/services/promotion.service', () => ({
  promotionService: {
    getPromotions: (...args: unknown[]) => mockGetPromotions(...args),
    createPromotion: (...args: unknown[]) => mockCreatePromotion(...args),
    updatePromotion: (...args: unknown[]) => mockUpdatePromotion(...args),
    deletePromotion: (...args: unknown[]) => mockDeletePromotion(...args),
    toggleStatus: (...args: unknown[]) => mockToggleStatus(...args),
  },
}));

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    _id: 'p1',
    name: 'iPhone 14',
    brand: 'apple',
    price: 16000000,
    description: 'Mô tả sản phẩm',
    inStock: 10,
    colors: ['Đen'],
    tags: ['flagship'],
    image: 'https://example.com/old.jpg',
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function productListResponse() {
  return {
    success: true,
    message: 'ok',
    data: {
      products: [makeProduct()],
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
  };
}

function makePromotion(): Promotion {
  return {
    _id: 'pr1',
    code: 'GIAM10',
    discountType: 'percentage',
    discountValue: 10,
    minOrderValue: 0,
    usageLimit: 100,
    usedCount: 0,
    startDate: '2024-01-01T00:00:00.000Z',
    endDate: '2030-01-01T00:00:00.000Z',
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

const complaint = {
  _id: 'c1',
  id: 'c1',
  subject: 'Sản phẩm lỗi',
  status: 'open',
  priority: 'medium',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
} as unknown as Complaint;

describe('Dialog mutation failures stay inside the dialog (H03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllProducts.mockResolvedValue(productListResponse());
    mockCreateProduct.mockResolvedValue({ success: true, data: makeProduct() });
    mockGetPromotions.mockResolvedValue({
      success: true,
      data: [makePromotion()],
      pagination: { total: 1, page: 1, limit: 12, totalPages: 1 },
    });
  });

  it('AdminProductPage: create failure is reported inside the open dialog', async () => {
    mockCreateProduct.mockRejectedValue(new Error('server error'));
    render(<AdminProductPage />);

    await waitFor(() => expect(mockGetAllProducts).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /Thêm sản phẩm/ }));
    fireEvent.change(screen.getByLabelText(/Tên sản phẩm/), {
      target: { value: 'iPhone 14' },
    });
    fireEvent.change(screen.getByLabelText(/Thương hiệu/), {
      target: { value: 'apple' },
    });
    fireEvent.change(screen.getByLabelText(/Giá/), {
      target: { value: '16000000' },
    });
    fireEvent.change(screen.getByLabelText(/Mô tả/), {
      target: { value: 'Mô tả sản phẩm' },
    });
    const form = document.querySelector('form') as HTMLFormElement;
    fireEvent.click(within(form).getByRole('button', { name: 'Thêm sản phẩm' }));

    const message = await screen.findByText('Không thể thêm sản phẩm');
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toContainElement(message);
    // Form stays open for retry
    expect(screen.getByLabelText(/Tên sản phẩm/)).toBeInTheDocument();
  });

  it('AdminPromotionPage: delete failure is reported inside the open delete dialog', async () => {
    mockDeletePromotion.mockRejectedValue(new Error('server error'));
    render(<AdminPromotionPage />);

    const deleteButton = await screen.findByRole('button', { name: 'Xóa' });
    fireEvent.click(deleteButton);

    const dialog = await screen.findByRole('dialog');
    const confirmButton = within(dialog).getByRole('button', { name: 'Xóa' });
    fireEvent.click(confirmButton);

    const message = await screen.findByText('Không thể xóa mã khuyến mãi');
    expect(screen.getByRole('dialog')).toContainElement(message);
    // Dialog stays open because the mutation failed
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(mockDeletePromotion).toHaveBeenCalledWith('pr1');
  });

  it('CartSummary: clear-cart failure keeps the confirmation dialog open with an error', async () => {
    render(
      <CartSummary
        totalItems={2}
        totalPrice={2000000}
        onClearCart={() => Promise.reject(new Error('cart service down'))}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Xóa tất cả/ }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xóa tất cả' }));

    const message = await screen.findByText(/Không thể xóa giỏ hàng/);
    expect(screen.getByRole('dialog')).toContainElement(message);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('ComplaintDetailDialog: renders the save error above the dialog footer', () => {
    render(
      <ComplaintDetailDialog
        complaint={complaint}
        isOpen={true}
        onClose={() => {}}
        onUpdateStatus={() => {}}
        onUpdateNotes={() => {}}
        saveError="Không thể cập nhật khiếu nại"
      />
    );

    const dialog = screen.getByRole('dialog');
    const message = within(dialog).getByText('Không thể cập nhật khiếu nại');
    expect(message).toBeInTheDocument();
    // Retry stays possible after a failed save
    expect(
      within(dialog).getByRole('button', { name: 'Save Changes' })
    ).toBeEnabled();
  });
});
