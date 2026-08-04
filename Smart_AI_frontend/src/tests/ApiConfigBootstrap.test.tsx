import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { InternalAxiosRequestConfig } from 'axios';
import { ConfigErrorPage } from '@/components/config/ConfigErrorPage';

function ensureRoot() {
  const existing = document.getElementById('root');
  if (existing) existing.remove();
  const div = document.createElement('div');
  div.id = 'root';
  document.body.appendChild(div);
  return div;
}

function AppMarker() {
  return <div>APP-ROOT-RENDERED</div>;
}

function ErrorMarker() {
  return <div>CONFIG-ERROR-RENDERED</div>;
}

type AxiosRequestFulfilledHandler = (
  config: InternalAxiosRequestConfig
) => unknown;

function getRequestHandler(apiClient: { interceptors: { request: unknown } }) {
  const handlers = (
    apiClient.interceptors.request as {
      handlers?: Array<{ fulfilled?: AxiosRequestFulfilledHandler }>;
    }
  ).handlers;
  return handlers?.[0]?.fulfilled;
}

describe('ConfigErrorPage', () => {
  it('renders Vietnamese content for invalid configuration', () => {
    render(<ConfigErrorPage state={{ status: 'invalid' }} />);
    expect(screen.getByText('Cấu hình API không hợp lệ')).toBeInTheDocument();
  });

  it('renders Vietnamese content for missing configuration', () => {
    render(<ConfigErrorPage state={{ status: 'missing' }} />);
    expect(screen.getByText('Thiếu cấu hình API')).toBeInTheDocument();
  });
});

describe('Application bootstrap configuration gate', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('renders the configuration-error UI instead of crashing when config is invalid', async () => {
    ensureRoot();
    vi.stubEnv('VITE_API_BASE_URL', 'not-a-valid-url');
    vi.doMock('@/App', () => ({ default: AppMarker }));
    vi.doMock('@/components/config/ConfigErrorPage', () => ({
      ConfigErrorPage: ErrorMarker,
    }));
    await act(async () => {
      await import('@/main');
    });
    expect(await screen.findByText('CONFIG-ERROR-RENDERED')).toBeInTheDocument();
    expect(screen.queryByText('APP-ROOT-RENDERED')).toBeNull();
  });

  it('renders the normal application path when config is valid', async () => {
    ensureRoot();
    vi.stubEnv('VITE_API_BASE_URL', 'https://smart-ai-backend-twe5.onrender.com/api');
    vi.doMock('@/App', () => ({ default: AppMarker }));
    vi.doMock('@/components/config/ConfigErrorPage', () => ({
      ConfigErrorPage: ErrorMarker,
    }));
    await act(async () => {
      await import('@/main');
    });
    expect(await screen.findByText('APP-ROOT-RENDERED')).toBeInTheDocument();
    expect(screen.queryByText('CONFIG-ERROR-RENDERED')).toBeNull();
  });
});

describe('Axios configuration state', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('does not issue requests with localhost or an invalid baseURL after configuration failure', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'not-a-valid-url');
    vi.resetModules();
    const { default: apiClient, getApiConfigState, isApiConfigured } = await import('@/lib/axios');
    const { ApiConfigError } = await import('@/lib/apiBaseUrl');

    expect(getApiConfigState()).toEqual({ status: 'invalid' });
    expect(isApiConfigured()).toBe(false);
    expect(apiClient.defaults.baseURL).not.toBe('http://localhost:5000/api');
    expect(apiClient.defaults.baseURL).not.toContain('not-a-valid-url');

    const handler = getRequestHandler(apiClient);
    expect(handler).toBeDefined();
    await expect(
      handler!({ headers: {} } as InternalAxiosRequestConfig)
    ).rejects.toBeInstanceOf(ApiConfigError);
  });

  it('resolves a valid production configuration during bootstrap', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://smart-ai-backend-twe5.onrender.com/api');
    vi.resetModules();
    const { default: apiClient, getApiConfigState, isApiConfigured } = await import('@/lib/axios');

    expect(getApiConfigState()).toEqual({
      status: 'ok',
      baseUrl: 'https://smart-ai-backend-twe5.onrender.com/api',
    });
    expect(isApiConfigured()).toBe(true);
    expect(apiClient.defaults.baseURL).toBe(
      'https://smart-ai-backend-twe5.onrender.com/api'
    );
  });
});
