import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StoreCard } from '@/features/stores/components/StoreCard';
import { StoreDetailModal } from '@/features/stores/components/StoreDetailModal';
import type { Store, BusinessHours, StoreWithDistance } from '@/features/stores/types';

function buildBusinessHours(
  overrides: Partial<Record<keyof BusinessHours, Partial<{ open: string; close: string; isClosed: boolean }>>> = {}
): BusinessHours {
  const defaults = { open: '08:00', close: '21:00', isClosed: false };
  const days: (keyof BusinessHours)[] = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ];
  const businessHours = {} as BusinessHours;
  for (const day of days) {
    businessHours[day] = { ...defaults, ...(overrides[day] ?? {}) };
  }
  return businessHours;
}

function buildStore(overrides: Partial<Store> = {}): StoreWithDistance {
  return {
    id: 'store-1',
    name: 'Smart AI Store',
    address: {
      street: '123 Test St',
      ward: 'Ward 1',
      district: 'District 1',
      city: 'Ho Chi Minh City',
      fullAddress: '123 Test St, Ward 1, District 1, Ho Chi Minh City',
    },
    location: { type: 'Point', coordinates: [106.6297, 10.8231] },
    phone: '0123456789',
    email: 'store@example.com',
    businessHours: buildBusinessHours(),
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// 2026-08-07 is a Friday. Vietnam is UTC+7, so:
// Friday 14:02 VN = 07:02 UTC (open)
// Friday 22:30 VN = 15:30 UTC (closed)

describe('Store open/closed status in UI components', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('StoreCard', () => {
    it('shows "Đang mở cửa" during business hours', () => {
      vi.setSystemTime(new Date('2026-08-07T07:02:00.000Z'));
      render(
        <StoreCard
          store={buildStore()}
          onSelect={vi.fn()}
          onViewDetails={vi.fn()}
        />
      );
      expect(screen.getByText('Đang mở cửa')).toBeInTheDocument();
    });

    it('shows "Đã đóng cửa" outside business hours', () => {
      vi.setSystemTime(new Date('2026-08-07T15:30:00.000Z'));
      render(
        <StoreCard
          store={buildStore()}
          onSelect={vi.fn()}
          onViewDetails={vi.fn()}
        />
      );
      expect(screen.getByText('Đã đóng cửa')).toBeInTheDocument();
    });

    it('shows "Đã đóng cửa" when the day is closed', () => {
      const store = buildStore({ businessHours: buildBusinessHours({ sunday: { isClosed: true } }) });
      vi.setSystemTime(new Date('2026-08-09T06:00:00.000Z'));
      render(<StoreCard store={store} onSelect={vi.fn()} onViewDetails={vi.fn()} />);
      expect(screen.getByText('Đã đóng cửa')).toBeInTheDocument();
    });
  });

  describe('StoreDetailModal', () => {
    it('marks the correct weekday as "(Hôm nay)" and shows matching status', () => {
      vi.setSystemTime(new Date('2026-08-07T07:02:00.000Z'));
      render(
        <StoreDetailModal
          store={buildStore()}
          isOpen={true}
          onClose={vi.fn()}
          onBookAppointment={vi.fn()}
        />
      );
      expect(screen.getByText('Đang mở cửa')).toBeInTheDocument();
      const fridayRow = screen.getByText('Thứ Sáu').closest('tr');
      expect(fridayRow).toHaveTextContent('(Hôm nay)');
      expect(fridayRow).toHaveTextContent('08:00 - 21:00');
    });

    it('shows "(Hôm nay)" on Sunday when it is Sunday in store timezone', () => {
      vi.setSystemTime(new Date('2026-08-09T06:00:00.000Z'));
      render(
        <StoreDetailModal
          store={buildStore()}
          isOpen={true}
          onClose={vi.fn()}
          onBookAppointment={vi.fn()}
        />
      );
      const sundayRow = screen.getByText('Chủ Nhật').closest('tr');
      expect(sundayRow).toHaveTextContent('(Hôm nay)');
    });

    it('does not mark any day as "(Hôm nay)" for a weekday far from today', () => {
      vi.setSystemTime(new Date('2026-08-07T07:02:00.000Z'));
      render(
        <StoreDetailModal
          store={buildStore()}
          isOpen={true}
          onClose={vi.fn()}
          onBookAppointment={vi.fn()}
        />
      );
      expect(screen.getByText('Thứ Hai').closest('tr')).not.toHaveTextContent('(Hôm nay)');
      expect(screen.getByText('Chủ Nhật').closest('tr')).not.toHaveTextContent('(Hôm nay)');
    });
  });

  describe('agreement between card and modal', () => {
    it('shows the same status in both card and modal at the same instant', () => {
      vi.setSystemTime(new Date('2026-08-07T07:02:00.000Z'));
      const store = buildStore();

      render(
        <>
          <StoreCard store={store} onSelect={vi.fn()} onViewDetails={vi.fn()} />
          <StoreDetailModal
            store={store}
            isOpen={true}
            onClose={vi.fn()}
            onBookAppointment={vi.fn()}
          />
        </>
      );

      expect(screen.getAllByText('Đang mở cửa').length).toBe(2);
    });

    it('agrees when closed as well', () => {
      vi.setSystemTime(new Date('2026-08-07T15:30:00.000Z'));
      const store = buildStore();

      render(
        <>
          <StoreCard store={store} onSelect={vi.fn()} onViewDetails={vi.fn()} />
          <StoreDetailModal
            store={store}
            isOpen={true}
            onClose={vi.fn()}
            onBookAppointment={vi.fn()}
          />
        </>
      );

      expect(screen.getAllByText('Đã đóng cửa').length).toBe(2);
    });
  });
});
