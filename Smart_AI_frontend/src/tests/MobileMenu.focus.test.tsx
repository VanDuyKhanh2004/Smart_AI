import { useState, useCallback } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import MobileMenu from '@/components/layout/MobileMenu';
import { getFocusableElements } from '@/lib/drawerFocus';

function renderDrawer(props: {
  isOpen: boolean;
  triggerId?: string;
  isAdmin?: boolean;
  isAuthenticated?: boolean;
  onClose?: () => void;
}) {
  return render(
    <MemoryRouter>
      <button id="mobile-menu-trigger">Mở menu</button>
      <MobileMenu
        isOpen={props.isOpen}
        onClose={props.onClose ?? vi.fn()}
        isAdmin={props.isAdmin ?? false}
        isAuthenticated={props.isAuthenticated ?? false}
        triggerId={props.triggerId}
      />
    </MemoryRouter>
  );
}

function Harness() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const navigate = useNavigate();

  return (
    <div>
      <button id="mobile-menu-trigger" onClick={() => setOpen(true)}>
        Mở menu
      </button>
      <button data-testid="go-elsewhere" onClick={() => navigate('/stores')}>
        Đi trang khác
      </button>
      <MobileMenu
        isOpen={open}
        onClose={close}
        isAdmin={false}
        isAuthenticated={false}
        triggerId="mobile-menu-trigger"
      />
    </div>
  );
}

function renderHarness() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Harness />
    </MemoryRouter>
  );
}

const getDrawer = () => document.getElementById('mobile-nav-drawer')!;
const getTrigger = () => document.getElementById('mobile-menu-trigger')!;

describe('MobileMenu focus lifecycle (H08)', () => {
  it('marks the closed drawer as inert and the open drawer as interactive', () => {
    const { rerender } = renderDrawer({ isOpen: false });
    expect(getDrawer()).toHaveAttribute('inert', '');

    rerender(
      <MemoryRouter>
        <button id="mobile-menu-trigger">Mở menu</button>
        <MobileMenu isOpen={true} onClose={vi.fn()} isAdmin={false} isAuthenticated={false} />
      </MemoryRouter>
    );
    expect(getDrawer()).not.toHaveAttribute('inert');
  });

  it('moves focus to the close button when opened and back to the trigger when closed', () => {
    const { rerender } = renderDrawer({ isOpen: false, triggerId: 'mobile-menu-trigger' });

    rerender(
      <MemoryRouter>
        <button id="mobile-menu-trigger">Mở menu</button>
        <MobileMenu
          isOpen={true}
          onClose={vi.fn()}
          isAdmin={false}
          isAuthenticated={false}
          triggerId="mobile-menu-trigger"
        />
      </MemoryRouter>
    );
    expect(document.activeElement).toBe(document.getElementById('mobile-menu-close'));

    rerender(
      <MemoryRouter>
        <button id="mobile-menu-trigger">Mở menu</button>
        <MobileMenu
          isOpen={false}
          onClose={vi.fn()}
          isAdmin={false}
          isAuthenticated={false}
          triggerId="mobile-menu-trigger"
        />
      </MemoryRouter>
    );
    expect(document.activeElement).toBe(getTrigger());
    expect(getDrawer()).toHaveAttribute('inert', '');
  });

  it('exposes the open drawer as a modal dialog with a labelled navigation landmark', () => {
    renderDrawer({ isOpen: true });
    const drawer = getDrawer();
    expect(drawer).toHaveAttribute('role', 'dialog');
    expect(drawer).toHaveAttribute('aria-modal', 'true');
    expect(drawer).toHaveAttribute('aria-label', 'Menu điều hướng');
    expect(
      screen.getByRole('navigation', { name: 'Điều hướng di động' })
    ).toBeInTheDocument();
    expect(
      document.querySelector('#mobile-menu-close svg')
    ).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps Tab and Shift+Tab focus inside the open drawer', () => {
    renderDrawer({ isOpen: true });
    const drawer = getDrawer();
    const focusables = getFocusableElements(drawer);
    expect(focusables.length).toBeGreaterThanOrEqual(3);

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);

    first.focus();
    fireEvent.keyDown(first, { key: 'Tab' });
    expect(document.activeElement).toBe(focusables[1]);
    expect(drawer.contains(document.activeElement)).toBe(true);
  });

  it('closes on Escape and restores focus to the trigger', () => {
    renderHarness();

    fireEvent.click(getTrigger());
    expect(getDrawer()).not.toHaveAttribute('inert');
    expect(document.activeElement).toBe(document.getElementById('mobile-menu-close'));

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(getDrawer()).toHaveAttribute('inert', '');
    expect(document.activeElement).toBe(getTrigger());
  });

  it('closes and restores focus when the route changes', () => {
    renderHarness();

    fireEvent.click(getTrigger());
    expect(getDrawer()).not.toHaveAttribute('inert');

    fireEvent.click(screen.getByTestId('go-elsewhere'));

    expect(getDrawer()).toHaveAttribute('inert', '');
    expect(document.activeElement).toBe(getTrigger());
  });

  it('does not trap Escape while the drawer is closed', () => {
    const onClose = vi.fn();
    renderDrawer({ isOpen: false, onClose });
    onClose.mockClear();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
  });
});
