import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { profileService } from '@/services/profile.service';
import { useAuthStore } from '@/stores/authStore';
import AvatarUpload from './AvatarUpload';

interface FormErrors {
  name?: string;
  phone?: string;
}

interface ProfileInfoSectionProps {
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

const ProfileInfoSection: React.FC<ProfileInfoSectionProps> = ({
  onSuccess,
  onError,
}) => {
  const user = useAuthStore((state) => state.user);
  const updateUserProfile = useAuthStore((state) => state.updateUserProfile);

  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [errors, setErrors] = useState<FormErrors>({});

  // Sync form with user data when it changes
  useEffect(() => {
    if (user) {
      setName(user.name);
      setPhone(user.phone || '');
    }
  }, [user]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!name.trim()) {
      newErrors.name = 'Tên là bắt buộc';
    } else if (name.trim().length < 2) {
      newErrors.name = 'Tên phải có ít nhất 2 ký tự';
    }

    if (phone && !/^[0-9]{10,11}$/.test(phone)) {
      newErrors.phone = 'Số điện thoại phải có 10-11 chữ số';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCancel = () => {
    setName(user?.name || '');
    setPhone(user?.phone || '');
    setErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await profileService.updateProfile({
        name: name.trim(),
        phone: phone || undefined,
      });

      // Update auth store
      updateUserProfile({
        name: response.data.name,
        phone: response.data.phone,
      });

      onSuccess?.('Cập nhật thông tin thành công');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Cập nhật thất bại';
      const axiosError = err as { response?: { data?: { message?: string } } };
      const message = axiosError.response?.data?.message || errorMessage;
      onError?.(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAvatarSuccess = () => {
    onSuccess?.('Cập nhật ảnh đại diện thành công');
  };

  const handleAvatarError = (error: string) => {
    onError?.(error);
  };

  if (!user) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Thông tin cá nhân</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col md:flex-row gap-8">
          {/* Avatar Section */}
          <div className="flex justify-center md:justify-start">
            <AvatarUpload
              currentAvatar={user.avatar}
              userName={user.name}
              onUploadSuccess={handleAvatarSuccess}
              onUploadError={handleAvatarError}
            />
          </div>

          {/* Form Section */}
          <form onSubmit={handleSubmit} className="flex-1 space-y-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Họ và tên
              </label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errors.name) {
                    setErrors((prev) => ({ ...prev, name: undefined }));
                  }
                }}
                disabled={isLoading}
                aria-invalid={!!errors.name}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email
                <span className="ml-2 text-xs text-muted-foreground">(không thể thay đổi)</span>
              </label>
              <Input
                id="email"
                type="email"
                value={user.email}
                disabled
                className="bg-muted"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="phone" className="text-sm font-medium">
                Số điện thoại
              </label>
              <Input
                id="phone"
                type="tel"
                placeholder="0901234567"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (errors.phone) {
                    setErrors((prev) => ({ ...prev, phone: undefined }));
                  }
                }}
                disabled={isLoading}
                aria-invalid={!!errors.phone}
              />
              {errors.phone && (
                <p className="text-sm text-destructive">{errors.phone}</p>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Đang lưu...' : 'Lưu thay đổi'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={isLoading}
              >
                Hủy
              </Button>
            </div>
          </form>
        </div>
      </CardContent>
    </Card>
  );
};

export default ProfileInfoSection;
