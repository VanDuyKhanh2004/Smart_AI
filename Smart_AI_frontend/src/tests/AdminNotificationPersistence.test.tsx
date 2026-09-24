import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AdminStoresPage } from '@/features/admin/pages/AdminStoresPage';
import type { Store } from '@/features/stores/types';

vi.mock('@/features/admin/components/StoreForm', () => ({
  StoreForm: () => <div data-testid="mock-store-form" />,
}));

const mockGetAllStoresAdmin = vi.fn();
const mockToggleStoreStatus = vi.fn();

vi.mock('@/features/stores/services/storeService', () => ({
  storeService: {
    getAllStoresAdmin: (...args: unknown[]) => mockGetAllStoresAdmin(...args),
    createStore: vi.fn(),
    updateStore: vi.fn(),
    deleteStore: vi.fn(),
    toggleStoreStatus: (...args: unknown[]) => mockToggleStoreStatus(...args),
  },
}));

function makeStore(overrides: Partial<Store> = {}): Store {
  const businessHour = { open: '08:00', close: '22:00', isClosed: false };
  return {
    id: 's1',
    name: 'Cửa hàng A',
    address: {
      street: '1 Lê Lợi',
      district: 'Q1',
      city: 'HCM',
      fullAddress: '1 Lê Lợi, Q1, HCM',
    },
    location: { type: 'Point', coordinates: [106.7, 10.7] },
    phone: '0123456789',
    email: 's@example.com',
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

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('AdminStoresPage notification persistence (ERR-03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockGetAllStoresAdmin.mockResolvedValue({
      success: true,
      data: [makeStore()],
    });
    mockToggleStoreStatus.mockResolvedValue({ success: true, data: {} });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps error notification visible after 3000ms', async () => {
    mockGetAllStoresAdmin.mockRejectedValue(new Error('network'));

    render(<AdminStoresPage />);
    await flush(0);

    expect(
      screen.getByText('Không thể tải danh sách cửa hàng')
    ).toBeInTheDocument();

    await flush(3100);

    expect(
      screen.getByText('Không thể tải danh sách cửa hàng')
    ).toBeInTheDocument();
  });

  it('dismiss clears error notification immediately', async () => {
    mockGetAllStoresAdmin.mockRejectedValue(new Error('network'));

    render(<AdminStoresPage />);
    await flush(0);

    expect(
      screen.getByText('Không thể tải danh sách cửa hàng')
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Đóng thông báo' })
    );

    expect(
      screen.queryByText('Không thể tải danh sách cửa hàng')
    ).not.toBeInTheDocument();
  });

  it('auto-dismisses success notification after 3000ms', async () => {
    render(<AdminStoresPage />);
    await flush(0);

    expect(screen.getByText('Cửa hàng A')).toBeInTheDocument();
    expect(screen.queryByText('Đã ẩn cửa hàng')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Ẩn cửa hàng'));
    await flush(0);

    expect(screen.getByText('Đã ẩn cửa hàng')).toBeInTheDocument();

    await flush(3100);

    expect(screen.queryByText('Đã ẩn cửa hàng')).not.toBeInTheDocument();
  });

  it('does not show notification before any action on successful load', async () => {
    render(<AdminStoresPage />);
    await flush(0);

    expect(screen.getByText('Cửa hàng A')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Đóng thông báo' })
    ).not.toBeInTheDocument();
  });
});
