import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveApiBaseUrl, resolveBackendOrigin, ApiConfigError } from '@/lib/apiBaseUrl';
import { isHtmlResponse } from '@/lib/axios';

function captureError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected function to throw');
}

describe('resolveApiBaseUrl', () => {
  it('uses configured Render URL', () => {
    expect(resolveApiBaseUrl({
      configuredUrl: 'https://smart-ai-backend-twe5.onrender.com/api',
      isDev: false,
      frontendOrigin: 'http://localhost:3000',
    })).toBe('https://smart-ai-backend-twe5.onrender.com/api');
  });

  it('normalizes trailing slash', () => {
    expect(resolveApiBaseUrl({
      configuredUrl: 'https://smart-ai-backend-twe5.onrender.com/api/',
      isDev: false,
      frontendOrigin: 'http://localhost:3000',
    })).toBe('https://smart-ai-backend-twe5.onrender.com/api');
  });

  it('normalizes multiple trailing slashes', () => {
    expect(resolveApiBaseUrl({
      configuredUrl: 'https://smart-ai-backend-twe5.onrender.com/api//',
      isDev: false,
      frontendOrigin: 'http://localhost:3000',
    })).toBe('https://smart-ai-backend-twe5.onrender.com/api');
  });

  it('returns localhost when config is missing in development', () => {
    expect(resolveApiBaseUrl({
      configuredUrl: '',
      isDev: true,
    })).toBe('http://localhost:5000/api');
  });

  it('returns localhost when config is whitespace in development', () => {
    expect(resolveApiBaseUrl({
      configuredUrl: '  ',
      isDev: true,
    })).toBe('http://localhost:5000/api');
  });

  it('throws typed missing error when config is missing in production', () => {
    const error = captureError(() => resolveApiBaseUrl({
      configuredUrl: '',
      isDev: false,
    }));
    expect(error).toBeInstanceOf(ApiConfigError);
    expect((error as ApiConfigError).reason).toBe('missing');
  });

  it('rejects relative URL starting with slash as typed invalid', () => {
    const raw = '/private-path';
    const error = captureError(() => resolveApiBaseUrl({
      configuredUrl: raw,
      isDev: false,
    }));
    expect(error).toBeInstanceOf(ApiConfigError);
    expect((error as ApiConfigError).reason).toBe('invalid');
    expect((error as Error).message).not.toContain(raw);
  });

  it('rejects relative URL without scheme as typed invalid', () => {
    const raw = 'relative-value-xyz';
    const error = captureError(() => resolveApiBaseUrl({
      configuredUrl: raw,
      isDev: false,
    }));
    expect(error).toBeInstanceOf(ApiConfigError);
    expect((error as ApiConfigError).reason).toBe('invalid');
    expect((error as Error).message).not.toContain(raw);
  });

  it('rejects malformed URL with invalid port as typed invalid', () => {
    const error = captureError(() => resolveApiBaseUrl({
      configuredUrl: 'http://example.com:abc/api',
      isDev: false,
    }));
    expect(error).toBeInstanceOf(ApiConfigError);
    expect((error as ApiConfigError).reason).toBe('invalid');
    expect((error as Error).message).not.toContain('example.com');
  });

  it('rejects bare http:// as typed invalid', () => {
    const error = captureError(() => resolveApiBaseUrl({
      configuredUrl: 'http://',
      isDev: false,
    }));
    expect(error).toBeInstanceOf(ApiConfigError);
    expect((error as ApiConfigError).reason).toBe('invalid');
  });

  it('rejects non-HTTP protocol as typed invalid', () => {
    const error = captureError(() => resolveApiBaseUrl({
      configuredUrl: 'ftp://backend.example.com/api',
      isDev: false,
    }));
    expect(error).toBeInstanceOf(ApiConfigError);
    expect((error as ApiConfigError).reason).toBe('invalid');
    expect((error as Error).message).not.toContain('backend.example.com');
  });

  it('rejects URL pointing at the frontend origin as typed invalid', () => {
    const error = captureError(() => resolveApiBaseUrl({
      configuredUrl: 'http://localhost:3000/api',
      isDev: false,
      frontendOrigin: 'http://localhost:3000',
    }));
    expect(error).toBeInstanceOf(ApiConfigError);
    expect((error as ApiConfigError).reason).toBe('invalid');
    expect((error as Error).message).toContain('frontend origin');
  });
});

