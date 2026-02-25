export interface UserProfile {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  role: 'user' | 'admin';
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProfileRequest {
  name: string;
  phone?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ProfileResponse {
  success: boolean;
  data: UserProfile;
}

export interface ChangePasswordResponse {
  success: boolean;
  message: string;
}

export interface AvatarUploadResponse {
  success: boolean;
  data: {
    avatar: string;
  };
}
