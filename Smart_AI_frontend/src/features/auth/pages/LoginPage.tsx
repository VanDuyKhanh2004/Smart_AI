import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import LoginForm from '../components/LoginForm';
import { useAuthStore } from '@/stores/authStore';

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

  // Get the redirect path from location state, default to home
  const locationState = location.state as { from?: string | { pathname?: string } } | null;
  const from =
    typeof locationState?.from === 'string'
      ? locationState.from
      : locationState?.from?.pathname || '/';

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
        <div className="absolute inset-0 flex items-center justify-center bg-background/40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}
    </div>
  );
};

export default LoginPage;
