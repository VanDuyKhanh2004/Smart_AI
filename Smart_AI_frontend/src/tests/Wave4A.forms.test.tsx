import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PasswordChangeSection from '@/features/profile/components/PasswordChangeSection';
import LoginForm from '@/features/auth/components/LoginForm';
import RegisterForm from '@/features/auth/components/RegisterForm';
import { AppointmentForm } from '@/features/stores/components/AppointmentForm';
import type { Store } from '@/features/stores/types';

const authMock = vi.hoisted(() => ({
  state: {
    user: null,
    accessToken: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
    errorCode: null,
    login: vi.fn(),
    register: vi.fn(),
    setAuth: vi.fn(),
    clearError: vi.fn(),
    resendVerification: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => authMock.state,
}));

vi.mock('@/features/stores/services/appointmentService', () => ({
  appointmentService: {
    getAvailableSlots: vi.fn(),
    createAppointment: vi.fn(),
  },
}));

beforeAll(() => {
  if (typeof Element.prototype.scrollIntoView !== 'function') {
    Element.prototype.scrollIntoView = () => {};
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  authMock.state.isAuthenticated = false;
  authMock.state.user = null;
  authMock.state.isLoading = false;
  authMock.state.error = null;
  authMock.state.errorCode = null;
});

function makeStore(): Store {
  const businessHour = { open: '08:00', close: '21:00', isClosed: false };
  return {
    id: 's1',
    name: 'Cửa hàng Test',
    address: {
      street: '123 Lê Lợi',
      district: 'Quận 1',
      city: 'Hồ Chí Minh',
      fullAddress: '123 Lê Lợi, Quận 1, Hồ Chí Minh',
    },
    location: { type: 'Point', coordinates: [106.6959, 10.7761] },
    phone: '0123456789',
    email: 'store1@example.com',
    businessHours: {
      monday: businessHour,
      tuesday: businessHour,
      wednesday: businessHour,
      thursday: businessHour,
      friday: businessHour,
      saturday: businessHour,
      sunday: businessHour,
    },
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

describe('W4-A06 password visibility toggles', () => {
  it('exposes named, pressed-state, keyboard-focusable toggles with hidden icons', () => {
    render(<PasswordChangeSection />);

    const names = [
      'Hiển thị mật khẩu hiện tại',
      'Hiển thị mật khẩu mới',
      'Hiển thị mật khẩu xác nhận',
    ];
    for (const name of names) {
      const toggle = screen.getByRole('button', { name });
      expect(toggle).toHaveAttribute('aria-pressed', 'false');
      expect(toggle).not.toHaveAttribute('tabindex', '-1');
      toggle.focus();
      expect(toggle).toHaveFocus();
      expect(toggle.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('flips aria-pressed and switches the field to a visible text input', () => {
    render(<PasswordChangeSection />);

    const toggle = screen.getByRole('button', { name: 'Hiển thị mật khẩu hiện tại' });
    const input = document.getElementById('currentPassword') as HTMLInputElement;
    expect(input.type).toBe('password');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(input.type).toBe('text');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(input.type).toBe('password');
  });
});

describe('W4-A41/W4-A02 invalid-field focus and error association', () => {
  it('focuses the first invalid password field and links its error message', async () => {
    render(<PasswordChangeSection />);

    fireEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

    const input = await screen.findByLabelText('Mật khẩu hiện tại');
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Vui lòng nhập mật khẩu hiện tại');
    expect(screen.getByText('Vui lòng nhập mật khẩu hiện tại')).toHaveAttribute(
      'role',
      'alert',
    );
  });

  it('focuses the first invalid login field, associates its error, and uses autocomplete', async () => {
    render(
      <MemoryRouter>
        <LoginForm />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    const email = await screen.findByLabelText('Email');
    await waitFor(() => expect(email).toHaveFocus());
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('Email là bắt buộc');
    expect(email).toHaveAttribute('required');
    expect(email).toHaveAttribute('autocomplete', 'email');

    const password = screen.getByLabelText('Mật khẩu');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    expect(password).toHaveAttribute('required');

    const form = email.closest('form');
    expect(form).not.toBeNull();
    expect(form).toHaveAttribute('novalidate');
  });

  it('focuses the first invalid register field and links its error message', async () => {
    render(<RegisterForm />);

    fireEvent.click(screen.getByRole('button', { name: 'Đăng ký' }));

    await waitFor(() => {
      const invalid = document.querySelector('[aria-invalid="true"]') as HTMLElement | null;
      expect(invalid).not.toBeNull();
      expect(invalid).toHaveFocus();
    });

    const invalid = document.querySelector('[aria-invalid="true"]') as HTMLElement;
    const describedBy = invalid.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const error = document.getElementById(describedBy as string);
    expect(error).toHaveAttribute('role', 'alert');
  });

  it('focuses the first invalid appointment field even without a native form element', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <AppointmentForm store={makeStore()} isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận đặt lịch' }));

    await waitFor(() => {
      const invalid = document.querySelector('[aria-invalid="true"]') as HTMLElement | null;
      expect(invalid).not.toBeNull();
      expect(invalid).toHaveFocus();
    });

    const invalid = document.querySelector('[aria-invalid="true"]') as HTMLElement;
    expect(invalid.id).toBe('appointment-date');
    const describedBy = invalid.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const error = document.getElementById(describedBy as string);
    expect(error).toHaveAttribute('role', 'alert');
    expect(error).toHaveTextContent('Vui lòng chọn ngày');
  });
});
