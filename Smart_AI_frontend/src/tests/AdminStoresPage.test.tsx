import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminStoresPage } from '@/features/admin/pages/AdminStoresPage';
import type { Store } from '@/features/stores/types';

vi.mock('@/features/admin/components/StoreForm', () => ({
  StoreForm: () => <div data-testid="mock-store-form" />,
}));

const mockGetAllStoresAdmin = vi.fn();

vi.mock('@/features/stores/services/storeService', () => ({
  storeService: {
    getAllStoresAdmin: (...args: unknown[]) => mockGetAllStoresAdmin(...args),
  },
}));

function makeStore(overrides: Partial<Store> = {}): Store {
  const businessHour = { open: '08:00', close: '22:00', isClosed: false };
  return {
    id: 's1',
    name: 'Cửa hàng Điện Máy Xanh Quận 1',
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

function getTableContainer() {
  return document.querySelector('[data-slot="table-container"]') as HTMLElement | null;
}

describe('AdminStoresPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllStoresAdmin.mockResolvedValue({ success: true, data: [makeStore()] });
  });

  it('renders stores inside a horizontally scrollable table container', async () => {
    render(<AdminStoresPage />);

    expect(
      await screen.findByText('Cửa hàng Điện Máy Xanh Quận 1')
    ).toBeInTheDocument();

    const container = getTableContainer();
    expect(container).not.toBeNull();
    expect(container!.className).toContain('overflow-x-auto');
    expect(container!.className).toContain('w-full');
  });

  it('keeps the Add Store action available in the page header', async () => {
    render(<AdminStoresPage />);

    await waitFor(() => expect(mockGetAllStoresAdmin).toHaveBeenCalled());
    expect(screen.getByRole('heading', { name: 'Quản lý cửa hàng' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Thêm cửa hàng/ })).toBeInTheDocument();
  });

  it('renders the page in a full-width wrapper (no centered container) so tables use available main width', async () => {
    const { container } = render(<AdminStoresPage />);

    expect(
      await screen.findByText('Cửa hàng Điện Máy Xanh Quận 1')
    ).toBeInTheDocument();
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('w-full');
    expect(root.className).toContain('space-y-6');
    expect(root.className).not.toContain('container');
  });

  it('wraps descriptive columns (store name and address) instead of single-line truncation', async () => {
    render(<AdminStoresPage />);

    const name = await screen.findByText('Cửa hàng Điện Máy Xanh Quận 1');
    const nameCell = name.closest('td') as HTMLElement;
    expect(nameCell.className).toContain('whitespace-normal');
    expect(nameCell.className).not.toContain('truncate');
    expect(nameCell.getAttribute('title')).toBe('Cửa hàng Điện Máy Xanh Quận 1');

    const address = await screen.findByText('123 Lê Lợi, Quận 1, Hồ Chí Minh');
    const addressCell = address.closest('td') as HTMLElement;
    expect(addressCell.className).toContain('line-clamp-3');
    expect(addressCell.className).not.toContain('truncate');
    expect(addressCell.getAttribute('title')).toBe('123 Lê Lợi, Quận 1, Hồ Chí Minh');
  });

  it('keeps compact columns (phone) on a single line', async () => {
    render(<AdminStoresPage />);

    expect(await screen.findByText('0123456789')).toBeInTheDocument();
    const phone = screen.getByText('0123456789');
    const phoneCell = phone.closest('td') as HTMLElement;
    expect(phoneCell.className).toContain('whitespace-nowrap');
    expect(phoneCell.className).not.toContain('whitespace-normal');
  });
});