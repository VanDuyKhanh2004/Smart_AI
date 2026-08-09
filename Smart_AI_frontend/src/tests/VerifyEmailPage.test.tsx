import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import VerifyEmailPage from '@/features/auth/pages/VerifyEmailPage';
import { authService } from '@/services/auth.service';

vi.mock('@/services/auth.service', () => ({
  authService: {
    verifyEmail: vi.fn(),
    resendVerification: vi.fn(),
  },
}));

describe('VerifyEmailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('confirms successful verification on the existing flow', async () => {
    vi.mocked(authService.verifyEmail).mockResolvedValue({
      success: true,
      message: 'Xac nhan email thanh cong',
    });

    render(
      <MemoryRouter initialEntries={['/verify-email?token=valid-token&email=user@test.com']}>
        <VerifyEmailPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Email da duoc kich hoat')).toBeInTheDocument();
    expect(screen.getByText('Xac nhan email thanh cong')).toBeInTheDocument();
  });

  it('shows an error message for an invalid token on the existing flow', async () => {
    vi.mocked(authService.verifyEmail).mockRejectedValue({
      response: { data: { error: { message: 'Token khong hop le hoac da het han' } } },
    });

    render(
      <MemoryRouter initialEntries={['/verify-email?token=bad-token']}>
        <VerifyEmailPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Token khong hop le hoac da het han')).toBeInTheDocument();
  });

  it('shows the expired-guidance message for VERIFICATION_TOKEN_EXPIRED', async () => {
    vi.mocked(authService.verifyEmail).mockRejectedValue({
      response: { data: { error: { message: 'Liên kết xác nhận đã hết hạn. Vui lòng yêu cầu gửi lại email xác nhận.', code: 'VERIFICATION_TOKEN_EXPIRED' } } },
    });

    render(
      <MemoryRouter initialEntries={['/verify-email?token=expired-token&email=user@test.com']}>
        <VerifyEmailPage />
      </MemoryRouter>
    );

    expect(
      await screen.findByText('Liên kết xác nhận đã hết hạn. Vui lòng yêu cầu gửi lại email xác nhận.')
    ).toBeInTheDocument();
    expect(screen.getByText('Gui lai email xac nhan')).toBeInTheDocument();
  });

  it('shows the invalid-superseded guidance for INVALID_VERIFICATION_TOKEN', async () => {
    vi.mocked(authService.verifyEmail).mockRejectedValue({
      response: { data: { error: { code: 'INVALID_VERIFICATION_TOKEN' } } },
    });

    render(
      <MemoryRouter initialEntries={['/verify-email?token=old-token&email=user@test.com']}>
        <VerifyEmailPage />
      </MemoryRouter>
    );

    expect(
      await screen.findByText('Liên kết xác nhận không còn hợp lệ. Vui lòng sử dụng email xác nhận mới nhất.')
    ).toBeInTheDocument();
    expect(screen.getByText('Gui lai email xac nhan')).toBeInTheDocument();
  });

  it('renders the already-verified state when the server reports ALREADY_VERIFIED', async () => {
    vi.mocked(authService.verifyEmail).mockResolvedValue({
      success: true,
      message: 'Email da duoc kich hoat',
      data: { status: 'ALREADY_VERIFIED' },
    });

    render(
      <MemoryRouter initialEntries={['/verify-email?token=replayed-token&email=user@test.com']}>
        <VerifyEmailPage />
      </MemoryRouter>
    );

    expect((await screen.findAllByText('Email da duoc kich hoat')).length).toBeGreaterThan(0);
    expect(screen.getByText('VERIFIED')).toBeInTheDocument();
    expect(screen.queryByText('Gui lai email xac nhan')).not.toBeInTheDocument();
  });

  it('enters a 60s cooldown after a successful resend and disables the button', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(authService.verifyEmail).mockRejectedValue({
        response: { data: { error: { code: 'VERIFICATION_TOKEN_EXPIRED' } } },
      });
      vi.mocked(authService.resendVerification).mockResolvedValue({
        success: true,
        message: 'Đã gửi lại email xác nhận',
      });

      render(
        <MemoryRouter initialEntries={['/verify-email?token=expired&email=user@test.com']}>
          <VerifyEmailPage />
        </MemoryRouter>
      );

      await act(async () => {});

      fireEvent.click(screen.getByRole('button', { name: 'Gui lai email xac nhan' }));
      await act(async () => {});

      expect(screen.getByRole('button', { name: 'Gửi lại sau 60s' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Gửi lại sau 60s' })).toBeDisabled();
      expect(screen.getByText('Đã gửi lại email xác nhận')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('syncs the countdown label from a backend 429 VERIFICATION_EMAIL_COOLDOWN', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(authService.verifyEmail).mockRejectedValue({
        response: { data: { error: { code: 'VERIFICATION_TOKEN_EXPIRED' } } },
      });
      const cooldownError = Object.assign(new Error('Request failed with status code 429'), {
        response: {
          data: {
            success: false,
            error: { code: 'VERIFICATION_EMAIL_COOLDOWN', message: 'Vui long cho truoc khi gui lai email xac nhan.' },
            data: { retryAfterSeconds: 30 },
          },
        },
      });
      vi.mocked(authService.resendVerification).mockRejectedValue(cooldownError);

      render(
        <MemoryRouter initialEntries={['/verify-email?token=expired&email=user@test.com']}>
          <VerifyEmailPage />
        </MemoryRouter>
      );
      await act(async () => {});

      fireEvent.click(screen.getByRole('button', { name: 'Gui lai email xac nhan' }));
      await act(async () => {});

      expect(screen.getByRole('button', { name: 'Gửi lại sau 30s' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});