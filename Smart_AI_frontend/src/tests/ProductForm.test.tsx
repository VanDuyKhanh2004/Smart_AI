import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProductForm } from '@/features/admin/components/ProductForm';
import type { Product, ProductFormPayload } from '@/types/product.type';

const mockCreateObjectURL = vi.fn();
const mockRevokeObjectURL = vi.fn();

Object.defineProperty(URL, 'createObjectURL', {
  writable: true,
  configurable: true,
  value: mockCreateObjectURL,
});
Object.defineProperty(URL, 'revokeObjectURL', {
  writable: true,
  configurable: true,
  value: mockRevokeObjectURL,
});

function makeFile(name: string, type: string, size = 1024): File {
  return new File([new ArrayBuffer(size)], name, { type });
}

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

interface FillOptions {
  withFile?: File | null;
}

async function fillAndSubmit(onSubmit: ReturnType<typeof vi.fn>, options: FillOptions = {}) {
  fireEvent.change(screen.getByLabelText(/Tên sản phẩm/), { target: { value: 'iPhone 14' } });
  fireEvent.change(screen.getByLabelText(/Thương hiệu/), { target: { value: 'apple' } });
  fireEvent.change(screen.getByLabelText(/Giá/), { target: { value: '16000000' } });
  fireEvent.change(screen.getByLabelText(/Mô tả/), { target: { value: 'Mô tả sản phẩm' } });

  if (options.withFile) {
    const input = screen.getByLabelText('Chọn ảnh từ thiết bị') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [options.withFile] } });
  }

  fireEvent.click(screen.getByRole('button', { name: 'Thêm sản phẩm' }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  return onSubmit.mock.calls[0][0] as ProductFormPayload;
}

describe('ProductForm image source', () => {
  beforeEach(() => {
    mockCreateObjectURL.mockClear();
    mockRevokeObjectURL.mockClear();
    mockCreateObjectURL.mockImplementation((file: File) => `blob:mock-${file.name}`);
  });

  afterEach(() => {
    cleanup();
  });

  it('accepts a valid JPEG selection', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ProductForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    const payload = await fillAndSubmit(onSubmit, {
      withFile: makeFile('photo.jpg', 'image/jpeg'),
    });

    expect(payload.imageFile).not.toBeNull();
    expect(payload.imageFile?.type).toBe('image/jpeg');
  });

  it('accepts a valid PNG selection', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ProductForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    const payload = await fillAndSubmit(onSubmit, {
      withFile: makeFile('photo.png', 'image/png'),
    });

    expect(payload.imageFile?.type).toBe('image/png');
  });

  it('accepts a valid WebP selection', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ProductForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    const payload = await fillAndSubmit(onSubmit, {
      withFile: makeFile('photo.webp', 'image/webp'),
    });

    expect(payload.imageFile?.type).toBe('image/webp');
  });

  it('rejects an unsupported file type', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ProductForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    const input = screen.getByLabelText('Chọn ảnh từ thiết bị') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile('doc.txt', 'text/plain')] } });

    expect(await screen.findByText(/Định dạng ảnh không hợp lệ/)).toBeInTheDocument();
    expect(screen.getByLabelText('Chọn ảnh từ thiết bị')).toHaveAttribute('aria-invalid', 'true');
  });

  it('rejects a file larger than 5 MB', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ProductForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    const bigFile = makeFile('big.png', 'image/png', 5 * 1024 * 1024 + 1);
    const input = screen.getByLabelText('Chọn ảnh từ thiết bị') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [bigFile] } });

    expect(await screen.findByText(/không được vượt quá 5MB/)).toBeInTheDocument();
  });

  it('previews the selected file using an object URL', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ProductForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    const file = makeFile('preview.jpg', 'image/jpeg');
    const input = screen.getByLabelText('Chọn ảnh từ thiết bị') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    expect(mockCreateObjectURL).toHaveBeenCalledWith(file);
    await waitFor(() => {
      expect(screen.getByAltText(/Xem trước hình ảnh sản phẩm/)).toHaveAttribute('src', 'blob:mock-preview.jpg');
    });
  });

  it('revokes the previous object URL when a new file replaces it', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ProductForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    const first = makeFile('first.jpg', 'image/jpeg');
    const second = makeFile('second.jpg', 'image/jpeg');
    const input = screen.getByLabelText('Chọn ảnh từ thiết bị') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [first] } });
    expect(mockCreateObjectURL).toHaveBeenLastCalledWith(first);

    fireEvent.change(input, { target: { files: [second] } });
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-first.jpg');
    expect(mockCreateObjectURL).toHaveBeenLastCalledWith(second);
  });

  it('revokes the object URL on unmount', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(<ProductForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    const file = makeFile('cleanup.jpg', 'image/jpeg');
    const input = screen.getByLabelText('Chọn ảnh từ thiết bị') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    unmount();
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-cleanup.jpg');
  });

  it('clears the selected file when switching from file to URL mode', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ProductForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    const file = makeFile('switch.jpg', 'image/jpeg');
    const input = screen.getByLabelText('Chọn ảnh từ thiết bị') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    expect(mockCreateObjectURL).toHaveBeenCalledWith(file);

    fireEvent.click(screen.getByLabelText(/Nhập URL hình ảnh/));

    const payload = await fillAndSubmit(onSubmit);
    expect(payload.imageFile).toBeNull();
    expect(payload.imageUrl).toBe('');
  });

  it('prevents both sources being submitted when switching from URL to file mode', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ProductForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByLabelText(/Nhập URL hình ảnh/));
    fireEvent.change(screen.getByLabelText('URL hình ảnh'), {
      target: { value: 'https://example.com/new.jpg' },
    });

    fireEvent.click(screen.getByLabelText(/Tải ảnh từ thiết bị/));

    const payload = await fillAndSubmit(onSubmit, {
      withFile: makeFile('photo.jpg', 'image/jpeg'),
    });

    expect(payload.imageFile).not.toBeNull();
    expect(payload.imageUrl).toBe('');
  });

  it('previews the existing image on initial edit render', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ProductForm onSubmit={onSubmit} onCancel={vi.fn()} initialData={makeProduct()} />);

    await waitFor(() => {
      expect(screen.getByAltText(/Xem trước hình ảnh sản phẩm/)).toHaveAttribute(
        'src',
        'https://example.com/old.jpg'
      );
    });
  });

  it('omits the image field when editing without changing the image', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ProductForm onSubmit={onSubmit} onCancel={vi.fn()} initialData={makeProduct()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());

    const payload = onSubmit.mock.calls[0][0] as ProductFormPayload;
    expect(payload.imageFile).toBeNull();
    expect(payload.imageUrl).toBe('');
    expect(payload.clearImage).toBeFalsy();
  });

  it('sends clearImage when explicitly clearing the image on edit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ProductForm onSubmit={onSubmit} onCancel={vi.fn()} initialData={makeProduct()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Xóa hình ảnh hiện tại' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());

    const payload = onSubmit.mock.calls[0][0] as ProductFormPayload;
    expect(payload.clearImage).toBe(true);
    expect(payload.imageFile).toBeNull();
    expect(payload.imageUrl).toBe('');
  });

  it('sends a new URL in edit mode when a different URL is entered', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ProductForm onSubmit={onSubmit} onCancel={vi.fn()} initialData={makeProduct()} />);

    fireEvent.change(screen.getByLabelText('URL hình ảnh'), {
      target: { value: 'https://example.com/new.jpg' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());

    const payload = onSubmit.mock.calls[0][0] as ProductFormPayload;
    expect(payload.imageUrl).toBe('https://example.com/new.jpg');
    expect(payload.imageFile).toBeNull();
  });
});
