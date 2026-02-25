import React, { useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import LoginForm from '../components/LoginForm';
import { useAuthStore } from '@/stores/authStore';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading } = useAuthStore();
  
  // Get the redirect path from location state, default to home
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  useEffect(() => {
    // Redirect if already authenticated
    if (isAuthenticated && !isLoading) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, from]);

  // Show loading while checking auth state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Don't render login form if already authenticated
  if (isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
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
    </div>
  );
};

export default LoginPage;
