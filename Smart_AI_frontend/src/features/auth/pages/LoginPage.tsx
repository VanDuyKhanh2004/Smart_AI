import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import LoginForm from '../components/LoginForm';
import { useAuthStore } from '@/stores/authStore';

type FromState = string | { pathname?: string; search?: string; hash?: string } | undefined;

/**
 * H02-2: rebuild the full location (pathname + search + hash) from the
 * preserved Location object. String values are already complete and pass
 * through unchanged.
 */
function resolveFromTarget(from: FromState): string | null {
  if (typeof from === 'string') return from;
  if (from?.pathname) return `${from.pathname}${from.search ?? ''}${from.hash ?? ''}`;
  return null;
}

/**
 * H14-1: validate the ?returnTo= value written by the terminal-401 hard
 * redirect. Only same-document route locations are accepted: a single leading
 * '/' (never protocol-relative or backslash paths), and never the login page
 * itself, which would create a redirect loop.
 */
function sanitizeReturnTo(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null;
  const pathname = raw.split(/[?#]/)[0];
  if (pathname === '/login') return null;
  return raw;
}

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated, isLoading } = useAuthStore();

  // Session-expired banner from axios hard redirect (?expired=1) — ERR-01
  const [sessionExpired, setSessionExpired] = useState(
    () => searchParams.get('expired') === '1'
  );

  // Clean expired flag from URL after first read so refresh does not stick forever
  useEffect(() => {
    if (searchParams.get('expired') === '1') {
      const next = new URLSearchParams(searchParams);
      next.delete('expired');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (searchParams.get('expired') === '1') {
      setSessionExpired(true);
    }
  }, [searchParams]);

  // Return target: the in-app redirect state (state.from) wins, then the
  // ?returnTo= value written by the terminal-401 hard redirect (H14-1),
  // else home. Preserves pathname + search + hash (H02-2).
  const locationState = location.state as { from?: FromState } | null;
  const from =
    resolveFromTarget(locationState?.from) ??
    sanitizeReturnTo(searchParams.get('returnTo')) ??
    '/';

  useEffect(() => {
    // Redirect if already authenticated
    if (isAuthenticated && !isLoading) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, from]);

  // Don't unmount LoginForm while a request is in flight: keep the form mounted
  // (disabled by the form itself) and overlay a loader instead, so form state
  // and error/success UI are never wiped mid-request.
  if (isAuthenticated) {
    return null;
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        {sessionExpired && (
          <Alert variant="destructive" role="alert">
            <AlertCircle className="size-4" aria-hidden="true" />
            <AlertTitle>Phiên đăng nhập đã hết hạn</AlertTitle>
            <AlertDescription>
              Phiên đăng nhập của bạn đã hết hạn. Vui lòng đăng nhập lại để tiếp
              tục.
            </AlertDescription>
          </Alert>
        )}

        <LoginForm />
        
        <p className="text-center text-sm text-muted-foreground">
          Chưa có tài khoản?{' '}
          <Link 
            to="/register" 
            className="text-primary hover:underline font-medium"
          >
            Đăng ký ngay
          </Link>
        </p>
      </div>

      {isLoading && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-background/40"
          role="status"
          aria-label="Đang tải"
        >
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="sr-only">Đang tải</span>
        </div>
      )}
    </div>
  );
};

export default LoginPage;