describe('resolveBackendOrigin', () => {
  it('removes the /api path segment from base URL', () => {
    expect(resolveBackendOrigin({
      configuredUrl: 'https://smart-ai-backend-twe5.onrender.com/api',
      isDev: false,
      frontendOrigin: 'http://localhost:3000',
    })).toBe('https://smart-ai-backend-twe5.onrender.com');
  });

  it('strips localhost /api correctly', () => {
    expect(resolveBackendOrigin({
      configuredUrl: 'http://localhost:5000/api',
      isDev: true,
    })).toBe('http://localhost:5000');
  });

  it('preserves /api in the hostname', () => {
    expect(resolveBackendOrigin({
      configuredUrl: 'http://api.example.com:8080/api',
      isDev: false,
      frontendOrigin: 'http://localhost:3000',
    })).toBe('http://api.example.com:8080');
  });
});

describe('isHtmlResponse', () => {
  it('rejects text/html content-type (plain object)', () => {
    expect(isHtmlResponse({ headers: { 'content-type': 'text/html; charset=utf-8' } })).toBe(true);
  });

  it('rejects text/html with AxiosHeaders-style get method', () => {
    const headersWithGet = {
      get(name: string) {
        const map: Record<string, string> = { 'content-type': 'text/html; charset=utf-8' };
        return map[name];
      },
    };
    expect(isHtmlResponse({ headers: headersWithGet })).toBe(true);
  });

  it('passes application/json content-type', () => {
    expect(isHtmlResponse({ headers: { 'content-type': 'application/json' } })).toBe(false);
  });

  it('passes when no content-type header is present (e.g. 204 No Content)', () => {
    expect(isHtmlResponse({ headers: {} })).toBe(false);
  });

  it('passes undefined headers gracefully', () => {
    expect(isHtmlResponse({ headers: undefined })).toBe(false);
  });

  it('passes null headers gracefully', () => {
    expect(isHtmlResponse({ headers: null as unknown as undefined })).toBe(false);
  });

  it('handles header value as string[] (AxiosHeaders format)', () => {
    const headersWithGet = {
      get(name: string) {
        const map: Record<string, string[]> = { 'content-type': ['text/html', 'charset=utf-8'] };
        return map[name];
      },
    };
    expect(isHtmlResponse({ headers: headersWithGet })).toBe(true);
  });

  it('handles header value as number (edge case)', () => {
    const headersWithGet = {
      get() {
        return 42;
      },
    };
    expect(isHtmlResponse({ headers: headersWithGet })).toBe(false);
  });

  it('handles Title-Case Content-Type in plain objects', () => {
    expect(isHtmlResponse({ headers: { 'Content-Type': 'text/html; charset=utf-8' } })).toBe(true);
  });

  it('handles lowercase content-type with XML content', () => {
    expect(isHtmlResponse({ headers: { 'content-type': 'application/xml' } })).toBe(false);
  });
});

describe('Product service defensive validation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
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
  it('resolveBackendOrigin produces correct Google login endpoint', () => {
    const origin = resolveBackendOrigin({
      configuredUrl: 'https://smart-ai-backend-twe5.onrender.com/api',
      isDev: false,
      frontendOrigin: 'http://localhost:3000',
    });
    const googleLoginUrl = `${origin}/api/auth/google-login`;
    expect(googleLoginUrl).toBe('https://smart-ai-backend-twe5.onrender.com/api/auth/google-login');
  });
});

