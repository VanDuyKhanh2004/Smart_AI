import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from '@/components/ProtectedRoute';
import AdminRoute from '@/components/AdminRoute';
import Layout from '@/components/Layout';
import AdminLayout from '@/components/AdminLayout';
import { PageLoader } from '@/components/ui/page-loader';

const LoginPage = lazy(() => import('@/features/auth/pages/LoginPage'));
const RegisterPage = lazy(() => import('@/features/auth/pages/RegisterPage'));
const VerifyEmailPage = lazy(() => import('@/features/auth/pages/VerifyEmailPage'));
const ForgotPasswordPage = lazy(() => import('@/features/auth/pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/features/auth/pages/ResetPasswordPage'));
const ProductListPage = lazy(() => import('@/features/products/pages/ProductListPage'));
const ProductDetailPage = lazy(() => import('@/features/products/pages/ProductDetailPage'));
const CartPage = lazy(() => import('@/features/cart/pages/CartPage'));
const WishlistPage = lazy(() => import('@/features/wishlist/pages/WishlistPage'));
const ComplaintListPage = lazy(() =>
  import('@/features/complaints/pages/ComplaintListPage').then((m) => ({
    default: m.ComplaintListPage,
  }))
);
const AdminProductPage = lazy(() =>
  import('@/features/admin/pages/AdminProductPage').then((m) => ({
    default: m.AdminProductPage,
  }))
);
const CheckoutPage = lazy(() => import('@/features/orders/pages/CheckoutPage'));
const OrderHistoryPage = lazy(() =>
  import('@/features/orders/pages/OrderHistoryPage').then((m) => ({
    default: m.OrderHistoryPage,
  }))
);
const OrderDetailPage = lazy(() =>
  import('@/features/orders/pages/OrderDetailPage').then((m) => ({
    default: m.OrderDetailPage,
  }))
);
const ComparePage = lazy(() => import('@/features/compare/pages/ComparePage'));
const CompareHistoryPage = lazy(() => import('@/features/compare/pages/CompareHistoryPage'));
const AdminDashboardPage = lazy(() =>
  import('@/features/admin/pages/AdminDashboardPage').then((m) => ({
    default: m.AdminDashboardPage,
  }))
);
const AdminOrderPage = lazy(() =>
  import('@/features/orders/pages/AdminOrderPage').then((m) => ({
    default: m.AdminOrderPage,
  }))
);
const AdminReviewsPage = lazy(() =>
  import('@/features/admin/pages/AdminReviewsPage').then((m) => ({
    default: m.AdminReviewsPage,
  }))
);
const AdminQAPage = lazy(() =>
  import('@/features/admin/pages/AdminQAPage').then((m) => ({
    default: m.AdminQAPage,
  }))
);
const AdminPromotionPage = lazy(() =>
  import('@/features/admin/pages/AdminPromotionPage').then((m) => ({
    default: m.AdminPromotionPage,
  }))
);
const ProfilePage = lazy(() => import('@/features/profile/pages/ProfilePage'));
const AddressManagementPage = lazy(() =>
  import('@/features/addresses/pages/AddressManagementPage').then((m) => ({
    default: m.AddressManagementPage,
  }))
);
const StoreLocatorPage = lazy(() => import('@/features/stores/pages/StoreLocatorPage'));
const MyAppointmentsPage = lazy(() => import('@/features/stores/pages/MyAppointmentsPage'));
const AdminStoresPage = lazy(() =>
  import('@/features/admin/pages/AdminStoresPage').then((m) => ({
    default: m.AdminStoresPage,
  }))
);
const AdminAppointmentsPage = lazy(() =>
  import('@/features/admin/pages/AdminAppointmentsPage').then((m) => ({
    default: m.AdminAppointmentsPage,
  }))
);

