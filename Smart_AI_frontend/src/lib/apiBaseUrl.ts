const DEFAULT_DEV_API_BASE = 'http://localhost:5000/api';

export type ApiConfigState =
  | { status: 'ok'; baseUrl: string }
  | { status: 'missing' }
  | { status: 'invalid' };

export type ApiConfigErrorReason = Extract<ApiConfigState, { status: 'missing' | 'invalid' }>['status'];

export class ApiConfigError extends Error {
  readonly reason: ApiConfigErrorReason;

  constructor(reason: ApiConfigErrorReason, message?: string) {
    super(
      message ??
        (reason === 'missing'
          ? 'VITE_API_BASE_URL is not set. Configure it in Vercel Project Settings \u2192 Environment Variables: VITE_API_BASE_URL = https://<backend-domain>/api'
          : 'VITE_API_BASE_URL is invalid. Expected an absolute HTTP/HTTPS URL like https://<backend-domain>/api')
    );
    this.name = 'ApiConfigError';
    this.reason = reason;
  }
}


export interface ResolveApiBaseUrlOptions {
  configuredUrl?: string;
  isDev?: boolean;
  frontendOrigin?: string;
}

export function resolveApiBaseUrl(options?: ResolveApiBaseUrlOptions): string {
  const raw = options?.configuredUrl ?? import.meta.env.VITE_API_BASE_URL as string | undefined;
  const isDev = options?.isDev ?? import.meta.env.DEV;
  const frontendOrigin = options?.frontendOrigin ?? window.location.origin;

  const trimmed = typeof raw === 'string' ? raw.trim() : '';

  if (!trimmed) {
    if (isDev) {
      return DEFAULT_DEV_API_BASE;
    }
    throw new ApiConfigError('missing');
  }

  const value = trimmed.replace(/\/+$/, '');

  if (value.startsWith('/') || !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value)) {
    throw new ApiConfigError('invalid');
  }

  const scheme = value.slice(0, value.indexOf(':')).toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') {
    throw new ApiConfigError('invalid');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiConfigError('invalid');
  }

  if (!url.hostname) {
    throw new ApiConfigError('invalid');
  }

  if (url.origin === frontendOrigin) {
    // Same-origin API base URL is allowed in production only when the path
    // is served by the Vercel `/api/*` proxy rewrite to the Render backend.
    // In development there is no such proxy, so same-origin would return
    // the SPA fallback instead of the API response.
    if (isDev || !url.pathname.startsWith('/api/') && url.pathname !== '/api') {
      throw new ApiConfigError(
        'invalid',
        'VITE_API_BASE_URL resolves to the frontend origin. ' +
        'API requests to this URL would be rewritten to index.html by Vercel.'
      );
    }
  }

  return value;
}

export function resolveBackendOrigin(options?: ResolveApiBaseUrlOptions): string {
  return new URL(resolveApiBaseUrl(options)).origin;
}
