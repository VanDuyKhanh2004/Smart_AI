import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import AdminMegaMenu from '@/components/layout/AdminMegaMenu';
import MainNavigation from '@/components/layout/MainNavigation';

const ALL_ADMIN_LINKS = [
  'Quản lý sản phẩm',
  'Đánh giá',
  'Q&A',
  'Quản lý đơn hàng',
  'Khiếu nại',
  'Quản lý cửa hàng',
  'Lịch hẹn',
  'Dashboard',
  'Khuyến mãi',
];

function renderMenu(props: Parameters<typeof AdminMegaMenu>[0]) {
  return render(
    <MemoryRouter>
      <AdminMegaMenu {...props} />
    </MemoryRouter>
  );
}

function renderNav(props: {
  isAdmin?: boolean;
  isAuthenticated?: boolean;
  isAdminPage?: boolean;
}) {
  return render(
    <MemoryRouter>
      <MainNavigation
        isAdmin={props.isAdmin ?? true}
        isAuthenticated={props.isAuthenticated ?? true}
        isAdminPage={props.isAdminPage ?? false}
      />
    </MemoryRouter>
  );
}

describe('AdminMegaMenu', () => {
  it('renders every expected management link when open', () => {
    renderMenu({ isOpen: true, onClose: vi.fn() });
    for (const label of ALL_ADMIN_LINKS) {
      expect(screen.getByRole('menuitem', { name: label })).toBeInTheDocument();
    }
  });

  it('renders nothing when closed', () => {
    renderMenu({ isOpen: false, onClose: vi.fn() });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('keeps the layering class that lifts the dropdown above page content (e.g. Leaflet)', () => {
    renderMenu({ isOpen: true, onClose: vi.fn() });
    const menuPanel = screen.getByRole('menu');
    expect(menuPanel.className).toContain('z-50');
    expect(menuPanel.className).toContain('absolute');
  });

  it('calls onClose when a menu item is clicked', () => {
    const onClose = vi.fn();
    renderMenu({ isOpen: true, onClose });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Quản lý đơn hàng' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('MainNavigation admin "Quản lý" dropdown', () => {
  it('renders the admin trigger and opens the management menu on click', () => {
    renderNav({});
    expect(screen.getByRole('button', { name: /quản lý/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /quản lý/i }));
    for (const label of ALL_ADMIN_LINKS) {
      expect(screen.getByRole('menuitem', { name: label })).toBeInTheDocument();
    }
  });

  it('does not render the admin trigger for non-admin users', () => {
    renderNav({ isAdmin: false });
    expect(screen.queryByRole('button', { name: /quản lý/i })).not.toBeInTheDocument();
  });

  it('does not render the admin trigger on admin pages', () => {
    renderNav({ isAdminPage: true });
    expect(screen.queryByRole('button', { name: /quản lý/i })).not.toBeInTheDocument();
  });
});