const AppRouter: React.FC = () => {
  return (
    <Router>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Protected routes with Layout */}
          <Route path="/" element={<Navigate to="/products" replace />} />
          <Route
            path="/products"
            element={
              <Layout>
                <ProductListPage />
              </Layout>
            }
          />
          <Route
            path="/products/:id"
            element={
              <Layout>
                <ProductDetailPage />
              </Layout>
            }
          />
          <Route
            path="/cart"
            element={
              <Layout>
                <CartPage />
              </Layout>
            }
          />
          {/* Wishlist route - Requirements: 1.3 - Protected with auth (redirect to login if not authenticated) */}
          <Route
            path="/wishlist"
            element={
              <ProtectedRoute>
                <Layout>
                  <WishlistPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/complaints"
            element={
              <AdminRoute>
                <AdminLayout>
                  <ComplaintListPage />
                </AdminLayout>
              </AdminRoute>
            }
          />
          <Route
            path="/admin/products"
            element={
              <AdminRoute>
                <AdminLayout>
                  <AdminProductPage />
                </AdminLayout>
              </AdminRoute>
            }
          />
          <Route
            path="/checkout"
            element={
              <ProtectedRoute>
                <Layout>
                  <CheckoutPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders"
            element={
              <ProtectedRoute>
                <Layout>
                  <OrderHistoryPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders/:id"
            element={
              <ProtectedRoute>
                <Layout>
                  <OrderDetailPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          {/* Compare routes - Requirements: 3.1, 5.3 */}
          <Route
            path="/compare"
            element={
              <Layout>
                <ComparePage />
              </Layout>
            }
          />
          <Route
            path="/compare/history"
            element={
              <ProtectedRoute>
                <Layout>
                  <CompareHistoryPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/dashboard"
            element={
              <AdminRoute>
                <AdminLayout>
                  <AdminDashboardPage />
                </AdminLayout>
              </AdminRoute>
            }
          />
          <Route
            path="/admin/orders"
            element={
              <AdminRoute>
                <AdminLayout>
                  <AdminOrderPage />
                </AdminLayout>
              </AdminRoute>
            }
          />
          <Route
            path="/admin/reviews"
            element={
              <AdminRoute>
                <AdminLayout>
                  <AdminReviewsPage />
                </AdminLayout>
              </AdminRoute>
            }
          />
          <Route
            path="/admin/qa"
            element={
              <AdminRoute>
                <AdminLayout>
                  <AdminQAPage />
                </AdminLayout>
              </AdminRoute>
            }
          />
          <Route
            path="/admin/promotions"
            element={
              <AdminRoute>
                <AdminLayout>
                  <AdminPromotionPage />
                </AdminLayout>
              </AdminRoute>
            }
          />

          {/* Profile Management - Requirements: 5.2 */}
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Layout>
                  <ProfilePage />
                </Layout>
              </ProtectedRoute>
            }
          />

          {/* Address Management - Requirements: 2.1 */}
          <Route
            path="/profile/addresses"
            element={
              <ProtectedRoute>
                <Layout>
                  <AddressManagementPage />
                </Layout>
              </ProtectedRoute>
            }
          />

          {/* Store Locator - Requirements: 1.1 */}
          <Route
            path="/stores"
            element={
              <Layout>
                <StoreLocatorPage />
              </Layout>
            }
          />

          {/* My Appointments - Requirements: 5.1 */}
          <Route
            path="/my-appointments"
            element={
              <ProtectedRoute>
                <Layout>
                  <MyAppointmentsPage />
                </Layout>
              </ProtectedRoute>
            }
          />

          {/* Admin Store Management - Requirements: 6.1 */}
          <Route
            path="/admin/stores"
            element={
              <AdminRoute>
                <AdminLayout>
                  <AdminStoresPage />
                </AdminLayout>
              </AdminRoute>
            }
          />

          {/* Admin Appointment Management - Requirements: 7.1 */}
          <Route
            path="/admin/appointments"
            element={
              <AdminRoute>
                <AdminLayout>
                  <AdminAppointmentsPage />
                </AdminLayout>
              </AdminRoute>
            }
          />

          {/* 404 */}
          <Route path="*" element={<div className="text-center py-8">Page not found</div>} />
        </Routes>
      </Suspense>
    </Router>
  );
};

export default AppRouter;
