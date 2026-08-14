import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { AppointmentForm } from '@/features/stores/components/AppointmentForm';
import type { Store, TimeSlot, AppointmentPurpose } from '@/features/stores/types';

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: null, isAuthenticated: false }),
}));

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

function slotsFor(purpose: AppointmentPurpose): TimeSlot[] {
  if (purpose === 'warranty') {
    return [
      { start: '10:00', end: '11:00' },
      { start: '11:00', end: '12:00' },
    ];
  }
  return [
    { start: '10:00', end: '10:30' },
    { start: '10:30', end: '11:00' },
  ];
}

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

async function selectPurpose(label: string) {
  fireEvent.click(screen.getByRole('combobox'));
  fireEvent.click(await screen.findByRole('option', { name: label }));
}

describe('AppointmentForm — purpose-aware slots', () => {
  beforeAll(() => {
    if (typeof Element.prototype.scrollIntoView !== 'function') {
      Element.prototype.scrollIntoView = () => {};
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAppointment.mockResolvedValue({ success: true, message: 'ok', data: {} });
    mockGetAvailableSlots.mockImplementation((storeId: string, date: string, purpose: AppointmentPurpose) =>
      Promise.resolve({
        success: true,
        data: {
          date,
          purpose,
          store: { id: storeId, name: 'Cửa hàng Test' },
          slots: slotsFor(purpose),
        },
      })
    );
  });

  function dateInput(): HTMLInputElement {
    return document.querySelector('input[type="date"]') as HTMLInputElement;
  }

  it('does not fetch slots until a purpose is selected', async () => {
    renderForm();

    fireEvent.change(dateInput(), { target: { value: '2099-12-25' } });

    expect(await screen.findByText('Vui lòng chọn mục đích để xem khung giờ phù hợp')).toBeInTheDocument();
    expect(mockGetAvailableSlots).not.toHaveBeenCalled();
  });

  it('shows the full slot range on each button', async () => {
    renderForm();
    fireEvent.change(dateInput(), { target: { value: '2099-12-25' } });

    await selectPurpose('Tư vấn sản phẩm');

    expect(await screen.findByText('10:00 - 10:30')).toBeInTheDocument();
    expect(mockGetAvailableSlots).toHaveBeenCalledWith('s1', '2099-12-25', 'consultation');
  });

  it('refetches and refreshes the slot list when the purpose changes', async () => {
    renderForm();
    fireEvent.change(dateInput(), { target: { value: '2099-12-25' } });

    await selectPurpose('Bảo hành');
    expect(await screen.findByText('10:00 - 11:00')).toBeInTheDocument();
    expect(mockGetAvailableSlots).toHaveBeenLastCalledWith('s1', '2099-12-25', 'warranty');

    await selectPurpose('Tư vấn sản phẩm');

    await waitFor(() => {
      expect(mockGetAvailableSlots).toHaveBeenLastCalledWith('s1', '2099-12-25', 'consultation');
    });
    expect(await screen.findByText('10:00 - 10:30')).toBeInTheDocument();
    expect(screen.queryByText('10:00 - 11:00')).not.toBeInTheDocument();
  });
});
