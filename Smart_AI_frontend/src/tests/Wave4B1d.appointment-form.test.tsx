import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppointmentForm } from '@/features/stores/components/AppointmentForm';
import type { Store, TimeSlot } from '@/features/stores/types';

// The user object must be referentially stable: AppointmentForm prefill
// effect depends on [isAuthenticated, user] and would loop otherwise.
vi.mock('@/stores/authStore', () => {
  const user = { name: 'Test User', email: 't@example.com', phone: '0123456789' };
  return {
    useAuthStore: () => ({ user, isAuthenticated: true }),
  };
});

const mockGetAvailableSlots = vi.fn();
const mockCreateAppointment = vi.fn();

vi.mock('@/features/stores/services/appointmentService', () => ({
  appointmentService: {
    getAvailableSlots: (...args: unknown[]) => mockGetAvailableSlots(...args),
    createAppointment: (...args: unknown[]) => mockCreateAppointment(...args),
  },
}));

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

const SLOTS: TimeSlot[] = [
  { start: '10:00', end: '10:30' },
  { start: '10:30', end: '11:00' },
];

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AppointmentForm
        store={makeStore()}
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    </QueryClientProvider>
  );
}

function dateInput(): HTMLInputElement {
  return document.querySelector('input[type="date"]') as HTMLInputElement;
}

async function selectPurpose(label: string) {
  fireEvent.click(screen.getByRole('combobox'));
  fireEvent.click(await screen.findByRole('option', { name: label }));
}

beforeAll(() => {
  if (typeof Element.prototype.scrollIntoView !== 'function') {
    Element.prototype.scrollIntoView = () => {};
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateAppointment.mockResolvedValue({ success: true, message: 'ok', data: {} });
  mockGetAvailableSlots.mockResolvedValue({
    success: true,
    data: {
      date: '2099-12-25',
      purpose: 'consultation',
      store: { id: 's1', name: 'Cửa hàng Test' },
      slots: SLOTS,
    },
  });
});

describe('Slot region live semantics (M11, M12)', () => {
  it('announces slot loading through role="status"', async () => {
    mockGetAvailableSlots.mockReturnValue(new Promise(() => undefined) as never);
    renderForm();

    fireEvent.change(dateInput(), { target: { value: '2099-12-25' } });
    await selectPurpose('Tư vấn sản phẩm');

    expect(screen.getByRole('status')).toHaveTextContent('Đang tải khung giờ');
    expect(mockGetAvailableSlots).toHaveBeenCalled();
  });

  it('exposes the slot fetch failure as role="alert"', async () => {
    mockGetAvailableSlots.mockRejectedValue(new Error('slots down'));
    renderForm();

    fireEvent.change(dateInput(), { target: { value: '2099-12-25' } });
    await selectPurpose('Tư vấn sản phẩm');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Không thể tải khung giờ. Vui lòng thử lại.');
  });

  it('announces the loaded slot count through the persistent status region', async () => {
    renderForm();

    fireEvent.change(dateInput(), { target: { value: '2099-12-25' } });
    await selectPurpose('Tư vấn sản phẩm');

    expect(await screen.findByText('10:00 - 10:30')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('2 khung giờ trống');
  });
});

describe('Slot selection state (S03)', () => {
  it('toggles aria-pressed on slot buttons', async () => {
    renderForm();

    fireEvent.change(dateInput(), { target: { value: '2099-12-25' } });
    await selectPurpose('Tư vấn sản phẩm');

    const first = await screen.findByRole('button', { name: '10:00 - 10:30' });
    const second = screen.getByRole('button', { name: '10:30 - 11:00' });
    expect(first).toHaveAttribute('aria-pressed', 'false');
    expect(second).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(first);
    expect(first).toHaveAttribute('aria-pressed', 'true');
    expect(second).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(second);
    expect(first).toHaveAttribute('aria-pressed', 'false');
    expect(second).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Preserved Wave 4A behavior', () => {
  it('does not fetch slots until a purpose is selected', () => {
    renderForm();

    fireEvent.change(dateInput(), { target: { value: '2099-12-25' } });

    expect(
      screen.getByText('Vui lòng chọn mục đích để xem khung giờ phù hợp')
    ).toBeInTheDocument();
    expect(mockGetAvailableSlots).not.toHaveBeenCalled();
  });

  it('still focuses the first invalid field after a failed submit (W4-A41)', async () => {
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận đặt lịch' }));

    const firstInvalid = document.getElementById('appointment-date');
    expect(firstInvalid).toHaveAttribute('aria-invalid', 'true');
    expect(firstInvalid).toHaveFocus();
    expect(
      screen.getByText('Vui lòng chọn ngày')
    ).toHaveAttribute('role', 'alert');
  });
});
