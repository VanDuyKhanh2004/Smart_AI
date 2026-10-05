import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StoreLocatorPage } from '@/features/stores/pages/StoreLocatorPage';
import { StoreCard } from '@/features/stores/components/StoreCard';
import { StoreDetailModal } from '@/features/stores/components/StoreDetailModal';
import { storeService } from '@/features/stores/services/storeService';
import { appointmentService } from '@/features/stores/services/appointmentService';
import type { Store, StoreWithDistance } from '@/features/stores/types';

vi.mock('@/features/stores/services/storeService', () => ({
  storeService: {
    getAllStores: vi.fn(),
  },
}));

vi.mock('@/features/stores/services/appointmentService', () => ({
  appointmentService: {
    getAvailableSlots: vi.fn(),
    createAppointment: vi.fn(),
  },
}));

// The user object must be referentially stable: AppointmentForm prefill
// effect depends on [isAuthenticated, user] and would loop otherwise.
vi.mock('@/stores/authStore', () => {
  const user = { name: 'Test User', email: 't@example.com', phone: '0123456789' };
  return {
    useAuthStore: () => ({ user, isAuthenticated: true }),
  };
});

vi.mock('@/features/stores/utils/openingHours', () => ({
  STORE_TIMEZONE: 'Asia/Ho_Chi_Minh',
  getStoreOpenStatus: () => ({ isOpen: true, today: 'monday' }),
}));

function makeStore(overrides: Partial<Store> = {}): Store {
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
    ...overrides,
  };
}

function storesResponse(stores: Store[]) {
  return { success: true, data: stores };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <StoreLocatorPage />
    </QueryClientProvider>
  );
}

function dateInput(): HTMLInputElement {
  return document.querySelector('input[type="date"]') as HTMLInputElement;
}

beforeAll(() => {
  if (typeof Element.prototype.scrollIntoView !== 'function') {
    Element.prototype.scrollIntoView = () => {};
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: undefined,
  });
});

afterEach(() => {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: undefined,
  });
});

describe('Store locator loading and error feedback (M01–M03)', () => {
  it('announces the initial loading state through role="status"', () => {
    vi.mocked(storeService.getAllStores).mockReturnValue(
      new Promise(() => undefined) as never
    );

    renderPage();

    expect(
      screen.getByRole('status', { name: 'Đang tải danh sách cửa hàng' })
    ).toBeInTheDocument();
  });

  it('exposes the fetch failure as role="alert" and retries via refetch without reloading', async () => {
    vi.mocked(storeService.getAllStores)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(storesResponse([makeStore()]));

    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Không thể tải danh sách cửa hàng');

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(
      await screen.findByRole('button', { name: 'Chọn cửa hàng Cửa hàng Test' })
    ).toBeInTheDocument();
    expect(storeService.getAllStores).toHaveBeenCalledTimes(2);
  });

  it('marks the retry button busy while the refetch is in flight', async () => {
    vi.mocked(storeService.getAllStores)
      .mockRejectedValueOnce(new Error('network down'))
      .mockReturnValueOnce(new Promise(() => undefined) as never);

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Thử lại' }));

    const retry = await screen.findByRole('button', { name: /Đang thử lại/ });
    expect(retry).toHaveAttribute('aria-busy', 'true');
    expect(retry).toBeDisabled();
    expect(storeService.getAllStores).toHaveBeenCalledTimes(2);
  });
});

describe('Geolocation error announcement (M04)', () => {
  it('exposes the location error region as role="alert"', async () => {
    vi.mocked(storeService.getAllStores).mockResolvedValue(
      storesResponse([makeStore()])
    );
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (
          _success: PositionCallback,
          error?: PositionErrorCallback
        ) => {
          error?.(
            Object.assign(new Error('denied'), {
              code: 1 as const,
              PERMISSION_DENIED: 1 as const,
              POSITION_UNAVAILABLE: 2 as const,
              TIMEOUT: 3 as const,
            })
          );
        },
      },
    });

    renderPage();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Tìm cửa hàng gần nhất' })
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Vui lòng cho phép truy cập vị trí để tìm cửa hàng gần nhất'
    );
  });
});

