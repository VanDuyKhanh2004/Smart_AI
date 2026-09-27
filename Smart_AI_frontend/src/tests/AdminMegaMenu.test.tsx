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
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('renders nothing when closed', () => {
    renderMenu({ isOpen: false, onClose: vi.fn() });
    expect(document.getElementById('admin-mega-menu')).toBeNull();
  });

  it('keeps the layering class that lifts the dropdown above page content (e.g. Leaflet)', () => {
    renderMenu({ isOpen: true, onClose: vi.fn() });
    const menuPanel = document.getElementById('admin-mega-menu');
    expect(menuPanel).not.toBeNull();
    expect(menuPanel!.className).toContain('z-50');
    expect(menuPanel!.className).toContain('absolute');
  });

  it('calls onClose when a menu item is clicked', () => {
    const onClose = vi.fn();
    renderMenu({ isOpen: true, onClose });
    fireEvent.click(screen.getByRole('link', { name: 'Quản lý đơn hàng' }));
    expect(onClose).toHaveBeenCalled();
  });

  // W2B-M1: navigation disclosure semantics instead of an ARIA application menu
  it('exposes no application-menu ARIA (role=menu / menuitem / haspopup)', () => {
    const { container } = renderMenu({ isOpen: true, onClose: vi.fn() });
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(container.querySelector('[role="menuitem"]')).toBeNull();
    const trigger = document.querySelector('[aria-haspopup="menu"]');
    expect(trigger).toBeNull();
  });

  it('closes on Escape and returns focus to the trigger', () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <button id="admin-mega-menu-trigger">Quản lý</button>
        <AdminMegaMenu isOpen={true} onClose={onClose} triggerId="admin-mega-menu-trigger" />
      </MemoryRouter>
    );

    const trigger = document.getElementById('admin-mega-menu-trigger')!;
    trigger.focus();
    onClose.mockClear();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
  });

  it('closes when focus moves to an element outside the panel', () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <button id="admin-mega-menu-trigger">Quản lý</button>
        <button id="outside">outside</button>
        <AdminMegaMenu isOpen={true} onClose={onClose} triggerId="admin-mega-menu-trigger" />
      </MemoryRouter>
    );
    onClose.mockClear();

    document.getElementById('outside')!.focus();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open while focus moves onto the trigger', () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <button id="admin-mega-menu-trigger">Quản lý</button>
        <AdminMegaMenu isOpen={true} onClose={onClose} triggerId="admin-mega-menu-trigger" />
      </MemoryRouter>
    );
    onClose.mockClear();

    document.getElementById('admin-mega-menu-trigger')!.focus();

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('MainNavigation admin "Quản lý" dropdown', () => {
  it('renders the admin trigger and opens the management menu on click', () => {
    renderNav({});
    expect(screen.getByRole('button', { name: /quản lý/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /quản lý/i }));
    for (const label of ALL_ADMIN_LINKS) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
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

  it('wires the trigger as a disclosure (aria-expanded/aria-controls, no haspopup)', () => {
    renderNav({});
    const trigger = screen.getByRole('button', { name: /quản lý/i });
    expect(trigger).toHaveAttribute('id', 'admin-mega-menu-trigger');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-controls', 'admin-mega-menu');
    expect(trigger).not.toHaveAttribute('aria-haspopup');

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById('admin-mega-menu')).not.toBeNull();
  });

  it('names the main navigation landmark', () => {
    renderNav({ isAdmin: false });
    expect(
      screen.getByRole('navigation', { name: 'Điều hướng chính' })
    ).toBeInTheDocument();
  });
});
