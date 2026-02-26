import apiClient from '@/lib/axios';
import type {
  AuthResponse,
  RegisterResponse,
  TokenResponse,
  LoginRequest,
  RegisterRequest,
  ResendVerificationRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  User,
} from '@/types/auth.type';

export const authService = {
  async login(data: LoginRequest): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/auth/login', data);
    return response.data;
  },

  async register(data: RegisterRequest): Promise<RegisterResponse> {
    const response = await apiClient.post<RegisterResponse>('/auth/register', data);
    return response.data;
  },

  async logout(): Promise<void> {
    await apiClient.post('/auth/logout');
  },

  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    const response = await apiClient.post<TokenResponse>('/auth/refresh', {
      refreshToken,
    });
    return response.data;
  },

  async getMe(): Promise<User> {
    const response = await apiClient.get<{ success: boolean; data: { user: User } }>('/auth/me');
    return response.data.data.user;
  },

  async verifyEmail(token: string, email?: string): Promise<{ success: boolean; message: string }> {
    const emailParam = email ? `&email=${encodeURIComponent(email)}` : '';
    const response = await apiClient.get<{ success: boolean; message: string }>(
      `/auth/verify-email?token=${encodeURIComponent(token)}${emailParam}`
    );
    return response.data;
  },

  async resendVerification(data: ResendVerificationRequest): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.post<{ success: boolean; message: string }>(
      '/auth/resend-verification',
      data
    );
    return response.data;
  },

  async forgotPassword(data: ForgotPasswordRequest): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.post<{ success: boolean; message: string }>(
      '/auth/forgot-password',
      data
    );
    return response.data;
  },

  async resetPassword(data: ResetPasswordRequest): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.post<{ success: boolean; message: string }>(
      '/auth/reset-password',
      data
    );
    return response.data;
  },
};
