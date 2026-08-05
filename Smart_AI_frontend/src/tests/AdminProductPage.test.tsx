import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminProductPage } from '@/features/admin/pages/AdminProductPage';
import type { Product, ProductFormPayload } from '@/types/product.type';

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

function mockListResponse() {
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

async function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText(/Tên sản phẩm/), { target: { value: 'iPhone 14' } });
  fireEvent.change(screen.getByLabelText(/Thương hiệu/), { target: { value: 'apple' } });
  fireEvent.change(screen.getByLabelText(/Giá/), { target: { value: '16000000' } });
  fireEvent.change(screen.getByLabelText(/Mô tả/), { target: { value: 'Mô tả sản phẩm' } });
}

function getForm() {
  return document.querySelector('form') as HTMLFormElement;
}

function clickFormSubmit(name: string | RegExp) {
  const form = getForm();
  fireEvent.click(within(form).getByRole('button', { name }));
}

describe('AdminProductPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllProducts.mockResolvedValue(mockListResponse());
    mockCreateProduct.mockResolvedValue({ success: true, message: 'ok', data: makeProduct() });
    mockUpdateProduct.mockResolvedValue({ success: true, message: 'ok', data: makeProduct() });
  });

  it('keeps the form open and displays an error on API failure', async () => {
    mockCreateProduct.mockRejectedValue(new Error('fail'));
    render(<AdminProductPage />);

    await waitFor(() => expect(mockGetAllProducts).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /Thêm sản phẩm/ }));
    await fillRequiredFields();
    clickFormSubmit('Thêm sản phẩm');

    expect(await screen.findByText(/Không thể thêm sản phẩm/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Tên sản phẩm/)).toBeInTheDocument();
  });

  it('disables the submit button while the request is pending', async () => {
    let resolveRequest: (value: unknown) => void = () => {};
    mockCreateProduct.mockImplementation(() => new Promise((resolve) => {
      resolveRequest = resolve;
    }));

    render(<AdminProductPage />);
    await waitFor(() => expect(mockGetAllProducts).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /Thêm sản phẩm/ }));
    await fillRequiredFields();

    const submit = within(getForm()).getByRole('button', { name: 'Thêm sản phẩm' });
    fireEvent.click(submit);

    const pendingButton = await screen.findByRole('button', { name: /Đang xử lý/ });
    expect(pendingButton).toBeDisabled();

    resolveRequest({ success: true, message: 'ok', data: makeProduct() });
    await waitFor(() => expect(mockCreateProduct).toHaveBeenCalled());
  });

  it('resets the form and refreshes the list after successful submit', async () => {
    render(<AdminProductPage />);

    await waitFor(() => expect(mockGetAllProducts).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: /Thêm sản phẩm/ }));
    await fillRequiredFields();
    clickFormSubmit('Thêm sản phẩm');

    await waitFor(() => expect(mockCreateProduct).toHaveBeenCalled());
    expect(await screen.findByText(/Thêm sản phẩm thành công/)).toBeInTheDocument();
    await waitFor(() => expect(mockGetAllProducts).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      expect(screen.queryByLabelText(/Tên sản phẩm/)).not.toBeInTheDocument();
    });
  });

  it('submits a multipart payload with a selected file on create', async () => {
    render(<AdminProductPage />);
    await waitFor(() => expect(mockGetAllProducts).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /Thêm sản phẩm/ }));
    await fillRequiredFields();

    const file = new File([new ArrayBuffer(1024)], 'photo.jpg', { type: 'image/jpeg' });
    const input = screen.getByLabelText('Chọn ảnh từ thiết bị') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    clickFormSubmit('Thêm sản phẩm');

    await waitFor(() => expect(mockCreateProduct).toHaveBeenCalled());
    const [payload, config] = mockCreateProduct.mock.calls[0] as [ProductFormPayload, unknown];
    expect(payload.imageFile).toBe(file);
    expect(config).toBeTruthy();
  });

  it('keeps the edit form open on update failure', async () => {
    mockUpdateProduct.mockRejectedValue(new Error('fail'));
    render(<AdminProductPage />);
    await waitFor(() => expect(mockGetAllProducts).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /Sửa iPhone 14/ }));

    clickFormSubmit('Lưu thay đổi');

    expect(await screen.findByText(/Không thể cập nhật sản phẩm/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Tên sản phẩm/)).toBeInTheDocument();
  });

  it('submits the same payload shape regardless of image source mode', async () => {
    render(<AdminProductPage />);
    await waitFor(() => expect(mockGetAllProducts).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /Thêm sản phẩm/ }));
    await fillRequiredFields();

    fireEvent.click(screen.getByLabelText(/Nhập URL hình ảnh/));
    fireEvent.change(screen.getByLabelText('URL hình ảnh'), {
      target: { value: 'https://example.com/img.jpg' },
    });

    clickFormSubmit('Thêm sản phẩm');

    await waitFor(() => expect(mockCreateProduct).toHaveBeenCalled());
    const [payload] = mockCreateProduct.mock.calls[0] as [ProductFormPayload];
    expect(payload.imageFile).toBeNull();
    expect(payload.imageUrl).toBe('https://example.com/img.jpg');
  });
});
