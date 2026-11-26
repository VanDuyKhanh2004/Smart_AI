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

export interface ResolveBackendOriginOptions extends ResolveApiBaseUrlOptions {
  /**
   * Explicit backend origin (scheme + host only). Used for Socket.IO, Google
   * login and static assets when the REST API is served from the same-origin
   * `/api` proxy and therefore cannot reveal the backend host.
   */
  backendOrigin?: string;
}

export interface ResolveSocketUrlOptions extends ResolveBackendOriginOptions {
  /** Optional Socket.IO server override. Falls back to the backend origin. */
  socketUrl?: string;
}

const ABSOLUTE_SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;
const ABSOLUTE_HTTP_URL_RE = /^https?:\/\//i;
const ANY_SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

function isAbsoluteHttpUrl(value: string): boolean {
  return ABSOLUTE_SCHEME_RE.test(value);
}

function parseAbsoluteHttpUrl(value: string): URL {
  if (!isAbsoluteHttpUrl(value)) {
    throw new ApiConfigError('invalid');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiConfigError('invalid');
  }

  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) {
    throw new ApiConfigError('invalid');
  }

  return url;
}

const ORIGIN_ONLY_ERROR =
  'Expected an absolute HTTP/HTTPS origin without a path, query string or fragment.';

/**
 * Parse an origin-only configuration value. Trailing slashes on the root are
 * normalized, but a non-root path, query string or fragment is rejected rather
 * than silently stripped.
 */
function parseOriginOnly(value: string): string {
  const url = parseAbsoluteHttpUrl(value);

  if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
    throw new ApiConfigError('invalid', ORIGIN_ONLY_ERROR);
  }

  return url.origin;
}

/**
 * A same-origin API path is only meaningful behind the Vercel `/api/*`
 * rewrite. Anything else (e.g. `/private-path`) must keep being rejected.
 */
function normalizeRelativeApiBase(value: string): string | null {
  if (value !== '/api' && !value.startsWith('/api/')) {
    return null;
  }
  return value.replace(/\/+$/, '') || '/api';
}

export function resolveApiBaseUrl(options?: ResolveApiBaseUrlOptions): string {
  const raw = options?.configuredUrl ?? import.meta.env.VITE_API_BASE_URL as string | undefined;
  const isDev = options?.isDev ?? import.meta.env.DEV;
  const frontendOrigin = options?.frontendOrigin ??
    (typeof window !== 'undefined' ? window.location.origin : '');

  const trimmed = typeof raw === 'string' ? raw.trim() : '';

  if (!trimmed) {
    if (isDev) {
      return DEFAULT_DEV_API_BASE;
    }
    throw new ApiConfigError('missing');
  }

  const value = trimmed.replace(/\/+$/, '');

  if (value.startsWith('/')) {
    const relative = normalizeRelativeApiBase(value);
    if (!relative || isDev) {
      throw new ApiConfigError(
        'invalid',
        relative
          ? 'VITE_API_BASE_URL resolves to a same-origin path, which is only valid in production behind the Vercel /api proxy.'
          : undefined
      );
    }
    return relative;
  }

  if (!isAbsoluteHttpUrl(value)) {
    throw new ApiConfigError('invalid');
  }

  const url = parseAbsoluteHttpUrl(value);

  if (frontendOrigin && url.origin === frontendOrigin) {
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

/**
 * Resolve the origin of the actual backend. This must never be derived from a
 * same-origin `/api` REST base: that base points at the Vercel proxy, and
 * Socket.IO, Google login and static assets must talk to the backend directly.
 */
export function resolveBackendOrigin(options?: ResolveBackendOriginOptions): string {
  const explicitRaw = options?.backendOrigin ?? import.meta.env.VITE_BACKEND_ORIGIN ?? '';
  const explicit = typeof explicitRaw === 'string' ? explicitRaw.trim() : '';

  if (explicit) {
    return parseOriginOnly(explicit);
  }

  const base = resolveApiBaseUrl(options);

  if (!base.startsWith('/')) {
    return new URL(base).origin;
  }

  // Same-origin REST proxy configured. The backend host needs an explicit
  // value; legacy deployments may still provide VITE_API_URL.
  const legacyBackendOrigin = (import.meta.env.VITE_API_URL ?? '').trim();
  if (legacyBackendOrigin) {
    return parseOriginOnly(legacyBackendOrigin);
  }

  throw new ApiConfigError(
    'missing',
    'VITE_BACKEND_ORIGIN is required when VITE_API_BASE_URL is a same-origin path like /api. ' +
    'It must point at the backend origin, for example https://<backend-domain>.'
  );
}

/**
 * Resolve the Socket.IO server URL. It deliberately does not consume the REST
 * API base URL: in production the REST base is `/api` (the Vercel proxy) while
 * the socket must connect straight to the backend origin.
 */
export function resolveSocketUrl(options?: ResolveSocketUrlOptions): string {
  const raw = options?.socketUrl ?? import.meta.env.VITE_SOCKET_URL ?? '';
  const trimmed = typeof raw === 'string' ? raw.trim() : '';

  if (trimmed) {
    return parseOriginOnly(trimmed);
  }

  return resolveBackendOrigin(options);
}

/**
 * Turn a stored relative asset path (e.g. `uploads/avatar.png`) into an
 * absolute backend URL. Absolute and data/blob URLs are returned untouched.
 */
export function resolveAssetUrl(
  assetPath?: string | null,
  options?: ResolveBackendOriginOptions
): string | undefined {
  if (!assetPath) {
    return undefined;
  }

  // Protocol-relative URLs already name their own host. Never prepend the
  // backend origin to them.
  if (assetPath.startsWith('//')) {
    return assetPath;
  }

  // Only absolute HTTP/HTTPS URLs are supported pass-through assets.
  if (ABSOLUTE_HTTP_URL_RE.test(assetPath)) {
    return assetPath;
  }

  if (assetPath.startsWith('data:') || assetPath.startsWith('blob:')) {
    return assetPath;
  }

  // Any other scheme (e.g. ftp://) is not a supported asset URL. Reject it
  // instead of passing it through or turning it into a relative path.
  if (ANY_SCHEME_RE.test(assetPath)) {
    throw new ApiConfigError('invalid', 'Unsupported asset URL scheme.');
  }

  const origin = resolveBackendOrigin(options);
  return `${origin}/${assetPath.replace(/^\/+/, '')}`;
}
