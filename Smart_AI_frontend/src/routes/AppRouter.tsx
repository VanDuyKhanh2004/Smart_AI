import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ProductListPage, ProductDetailPage } from '@/features/products';
import { ComplaintListPage } from '@/features/complaints';
import { CartPage } from '@/features/cart';
import { WishlistPage } from '@/features/wishlist';
import { LoginPage, RegisterPage } from '@/features/auth';
import { AdminProductPage, AdminReviewsPage, AdminQAPage, AdminDashboardPage, AdminPromotionPage, AdminStoresPage, AdminAppointmentsPage } from '@/features/admin';
import { CheckoutPage, OrderHistoryPage, AdminOrderPage } from '@/features/orders';
import { ComparePage, CompareHistoryPage } from '@/features/compare';
import { AddressManagementPage } from '@/features/addresses';
import { ProfilePage } from '@/features/profile';
import { StoreLocatorPage, MyAppointmentsPage } from '@/features/stores';
import ProtectedRoute from '@/components/ProtectedRoute';
import AdminRoute from '@/components/AdminRoute';
import Layout from '@/components/Layout';
import AdminLayout from '@/components/AdminLayout';

const AppRouter: React.FC = () => {
  return (
    <Router>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        
        {/* Protected routes with Layout */}
        <Route path="/" element={<Navigate to="/products" replace />} />
        <Route 
          path="/products" 
          element={
            <ProtectedRoute>
              <Layout>
                <ProductListPage />
              </Layout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/products/:id" 
          element={
            <ProtectedRoute>
              <Layout>
                <ProductDetailPage />
              </Layout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/cart" 
          element={
            <ProtectedRoute>
              <Layout>
                <CartPage />
              </Layout>
            </ProtectedRoute>
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
        {/* Compare routes - Requirements: 3.1, 5.3 */}
        <Route 
          path="/compare" 
          element={
            <ProtectedRoute>
              <Layout>
                <ComparePage />
              </Layout>
            </ProtectedRoute>
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
            <ProtectedRoute>
              <Layout>
                <StoreLocatorPage />
              </Layout>
            </ProtectedRoute>
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
    </Router>
  );
};

export default AppRouter;
