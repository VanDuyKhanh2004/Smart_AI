import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveApiBaseUrl, resolveBackendOrigin } from '@/lib/apiBaseUrl';
import { isHtmlResponse } from '@/lib/axios';

describe('resolveApiBaseUrl', () => {
  beforeEach(() => {
    import.meta.env.VITE_API_BASE_URL = 'https://smart-ai-backend-twe5.onrender.com/api';
    import.meta.env.DEV = true;
    import.meta.env.PROD = false;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses configured Render URL', () => {
    expect(resolveApiBaseUrl()).toBe('https://smart-ai-backend-twe5.onrender.com/api');
  });

  it('normalizes trailing slash', () => {
    import.meta.env.VITE_API_BASE_URL = 'https://smart-ai-backend-twe5.onrender.com/api/';
    expect(resolveApiBaseUrl()).toBe('https://smart-ai-backend-twe5.onrender.com/api');
  });

  it('normalizes multiple trailing slashes', () => {
    import.meta.env.VITE_API_BASE_URL = 'https://smart-ai-backend-twe5.onrender.com/api//';
    expect(resolveApiBaseUrl()).toBe('https://smart-ai-backend-twe5.onrender.com/api');
  });

  it('returns localhost when env is missing in development', () => {
    delete import.meta.env.VITE_API_BASE_URL;
    expect(resolveApiBaseUrl()).toBe('http://localhost:5000/api');
  });

  it('returns localhost when env is empty string in development', () => {
    import.meta.env.VITE_API_BASE_URL = '';
    expect(resolveApiBaseUrl()).toBe('http://localhost:5000/api');
  });

  it('returns localhost when env is whitespace in development', () => {
    import.meta.env.VITE_API_BASE_URL = '  ';
    expect(resolveApiBaseUrl()).toBe('http://localhost:5000/api');
  });

  it('throws when env is missing in production', () => {
    delete import.meta.env.VITE_API_BASE_URL;
    import.meta.env.DEV = false;
    import.meta.env.PROD = true;
    expect(() => resolveApiBaseUrl()).toThrow('VITE_API_BASE_URL is not set');
  });

  it('rejects relative URL starting with slash', () => {
    import.meta.env.VITE_API_BASE_URL = '/api';
    expect(() => resolveApiBaseUrl()).toThrow('must be an absolute HTTP/HTTPS URL');
  });

  it('rejects relative URL without scheme', () => {
    import.meta.env.VITE_API_BASE_URL = 'api';
    expect(() => resolveApiBaseUrl()).toThrow('must be an absolute HTTP/HTTPS URL');
  });

  it('rejects malformed URL with invalid port', () => {
    import.meta.env.VITE_API_BASE_URL = 'http://example.com:abc/api';
    expect(() => resolveApiBaseUrl()).toThrow('not a valid URL');
  });

  it('rejects bare http:// (becomes http: after slash normalization)', () => {
    import.meta.env.VITE_API_BASE_URL = 'http://';
    expect(() => resolveApiBaseUrl()).toThrow('must be an absolute HTTP/HTTPS URL');
  });

  it('rejects non-HTTP protocol', () => {
    import.meta.env.VITE_API_BASE_URL = 'ftp://backend.example.com/api';
    expect(() => resolveApiBaseUrl()).toThrow('must use http: or https: protocol');
  });

  it('rejects URL pointing at the frontend origin', () => {
    const origin = window.location.origin;
    import.meta.env.VITE_API_BASE_URL = `${origin}/api`;
    expect(() => resolveApiBaseUrl()).toThrow('resolves to the frontend origin');
  });
});

