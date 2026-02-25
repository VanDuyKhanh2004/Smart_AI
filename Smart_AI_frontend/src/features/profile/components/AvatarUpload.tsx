import React, { useRef, useState } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { profileService } from '@/services/profile.service';
import { useAuthStore } from '@/stores/authStore';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface AvatarUploadProps {
  currentAvatar?: string;
  userName: string;
  onUploadSuccess?: (avatarUrl: string) => void;
  onUploadError?: (error: string) => void;
}

const AvatarUpload: React.FC<AvatarUploadProps> = ({
  currentAvatar,
  userName,
  onUploadSuccess,
  onUploadError,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const updateUserProfile = useAuthStore((state) => state.updateUserProfile);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'Chỉ chấp nhận file ảnh (jpg, png, webp)';
    }
    if (file.size > MAX_FILE_SIZE) {
      return 'Kích thước file không được vượt quá 2MB';
    }
    return null;
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      onUploadError?.(validationError);
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Upload file
    setIsUploading(true);
    setError(null);

    try {
      const response = await profileService.uploadAvatar(file);
      const avatarUrl = response.data.avatar;
      
      // Update auth store
      updateUserProfile({ avatar: avatarUrl });
      
      setPreview(null);
      onUploadSuccess?.(avatarUrl);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload thất bại';
      const axiosError = err as { response?: { data?: { message?: string } } };
      const message = axiosError.response?.data?.message || errorMessage;
      
      setError(message);
      setPreview(null);
      onUploadError?.(message);
    } finally {
      setIsUploading(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const displayAvatar = preview || currentAvatar;
  const avatarSrc = displayAvatar?.startsWith('http') || displayAvatar?.startsWith('data:')
    ? displayAvatar
    : displayAvatar
    ? `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/${displayAvatar}`
    : undefined;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <Avatar 
          className="size-24 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={handleClick}
        >
          {avatarSrc ? (
            <AvatarImage src={avatarSrc} alt={userName} />
          ) : null}
          <AvatarFallback className="text-2xl bg-primary/10 text-primary">
            {getInitials(userName)}
          </AvatarFallback>
        </Avatar>
        
        {isUploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
            <div className="size-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
        aria-label="Upload avatar"
      />

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={isUploading}
      >
        {isUploading ? 'Đang tải...' : 'Đổi ảnh đại diện'}
      </Button>

      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}
    </div>
  );
};

export default AvatarUpload;
