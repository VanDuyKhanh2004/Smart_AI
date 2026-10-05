import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

interface AdminRouteProps {
  children: React.ReactNode;
}

const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const location = useLocation();
  const { isAuthenticated, isLoading, hasHydrated, user } = useAuthStore();

  // Show loading spinner while auth hydration (H02-1) or a sign-in flow is in
  // flight — never redirect before initialize() has resolved.
  if (!hasHydrated || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" role="status" aria-label="Đang tải">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="sr-only">Đang tải</span>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Redirect to home if authenticated but not admin
  if (user?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  // Render children if admin
  return <>{children}</>;
};

export default AdminRoute;
