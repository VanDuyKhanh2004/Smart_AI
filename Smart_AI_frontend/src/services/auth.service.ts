import apiClient from '@/lib/axios';
import type {
  AuthResponse,
  TokenResponse,
  LoginRequest,
  RegisterRequest,
  User,
} from '@/types/auth.type';

export const authService = {
  async login(data: LoginRequest): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/auth/login', data);
    return response.data;
  },

  async register(data: RegisterRequest): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/auth/register', data);
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
};
