import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { MyAppointmentsPage } from '@/features/stores/pages/MyAppointmentsPage';
import { appointmentService } from '@/features/stores/services/appointmentService';
import type { Appointment, Store } from '@/features/stores/types';

vi.mock('@/features/stores/services/appointmentService', () => ({
  appointmentService: {
    getMyAppointments: vi.fn(),
    cancelAppointment: vi.fn(),
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

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'apt-1',
    store: makeStore(),
    date: '2099-12-25',
    timeSlot: { start: '10:00', end: '10:30' },
    purpose: 'consultation',
    status: 'pending',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function listResponse(appointments: Appointment[]) {
  return { success: true, data: appointments };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/my-appointments']}>
        <MyAppointmentsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function openCancelDialog() {
  fireEvent.click(await screen.findByRole('button', { name: 'Hủy lịch hẹn' }));
  await screen.findByRole('button', { name: 'Xác nhận hủy' });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Loading and fetch-error feedback (M06, M07)', () => {
  it('announces the loading skeleton through role="status" and marks refresh busy', () => {
    vi.mocked(appointmentService.getMyAppointments).mockReturnValue(
      new Promise(() => undefined) as never
    );

    renderPage();

    expect(
      screen.getByRole('status', { name: 'Đang tải lịch hẹn' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Làm mới' })).toHaveAttribute(
      'aria-busy',
      'true'
    );
  });

  it('exposes the list fetch failure as role="alert" with a retry action', async () => {
    vi.mocked(appointmentService.getMyAppointments).mockRejectedValue(
      new Error('network down')
    );

    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Đã xảy ra lỗi khi tải danh sách lịch hẹn');
    expect(
      screen.getByRole('button', { name: 'Thử lại' })
    ).toBeInTheDocument();
  });
});

describe('Successful cancellation feedback (M08, S02)', () => {
  it('announces success through role="status", flips the badge to Đã hủy, and restores focus to the card', async () => {
    vi.mocked(appointmentService.getMyAppointments).mockResolvedValue(
      listResponse([makeAppointment()])
    );
    vi.mocked(appointmentService.cancelAppointment).mockResolvedValue({
      success: true,
      data: { ...makeAppointment(), status: 'cancelled' },
    } as never);

    renderPage();

    await openCancelDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận hủy' }));

    const title = await screen.findByText('Đã hủy lịch hẹn thành công');
    const successAlert = title.closest('[role="status"]');
    expect(successAlert).not.toBeNull();
    expect(successAlert).toHaveAttribute('role', 'status');
    expect(screen.getByText('Đã hủy')).toBeInTheDocument();

    await waitFor(() => {
      expect(document.getElementById('appointment-card-apt-1')).toHaveFocus();
    });
    expect(document.body).not.toBe(document.activeElement);
  });
});

describe('Cancellation failure does not collapse the list (M09)', () => {
  it('keeps the appointment list rendered and reports the error inside the dialog', async () => {
    vi.mocked(appointmentService.getMyAppointments).mockResolvedValue(
      listResponse([makeAppointment()])
    );
    vi.mocked(appointmentService.cancelAppointment).mockRejectedValue(
      new Error('cancel failed')
    );

    renderPage();

    await openCancelDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận hủy' }));

    const dialog = await screen.findByRole('dialog');
    const alert = within(dialog).getByRole('alert');
    expect(alert).toHaveTextContent('Không thể hủy lịch hẹn. Vui lòng thử lại.');

    // The appointment list stays rendered — no fetch-level error state.
    const card = document.getElementById('appointment-card-apt-1');
    expect(card).toBeInTheDocument();
    expect(card).toHaveTextContent('Cửa hàng Test');
    expect(within(card as HTMLElement).getByText('Chờ xác nhận')).toBeInTheDocument();
    expect(
      screen.queryByText('Đã xảy ra lỗi khi tải danh sách lịch hẹn')
    ).not.toBeInTheDocument();
    expect(appointmentService.getMyAppointments).toHaveBeenCalledTimes(1);
  });
});

describe('Filter and refresh semantics (M10, S01, S06)', () => {
  it('names the status filter and announces the filtered count', async () => {
    vi.mocked(appointmentService.getMyAppointments).mockResolvedValue(
      listResponse([makeAppointment()])
    );

    renderPage();

    expect(
      screen.getByRole('combobox', { name: 'Lọc theo trạng thái' })
    ).toBeInTheDocument();

    const count = await screen.findByText('Hiển thị 1 / 1 lịch hẹn');
    expect(count).toHaveAttribute('role', 'status');
  });

  it('keeps refresh aria-busy in sync with loading on manual refresh', async () => {
    vi.mocked(appointmentService.getMyAppointments).mockResolvedValueOnce(
      listResponse([makeAppointment()])
    );

    renderPage();

    const refresh = await screen.findByRole('button', { name: 'Làm mới' });
    expect(refresh).toHaveAttribute('aria-busy', 'false');

    vi.mocked(appointmentService.getMyAppointments).mockReturnValueOnce(
      new Promise(() => undefined) as never
    );
    fireEvent.click(refresh);

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Làm mới' })
      ).toHaveAttribute('aria-busy', 'true')
    );
  });
});