describe('Regression: production API URL validation', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts production HTTPS API base URL ending with /api', () => {
    expect(resolveApiBaseUrl({
      configuredUrl: 'https://smart-ai-backend-twe5.onrender.com/api',
      isDev: false,
      frontendOrigin: 'https://smart-ai-shop.vercel.app',
    })).toBe('https://smart-ai-backend-twe5.onrender.com/api');
  });

  it('accepts production HTTPS backend origin', () => {
    expect(resolveApiBaseUrl({
      configuredUrl: 'https://smart-ai-backend-twe5.onrender.com',
      isDev: false,
      frontendOrigin: 'https://smart-ai-shop.vercel.app',
    })).toBe('https://smart-ai-backend-twe5.onrender.com');
  });

  it('accepts localhost HTTP URL in development', () => {
    expect(resolveApiBaseUrl({
      configuredUrl: 'http://localhost:5000/api',
      isDev: true,
      frontendOrigin: 'http://localhost:5173',
    })).toBe('http://localhost:5000/api');
  });

  it('trims surrounding whitespace', () => {
    expect(resolveApiBaseUrl({
      configuredUrl: '  https://smart-ai-backend-twe5.onrender.com/api  \n',
      isDev: false,
      frontendOrigin: 'https://smart-ai-shop.vercel.app',
    })).toBe('https://smart-ai-backend-twe5.onrender.com/api');
  });

  it('rejects relative URL without echoing the value', () => {
    const raw = 'backend.example.com/api';
    const error = captureError(() => resolveApiBaseUrl({
      configuredUrl: raw,
      isDev: false,
      frontendOrigin: 'https://smart-ai-shop.vercel.app',
    }));
    expect(error).toBeInstanceOf(ApiConfigError);
    expect((error as ApiConfigError).reason).toBe('invalid');
    expect((error as Error).message).not.toContain(raw);
  });

  it('rejects unsupported protocol without echoing the value', () => {
    const raw = 'ws://backend.example.com/api';
    const error = captureError(() => resolveApiBaseUrl({
      configuredUrl: raw,
      isDev: false,
      frontendOrigin: 'https://smart-ai-shop.vercel.app',
    }));
    expect(error).toBeInstanceOf(ApiConfigError);
    expect((error as ApiConfigError).reason).toBe('invalid');
    expect((error as Error).message).not.toContain(raw);
  });

  it('does not fall back to localhost when the variable is missing in production', () => {
    const error = captureError(() => resolveApiBaseUrl({
      configuredUrl: '',
      isDev: false,
    }));
    expect(error).toBeInstanceOf(ApiConfigError);
    expect((error as ApiConfigError).reason).toBe('missing');
    expect((error as Error).message).not.toBe('http://localhost:5000/api');
  });

  it('converts invalid production configuration into the typed configuration error', () => {
    const error = captureError(() => resolveApiBaseUrl({
      configuredUrl: 'not a url',
      isDev: false,
      frontendOrigin: 'https://smart-ai-shop.vercel.app',
    }));
    expect(error).toBeInstanceOf(ApiConfigError);
    expect((error as ApiConfigError).reason).toBe('invalid');
  });

  it('never includes the configured raw value in error output', () => {
    const raw = 'private-token.example';
    const error = captureError(() => resolveApiBaseUrl({
      configuredUrl: raw,
      isDev: false,
    }));
    expect(error).toBeInstanceOf(ApiConfigError);
    expect((error as Error).message).not.toContain(raw);
  });

  it('derives backend origin without corrupting a hostname or path containing "api"', () => {
    expect(resolveBackendOrigin({
      configuredUrl: 'https://api.smart-ai-backend.example.com:8443/api/v1/',
      isDev: false,
      frontendOrigin: 'https://smart-ai-shop.vercel.app',
    })).toBe('https://api.smart-ai-backend.example.com:8443');
  });

  it('valid production configuration does not throw during application initialization', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://smart-ai-backend-twe5.onrender.com/api');
    expect(() => resolveApiBaseUrl({
      isDev: false,
      frontendOrigin: 'https://smart-ai-shop.vercel.app',
    })).not.toThrow();
    expect(resolveApiBaseUrl({
      isDev: false,
      frontendOrigin: 'https://smart-ai-shop.vercel.app',
    })).toBe('https://smart-ai-backend-twe5.onrender.com/api');
  });
});
