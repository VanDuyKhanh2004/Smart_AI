import { describe, it, expect, vi, beforeEach } from 'vitest';
import { productService } from '@/services/product.service';
import type { ProductFormPayload, ProductSpecs } from '@/types/product.type';

vi.mock('@/lib/axios', () => ({
  default: {
    post: vi.fn(),
    put: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockPost = vi.mocked((await import('@/lib/axios')).default.post);
const mockPut = vi.mocked((await import('@/lib/axios')).default.put);
const mockGet = vi.mocked((await import('@/lib/axios')).default.get);

function makeFile(type = 'image/jpeg', name = 'photo.jpg'): File {
  return new File([new ArrayBuffer(1024)], name, { type });
}

function basePayload(overrides: Partial<ProductFormPayload> = {}): ProductFormPayload {
  return {
    name: 'iPhone 14',
    brand: 'apple',
    price: 16000000,
    description: 'Mô tả',
    inStock: 10,
    colors: ['Đen', 'Trắng'],
    tags: ['flagship', '5G'],
    imageSource: 'file',
    imageFile: null,
    imageUrl: '',
    ...overrides,
  };
}

describe('productService multipart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({ data: { success: true, message: 'ok', data: {} } });
    mockPut.mockResolvedValue({ data: { success: true, message: 'ok', data: {} } });
  });

  it('uses FormData when a file is selected on create', async () => {
    const payload = basePayload({ imageFile: makeFile() });

    await productService.createProduct(payload);

    const [url, body] = mockPost.mock.calls[0] as [string, unknown];
    expect(url).toBe('/products');
    expect(body).toBeInstanceOf(FormData);
  });

  it('names the multipart file field "image"', async () => {
    const file = makeFile();
    const payload = basePayload({ imageFile: file });

    await productService.createProduct(payload);

    const body = mockPost.mock.calls[0][1] as FormData;
    expect(body.get('image')).toBe(file);
  });

  it('serializes arrays and specs as JSON strings in multipart', async () => {
    const specs: ProductSpecs = { screen: { size: '6.1"' } };
    const payload = basePayload({ imageFile: makeFile(), specs });

    await productService.createProduct(payload);

    const body = mockPost.mock.calls[0][1] as FormData;
    expect(body.get('colors')).toBe('["Đen","Trắng"]');
    expect(body.get('tags')).toBe('["flagship","5G"]');
    expect(body.get('specs')).toBe(JSON.stringify(specs));
    expect(body.get('name')).toBe('iPhone 14');
    expect(body.get('price')).toBe('16000000');
    expect(body.get('inStock')).toBe('10');
  });

  it('keeps JSON request behavior in URL mode on create', async () => {
    const payload = basePayload({
      imageSource: 'url',
      imageUrl: 'https://example.com/img.jpg',
      imageFile: null,
    });

    await productService.createProduct(payload);

    const [url, body] = mockPost.mock.calls[0] as [string, unknown];
    expect(url).toBe('/products');
    expect(body).not.toBeInstanceOf(FormData);
    expect(body).toMatchObject({
      name: 'iPhone 14',
      image: 'https://example.com/img.jpg',
      colors: ['Đen', 'Trắng'],
      tags: ['flagship', '5G'],
    });
  });

  it('omits image from update payload when image is untouched', async () => {
    const payload = basePayload({ imageFile: null, imageUrl: '', clearImage: false });

    await productService.updateProduct('p1', payload);

    const [url, body] = mockPut.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('/products/p1');
    expect('image' in body).toBe(false);
  });

  it('sends image: "" when explicitly clearing on update', async () => {
    const payload = basePayload({ imageFile: null, imageUrl: '', clearImage: true });

    await productService.updateProduct('p1', payload);

    const body = mockPut.mock.calls[0][1] as Record<string, unknown>;
    expect(body.image).toBe('');
  });

  it('sends a URL via JSON when updating with a URL', async () => {
    const payload = basePayload({
      imageSource: 'url',
      imageFile: null,
      imageUrl: 'https://example.com/new.jpg',
    });

    await productService.updateProduct('p1', payload);

    const body = mockPut.mock.calls[0][1] as Record<string, unknown>;
    expect(body.image).toBe('https://example.com/new.jpg');
    expect(body).not.toBeInstanceOf(FormData);
  });

  it('uses multipart FormData on update when a file is selected', async () => {
    const payload = basePayload({ imageFile: makeFile() });

    await productService.updateProduct('p1', payload);

    const [url, body] = mockPut.mock.calls[0] as [string, unknown];
    expect(url).toBe('/products/p1');
    expect(body).toBeInstanceOf(FormData);
  });

  it('passes onUploadProgress through to the axios request', async () => {
    const onUploadProgress = vi.fn();
    const payload = basePayload({ imageFile: makeFile() });

    await productService.createProduct(payload, { onUploadProgress });

    const config = mockPost.mock.calls[0][2] as { onUploadProgress?: unknown };
    expect(config.onUploadProgress).toBe(onUploadProgress);
  });

  it('does not pass onUploadProgress when only JSON is used', async () => {
    const onUploadProgress = vi.fn();
    const payload = basePayload({ imageFile: null, imageUrl: '' });

    await productService.createProduct(payload, { onUploadProgress });

    const config = mockPost.mock.calls[0][2] as { onUploadProgress?: unknown } | undefined;
    expect(config).toBeUndefined();
  });

  it('removes the inherited application/json Content-Type on multipart create', async () => {
    const payload = basePayload({ imageFile: makeFile() });

    await productService.createProduct(payload);

    const config = mockPost.mock.calls[0][2] as { headers?: Record<string, unknown> };
    expect(config.headers).toHaveProperty('Content-Type', undefined);
    expect(JSON.stringify(config.headers)).not.toContain('application/json');
  });

  it('removes the inherited application/json Content-Type on multipart update', async () => {
    const payload = basePayload({ imageFile: makeFile() });

    await productService.updateProduct('p1', payload);

    const config = mockPut.mock.calls[0][2] as { headers?: Record<string, unknown> };
    expect(config.headers).toHaveProperty('Content-Type', undefined);
    expect(JSON.stringify(config.headers)).not.toContain('application/json');
  });

  it('never sets a bare multipart/form-data header without a boundary', async () => {
    const payload = basePayload({ imageFile: makeFile() });

    await productService.createProduct(payload);

    const config = mockPost.mock.calls[0][2] as { headers?: Record<string, unknown> };
    expect(JSON.stringify(config.headers)).not.toContain('multipart/form-data');
  });

  it('keeps application/json default for JSON create', async () => {
    const payload = basePayload({ imageFile: null, imageUrl: 'https://example.com/img.jpg' });

    await productService.createProduct(payload);

    const config = mockPost.mock.calls[0][2] as { headers?: Record<string, unknown> } | undefined;
    expect(config).toBeUndefined();
    const body = mockPost.mock.calls[0][1] as Record<string, unknown>;
    expect(body.image).toBe('https://example.com/img.jpg');
    expect(body).not.toBeInstanceOf(FormData);
  });

  it('keeps application/json default for JSON update', async () => {
    const payload = basePayload({ imageFile: null, imageUrl: 'https://example.com/img.jpg' });

    await productService.updateProduct('p1', payload);

    const config = mockPut.mock.calls[0][2] as { headers?: Record<string, unknown> } | undefined;
    expect(config).toBeUndefined();
    const body = mockPut.mock.calls[0][1] as Record<string, unknown>;
    expect(body.image).toBe('https://example.com/img.jpg');
    expect(body).not.toBeInstanceOf(FormData);
  });

  it('preserves the File object intact on create', async () => {
    const file = makeFile('image/png', 'graphic.png');
    const payload = basePayload({ imageFile: file });

    await productService.createProduct(payload);

    const body = mockPost.mock.calls[0][1] as FormData;
    expect(body.get('image')).toBe(file);
    expect((body.get('image') as File).type).toBe('image/png');
    expect((body.get('image') as File).name).toBe('graphic.png');
  });

  it('preserves the File object intact on update', async () => {
    const file = makeFile('image/webp', 'shot.webp');
    const payload = basePayload({ imageFile: file });

    await productService.updateProduct('p1', payload);

    const body = mockPut.mock.calls[0][1] as FormData;
    expect(body.get('image')).toBe(file);
    expect((body.get('image') as File).type).toBe('image/webp');
    expect((body.get('image') as File).name).toBe('shot.webp');
  });
});

describe('productService product metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReset();
  });

  it('calls GET /products/meta and returns the brands array', async () => {
    mockGet.mockResolvedValue({
      data: { success: true, data: { brands: ['apple', 'samsung'] } },
    });

    const result = await productService.getProductMeta();

    expect(mockGet).toHaveBeenCalledWith('/products/meta', expect.any(Object));
    expect(result).toEqual({ brands: ['apple', 'samsung'] });
  });

  it('forwards the AbortSignal through to the axios request', async () => {
    mockGet.mockResolvedValue({
      data: { success: true, data: { brands: ['apple'] } },
    });

    const controller = new AbortController();
    await productService.getProductMeta({ signal: controller.signal });

    const config = mockGet.mock.calls[0][1] as { signal?: AbortSignal };
    expect(config.signal).toBe(controller.signal);
  });

  it('accepts metadata without an options argument', async () => {
    mockGet.mockResolvedValue({
      data: { success: true, data: { brands: [] } },
    });

    const result = await productService.getProductMeta();

    expect(result).toEqual({ brands: [] });
  });

  it('rejects when response body is missing the brands array', async () => {
    mockGet.mockResolvedValue({ data: { success: true, data: {} } });

    await expect(productService.getProductMeta()).rejects.toThrow(
      'API returned unexpected response format',
    );
  });

  it('rejects when the response body is not an object', async () => {
    mockGet.mockResolvedValue({ data: null });

    await expect(productService.getProductMeta()).rejects.toThrow(
      'API returned unexpected response format',
    );
  });
});

describe('productService list requests with abort signal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReset();
  });

  it('passes the abort signal to GET /products', async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        message: 'ok',
        data: {
          products: [],
          pagination: {
            currentPage: 1,
            totalPages: 1,
            totalCount: 0,
            limit: 10,
            hasNextPage: false,
            hasPrevPage: false,
            nextPage: null,
            prevPage: null,
          },
        },
      },
    });

    const controller = new AbortController();
    await productService.getAllProducts({ page: 1 }, { signal: controller.signal });

    const config = mockGet.mock.calls[0][1] as { signal?: AbortSignal };
    expect(config.signal).toBe(controller.signal);
  });

  it('still works when no abort signal is provided', async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        message: 'ok',
        data: {
          products: [],
          pagination: {
            currentPage: 1,
            totalPages: 1,
            totalCount: 0,
            limit: 10,
            hasNextPage: false,
            hasPrevPage: false,
            nextPage: null,
            prevPage: null,
          },
        },
      },
    });

    const result = await productService.getAllProducts({ page: 1 });

    expect(result.success).toBe(true);
  });
});
