import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import RegisterForm from '../components/RegisterForm';
import { useAuthStore } from '@/stores/authStore';

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    // Redirect to home after successful registration (user is auto-logged in)
    if (isAuthenticated && !isLoading) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  // Never unmount the RegisterForm during registration: a `isLoading` gate here
  // would wipe the form's `registeredResult` success state the moment the store
  // toggles loading (submit -> loading -> resolved). Only hide the page once the
  // user is actually verified/authenticated.
  if (isAuthenticated) {
    return null;
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <RegisterForm />
        
        <p className="text-center text-sm text-muted-foreground">
          Đã có tài khoản?{' '}
          <Link 
            to="/login" 
            className="text-primary hover:underline font-medium"
          >
            Đăng nhập
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

export default RegisterPage;
