import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ProfileInfoSection from '../components/ProfileInfoSection';
import PasswordChangeSection from '../components/PasswordChangeSection';
import { useAuthStore } from '@/stores/authStore';

/**
 * ProfilePage - Main profile management page with tabs
 * Requirements: 5.3 - Show tabs for "Thông tin cá nhân", "Địa chỉ giao hàng", "Đổi mật khẩu"
 */
const ProfilePage: React.FC = () => {
  const { user, isLoading } = useAuthStore();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSuccess = (message: string) => {
    showToast(message, 'success');
  };

  const handleError = (message: string) => {
    showToast(message, 'error');
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="py-8 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Error state - user not found
  if (!user) {
    return (
      <div className="py-8 text-center">
        <p className="text-muted-foreground">Không thể tải thông tin người dùng</p>
        <Link to="/login">
          <Button variant="link">Đăng nhập lại</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="py-6 max-w-4xl mx-auto">
      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-md shadow-lg ${
            toast.type === 'success'
              ? 'bg-green-100 text-green-800 border border-green-200'
              : 'bg-red-100 text-red-800 border border-red-200'
          }`}
        >
          {toast.message}
        </div>
      )}

      <h1 className="text-2xl font-bold mb-6">Quản lý tài khoản</h1>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="profile">Thông tin cá nhân</TabsTrigger>
          <TabsTrigger value="addresses">Địa chỉ giao hàng</TabsTrigger>
          <TabsTrigger value="password">Đổi mật khẩu</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileInfoSection onSuccess={handleSuccess} onError={handleError} />
        </TabsContent>

        <TabsContent value="addresses">
          <Card>
            <CardHeader>
              <CardTitle>Địa chỉ giao hàng</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Quản lý địa chỉ giao hàng của bạn để thanh toán nhanh hơn.
              </p>
              <Link to="/profile/addresses">
                <Button>Quản lý địa chỉ</Button>
              </Link>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="password">
          <PasswordChangeSection onSuccess={handleSuccess} onError={handleError} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ProfilePage;