describe('resolveBackendOrigin', () => {
  beforeEach(() => {
    import.meta.env.VITE_API_BASE_URL = 'https://smart-ai-backend-twe5.onrender.com/api';
    import.meta.env.DEV = true;
    import.meta.env.PROD = false;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('removes the /api path segment from base URL', () => {
    expect(resolveBackendOrigin()).toBe('https://smart-ai-backend-twe5.onrender.com');
  });

  it('strips localhost /api correctly', () => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:5000/api';
    expect(resolveBackendOrigin()).toBe('http://localhost:5000');
  });

  it('preserves /api in the hostname', () => {
    import.meta.env.VITE_API_BASE_URL = 'http://api.example.com:8080/api';
    expect(resolveBackendOrigin()).toBe('http://api.example.com:8080');
  });
});

describe('isHtmlResponse (Axios HTML guard)', () => {
  it('rejects text/html content-type', () => {
    expect(isHtmlResponse({ headers: { 'content-type': 'text/html; charset=utf-8' } })).toBe(true);
  });

  it('passes application/json content-type', () => {
    expect(isHtmlResponse({ headers: { 'content-type': 'application/json' } })).toBe(false);
  });

  it('passes when no content-type header is present (e.g. 204 No Content)', () => {
    expect(isHtmlResponse({ headers: {} })).toBe(false);
  });

  it('passes undefined headers gracefully', () => {
    expect(isHtmlResponse({ headers: undefined as any })).toBe(false);
  });
});

describe('Axios interceptor integration (204 / HTML rejection behaviors)', () => {
  beforeEach(() => {
    import.meta.env.VITE_API_BASE_URL = 'http://test-backend.com/api';
    import.meta.env.DEV = true;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects HTML API response with configuration error', async () => {
    const mod = await import('@/lib/axios');
    const client = mod.default;
    const interceptor = client.interceptors.response as any;
    const successHandler = interceptor.handlers[0].fulfilled;

    await expect(
      successHandler({
        data: {},
        headers: { 'content-type': 'text/html; charset=utf-8' },
        status: 200,
        statusText: 'OK',
        config: {},
      })
    ).rejects.toThrow('API returned HTML instead of JSON');
  });

  it('passes valid JSON response through', async () => {
    const mod = await import('@/lib/axios');
    const client = mod.default;
    const interceptor = client.interceptors.response as any;
    const successHandler = interceptor.handlers[0].fulfilled;

    const response = {
      data: { success: true },
      headers: { 'content-type': 'application/json' },
      status: 200,
      statusText: 'OK',
      config: {},
    };
    const result = await successHandler(response);
    expect(result).toBe(response);
  });

  it('passes 204 No Content response with undefined data through', async () => {
    const mod = await import('@/lib/axios');
    const client = mod.default;
    const interceptor = client.interceptors.response as any;
    const successHandler = interceptor.handlers[0].fulfilled;

    const response = {
      data: undefined,
      headers: {},
      status: 204,
      statusText: 'No Content',
      config: {},
    };
    const result = await successHandler(response);
    expect(result).toBe(response);
  });
});

describe('Product service defensive validation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    import.meta.env.VITE_API_BASE_URL = 'http://test-backend.com/api';
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects malformed product response (missing products array)', async () => {
    vi.doMock('@/lib/axios', () => ({
      default: {
        defaults: { baseURL: 'http://test-backend.com/api' },
        get: vi.fn().mockResolvedValue({
          data: { success: true, message: 'ok', data: {} },
        }),
        post: vi.fn(),
        patch: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
      },
    }));
    const { productService } = await import('@/services/product.service');
    await expect(productService.getAllProducts({ page: 1 })).rejects.toThrow('API returned unexpected response format');
  });

  it('rejects null body', async () => {
    vi.doMock('@/lib/axios', () => ({
      default: {
        defaults: { baseURL: 'http://test-backend.com/api' },
        get: vi.fn().mockResolvedValue({ data: null }),
        post: vi.fn(),
        patch: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
      },
    }));
    const { productService } = await import('@/services/product.service');
    await expect(productService.getAllProducts({ page: 1 })).rejects.toThrow('API returned unexpected response format');
  });

  it('accepts valid product response', async () => {
    const validResponse = {
      success: true,
      message: 'ok',
      data: {
        products: [
          { _id: 'p1', name: 'Test', brand: 'x', price: 100, description: 'd', inStock: 5, colors: [], tags: [], image: 'i.jpg', isActive: true, createdAt: '', updatedAt: '' },
        ],
        pagination: { currentPage: 1, totalPages: 1, totalCount: 1, limit: 10, hasNextPage: false, hasPrevPage: false, nextPage: null, prevPage: null },
      },
    };
    vi.doMock('@/lib/axios', () => ({
      default: {
        defaults: { baseURL: 'http://test-backend.com/api' },
        get: vi.fn().mockResolvedValue({ data: validResponse }),
        post: vi.fn(),
        patch: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
      },
    }));
    const { productService } = await import('@/services/product.service');
    const result = await productService.getAllProducts({ page: 1 });
    expect(result.success).toBe(true);
    expect(result.data.products).toHaveLength(1);
    expect(result.data.products[0].name).toBe('Test');
  });
});

describe('Integration: Google login URL uses backend origin', () => {
  beforeEach(() => {
    import.meta.env.VITE_API_BASE_URL = 'https://smart-ai-backend-twe5.onrender.com/api';
    import.meta.env.DEV = true;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolveBackendOrigin produces correct Google login endpoint', () => {
    const origin = resolveBackendOrigin();
    const googleLoginUrl = `${origin}/api/auth/google-login`;
    expect(googleLoginUrl).toBe('https://smart-ai-backend-twe5.onrender.com/api/auth/google-login');
  });
});