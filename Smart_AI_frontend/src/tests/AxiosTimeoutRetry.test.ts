import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import apiClient from '@/lib/axios';
import type { AxiosAdapter, AxiosError, InternalAxiosRequestConfig } from 'axios';

type AxiosInterceptorHandlers = {
  handlers?: Array<{
    rejected?: (error: unknown) => unknown;
  }>;
};

function getResponseErrorHandler() {
  const handlers = (apiClient.interceptors.response as unknown as AxiosInterceptorHandlers)
    .handlers;
  return handlers?.[0]?.rejected;
}

function timeoutError(config: InternalAxiosRequestConfig) {
  const err = new Error('timeout of 10000ms exceeded') as Error & {
    code: string;
    config: InternalAxiosRequestConfig;
  };
  err.code = 'ECONNABORTED';
  err.config = config;
  return Promise.reject(err);
}

function httpStatusError(config: InternalAxiosRequestConfig, status: number) {
  const err = Object.assign(new Error(`Request failed with status code ${status}`), {
    code: status === 404 ? 'ERR_BAD_REQUEST' : 'ERR_BAD_RESPONSE',
    config,
    response: {
      status,
      statusText: String(status),
      headers: {},
      data: {},
      config,
    },
  });
  return Promise.reject(err);
}

function okResponse(config: InternalAxiosRequestConfig) {
  return Promise.resolve({
    data: { success: true, data: { products: [], pagination: {} } },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  });
}

describe('Axios timeout retry', () => {
  const originalAdapter = apiClient.defaults.adapter;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
  });

  it('retries an idempotent GET once and succeeds on the second attempt', async () => {
    let calls = 0;
    apiClient.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
      calls += 1;
      if (calls === 1) {
        return timeoutError(config);
      }
      return okResponse(config);
    }) as AxiosAdapter;

    const response = await apiClient.get('/products');

    expect(response.data.success).toBe(true);
    expect(calls).toBe(2);
  });

  it('does not retry a second time when the retried GET also times out', async () => {
    let calls = 0;
    apiClient.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
      calls += 1;
      return timeoutError(config);
    }) as AxiosAdapter;

    await expect(apiClient.get('/products')).rejects.toMatchObject({
      code: 'ECONNABORTED',
    });
    expect(calls).toBe(2);
  });

  it('does not retry a GET that fails with an HTTP status error', async () => {
    let calls = 0;
    apiClient.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
      calls += 1;
      return httpStatusError(config, 500);
    }) as AxiosAdapter;

    await expect(apiClient.get('/products')).rejects.toMatchObject({
      code: 'ERR_BAD_RESPONSE',
    });
    expect(calls).toBe(1);
  });

  it('does not retry non-GET requests', async () => {
    let calls = 0;
    apiClient.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
      calls += 1;
      return timeoutError(config);
    }) as AxiosAdapter;

    await expect(apiClient.post('/products', {})).rejects.toMatchObject({
      code: 'ECONNABORTED',
    });
    expect(calls).toBe(1);
  });

  it('does not retry a timeout on the /auth/refresh endpoint', async () => {
    let calls = 0;
    apiClient.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
      calls += 1;
      return timeoutError(config);
    }) as AxiosAdapter;

    await expect(apiClient.get('/auth/refresh')).rejects.toMatchObject({
      code: 'ECONNABORTED',
    });
    expect(calls).toBe(1);
  });

  it('does not retry when the request signal was already aborted', async () => {
    const handler = getResponseErrorHandler();
    expect(handler).toBeDefined();

    const controller = new AbortController();
    controller.abort();

    const error = {
      code: 'ECONNABORTED',
      response: undefined,
      config: {
        url: '/products',
        method: 'get',
        headers: {},
        signal: controller.signal,
      },
    };

    await expect(handler!(error)).rejects.toBe(error);
  });

  it('preserves the request params and headers on the retry', async () => {
    const seen: InternalAxiosRequestConfig[] = [];
    apiClient.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
      seen.push(config);
      if (seen.length === 1) {
        return timeoutError(config);
      }
      return okResponse(config);
    }) as AxiosAdapter;

    localStorage.setItem('accessToken', 'token-123');
    await apiClient.get('/products', {
      params: { page: 2, limit: 10, brand: 'apple' },
      headers: { 'X-Custom': 'yes' },
    });

    expect(seen).toHaveLength(2);
    const retried = seen[1];
    expect(retried.params).toEqual({ page: 2, limit: 10, brand: 'apple' });
    expect(retried.headers.Authorization).toBe('Bearer token-123');
    expect(retried.headers['X-Custom']).toBe('yes');
  });

  it('strips the timeout message from the final rejection when retry also fails', async () => {
    apiClient.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
      return timeoutError(config);
    }) as AxiosAdapter;

    let captured: AxiosError | null = null;
    try {
      await apiClient.get('/products');
    } catch (error) {
      captured = error as AxiosError;
    }

    expect(captured).not.toBeNull();
    expect(captured!.code).toBe('ECONNABORTED');
  });
});
