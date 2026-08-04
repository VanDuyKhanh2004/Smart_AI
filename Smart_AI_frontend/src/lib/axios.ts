import axios from 'axios';
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { resolveApiBaseUrl, ApiConfigError, type ApiConfigState } from './apiBaseUrl';

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

let apiConfigState: ApiConfigState;

try {
  apiConfigState = { status: 'ok', baseUrl: resolveApiBaseUrl() };
} catch (error) {
  if (error instanceof ApiConfigError) {
    apiConfigState = { status: error.reason };
  } else {
    throw error;
  }
}

export function getApiConfigState(): ApiConfigState {
  return apiConfigState;
}

export function isApiConfigured(): boolean {
  return apiConfigState.status === 'ok';
}

const apiClient = axios.create({
  baseURL: apiConfigState.status === 'ok' ? apiConfigState.baseUrl : '',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: Error) => void;
}> = [];

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (apiConfigState.status !== 'ok') {
      return Promise.reject(new ApiConfigError(apiConfigState.status));
    }
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    console.error('[API Request Error]', error);
    return Promise.reject(error);
  }
);


function hasHeaderGetMethod(headers: unknown): headers is { get(name: string): unknown } {
  return typeof headers === 'object' && headers !== null &&
    'get' in headers && typeof (headers as Record<string, unknown>).get === 'function';
}

function normalizeHeaderValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return String(value[0] ?? '');
  return String(value);
}

export function isHtmlResponse(response: { headers?: unknown }): boolean {
  const headers = response.headers;
  if (!headers || typeof headers !== 'object') return false;

  const contentType = hasHeaderGetMethod(headers)
    ? headers.get('content-type')
    : (headers as Record<string, unknown>)['content-type'] ?? (headers as Record<string, unknown>)['Content-Type'] ?? '';

  return normalizeHeaderValue(contentType).includes('text/html');
}

apiClient.interceptors.response.use(
  (response) => {
    if (isHtmlResponse(response)) {
      return Promise.reject(new Error(
        'API returned HTML instead of JSON. Check that VITE_API_BASE_URL points to the backend, not the frontend origin.'
      ));
    }
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (originalRequest?.url?.includes('/auth/refresh')) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest?._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${token}`;
              }
              resolve(apiClient(originalRequest));
            },
            reject: (err: Error) => {
              reject(err);
            },
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

      if (!refreshToken) {
        isRefreshing = false;
        clearAuthStorage();
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        const response = await axios.post(
          `${apiClient.defaults.baseURL}/auth/refresh`,
          { refreshToken }
        );

        const { accessToken } = response.data.data;
        localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        }

        processQueue(null, accessToken);
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as Error, null);
        clearAuthStorage();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    if (error.response?.status === 500) {
      console.error('Server error occurred');
    }

    return Promise.reject(error);
  }
);

function clearAuthStorage() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem('user');
}

export default apiClient;
