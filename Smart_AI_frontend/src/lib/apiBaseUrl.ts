const DEFAULT_DEV_API_BASE = 'http://localhost:5000/api';

export interface ResolveApiBaseUrlOptions {
  configuredUrl?: string;
  isDev?: boolean;
  frontendOrigin?: string;
}

export function resolveApiBaseUrl(options?: ResolveApiBaseUrlOptions): string {
  const raw = options?.configuredUrl ?? import.meta.env.VITE_API_BASE_URL as string | undefined;
  const isDev = options?.isDev ?? import.meta.env.DEV;
  const frontendOrigin = options?.frontendOrigin ?? window.location.origin;

  if (!raw || !raw.trim()) {
    if (isDev) {
      return DEFAULT_DEV_API_BASE;
    }
    throw new Error(
      'VITE_API_BASE_URL is not set. Configure it in Vercel Project Settings \u2192 Environment Variables:\n' +
      'VITE_API_BASE_URL = https://smart-ai-backend-twe5.onrender.com/api'
    );
  }

  const value = raw.trim().replace(/\/+$/, '');

  if (value.startsWith('/') || !value.includes('://')) {
    throw new Error(
      `VITE_API_BASE_URL must be an absolute HTTP/HTTPS URL. Got: "${raw.trim()}"`
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      `VITE_API_BASE_URL is not a valid URL: "${raw.trim()}". ` +
      'Expected an absolute HTTP/HTTPS URL like https://backend.example.com/api'
    );
  }

  if (!url.hostname) {
    throw new Error(
      `VITE_API_BASE_URL is not a valid URL: "${raw.trim()}". ` +
      'Expected an absolute HTTP/HTTPS URL like https://backend.example.com/api'
    );
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(
      `VITE_API_BASE_URL must use http: or https: protocol. Got: "${raw.trim()}"`
    );
  }

  if (url.origin === frontendOrigin) {
    throw new Error(
      'VITE_API_BASE_URL resolves to the frontend origin. ' +
      'API requests to this URL would be rewritten to index.html by Vercel.'
    );
  }

  return value;
}

export function resolveBackendOrigin(options?: ResolveApiBaseUrlOptions): string {
  return new URL(resolveApiBaseUrl(options)).origin;
}