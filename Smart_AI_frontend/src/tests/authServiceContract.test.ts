import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authService } from '@/services/auth.service';

const { mockPost, mockGet, mockDelete } = vi.hoisted(() => ({
  mockPost: vi.fn(),
  mockGet: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock('@/lib/axios', () => ({
  default: { post: mockPost, get: mockGet, delete: mockDelete },
}));

const REGISTER_BODY = {
  success: true,
  message: 'Vui long xac nhan email de kich hoat tai khoan',
  data: {
    email: 'thienhungpham5@gmail.com',
    requiresEmailVerification: true,
    user: {
      _id: '507f1f77bcf86cd799439011',
      name: 'Phạm Hùng Thiên',
      email: 'thienhungpham5@gmail.com',
      role: 'user' as const,
      emailVerified: false,
      loginMethod: 'password' as const,
      createdAt: '2026-08-08T00:00:00.000Z',
      updatedAt: '2026-08-08T00:00:00.000Z',
    },
  },
};

describe('authService.register runtime contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockReset();
  });

  it('returns the exact backend response body (no extra response.data unwrap)', async () => {
    mockPost.mockResolvedValue({ data: REGISTER_BODY });

    const result = await authService.register({
      name: 'Phạm Hùng Thiên',
      email: 'thienhungpham5@gmail.com',
      password: 'password123',
    });

    expect(result).toEqual(REGISTER_BODY);
    expect(result.data.email).toBe('thienhungpham5@gmail.com');
    expect(result.data.requiresEmailVerification).toBe(true);
    expect(result.data.user.emailVerified).toBe(false);
    expect(mockPost).toHaveBeenCalledWith(
      '/auth/register',
      { name: 'Phạm Hùng Thiên', email: 'thienhungpham5@gmail.com', password: 'password123' }
    );
  });

  it('keeps message and data fields at the top level of the returned body', async () => {
    mockPost.mockResolvedValue({ data: REGISTER_BODY });

    const result = await authService.register({
      name: 'Phạm Hùng Thiên',
      email: 'thienhungpham5@gmail.com',
      password: 'password123',
    });

    expect(result.message).toBe(REGISTER_BODY.message);
    expect(result.data).toBeDefined();
    expect(result.data.requiresEmailVerification).toBe(true);
  });
});