describe('Booking success feedback (M05)', () => {
  it('announces a successful booking through role="status"', async () => {
    vi.mocked(storeService.getAllStores).mockResolvedValue(
      storesResponse([makeStore()])
    );
    vi.mocked(appointmentService.getAvailableSlots).mockResolvedValue({
      success: true,
      data: {
        date: '2099-12-25',
        purpose: 'consultation',
        store: { id: 's1', name: 'Cửa hàng Test' },
        slots: [{ start: '10:00', end: '10:30' }],
      },
    } as never);
    vi.mocked(appointmentService.createAppointment).mockResolvedValue({
      success: true,
      message: 'ok',
      data: {},
    } as never);

    renderPage();

    const nameButton = await screen.findByRole('button', {
      name: 'Chọn cửa hàng Cửa hàng Test',
    });
    const card = nameButton.closest('[data-slot="card"]') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: 'Xem chi tiết' }));

    const detailDialog = await screen.findByRole('dialog');
    fireEvent.click(
      within(detailDialog).getByRole('button', { name: 'Đặt lịch hẹn' })
    );

    fireEvent.change(dateInput(), { target: { value: '2099-12-25' } });
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: 'Tư vấn sản phẩm' }));
    const slot = await screen.findByRole('button', { name: '10:00 - 10:30' });
    fireEvent.click(slot);
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận đặt lịch' }));

    const message = await screen.findByText(
      'Đặt lịch hẹn thành công! Chúng tôi sẽ liên hệ xác nhận sớm nhất.'
    );
    expect(message.closest('[role="status"]')).not.toBeNull();
  });
});

describe('Store list search and count feedback (M13, S04)', () => {
  it('gives the search input an accessible name independent of the placeholder', async () => {
    vi.mocked(storeService.getAllStores).mockResolvedValue(
      storesResponse([makeStore()])
    );

    renderPage();

    expect(
      await screen.findByRole('textbox', { name: 'Tìm kiếm cửa hàng' })
    ).toBeInTheDocument();
    expect(screen.getByText('1 cửa hàng')).toHaveAttribute('role', 'status');
  });

  it('announces an empty search result through role="status"', async () => {
    vi.mocked(storeService.getAllStores).mockResolvedValue(
      storesResponse([makeStore()])
    );

    renderPage();

    const search = await screen.findByRole('textbox', {
      name: 'Tìm kiếm cửa hàng',
    });
    fireEvent.change(search, { target: { value: 'không tồn tại' } });

    const empty = await screen.findByText('Không tìm thấy cửa hàng nào');
    expect(empty.closest('[role="status"]')).not.toBeNull();
  });
});

describe('Map region accessible name (S07)', () => {
  it('labels the interactive map as a named region', async () => {
    vi.mocked(storeService.getAllStores).mockResolvedValue(
      storesResponse([makeStore()])
    );

    renderPage();

    expect(
      await screen.findByRole('region', { name: 'Bản đồ cửa hàng' })
    ).toBeInTheDocument();
  });
});

describe('Open-status badge contrast (M14)', () => {
  const store: StoreWithDistance = { ...makeStore(), distance: 2.5 };

  it('renders the StoreCard open badge with green-700, never green-600', () => {
    const { container } = render(
      <StoreCard store={store} onSelect={vi.fn()} onViewDetails={vi.fn()} />
    );

    expect(container.querySelector('.bg-green-700')).not.toBeNull();
    expect(container.querySelector('.bg-green-600')).toBeNull();
  });

  it('renders the StoreDetailModal open badge with green-700, never green-600', () => {
    render(
      <StoreDetailModal
        store={store}
        isOpen={true}
        onClose={vi.fn()}
        onBookAppointment={vi.fn()}
      />
    );

    // DialogContent renders in a Radix portal, so query the document.
    expect(document.querySelector('.bg-green-700')).not.toBeNull();
    expect(document.querySelector('.bg-green-600')).toBeNull();
  });
});
