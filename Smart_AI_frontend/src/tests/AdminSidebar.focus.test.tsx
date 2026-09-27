import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import AdminSidebar from '@/components/layout/AdminSidebar';
import { getFocusableElements } from '@/lib/drawerFocus';

function stubMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function renderSidebar(props: {
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
  withTrigger?: boolean;
}) {
  return render(
    <MemoryRouter>
      {props.withTrigger !== false && (
        <button id="admin-mobile-menu-trigger">Mở menu admin</button>
      )}
      <AdminSidebar
        isCollapsed={false}
        onToggle={vi.fn()}
        isMobileOpen={props.isMobileOpen ?? false}
        onMobileClose={props.onMobileClose}
        triggerId="admin-mobile-menu-trigger"
      />
    </MemoryRouter>
  );
}

const getAside = () => document.querySelector('aside') as HTMLElement;

describe('AdminSidebar drawer focus lifecycle (H08)', () => {
  beforeEach(() => {
    stubMatchMedia(false);
  });

  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('keeps the closed mobile sidebar inert and opens it as a labelled dialog', () => {
    const { rerender } = renderSidebar({ isMobileOpen: false });
    expect(getAside()).toHaveAttribute('inert', '');
    expect(getAside()).not.toHaveAttribute('role', 'dialog');

    rerender(
      <MemoryRouter>
        <button id="admin-mobile-menu-trigger">Mở menu admin</button>
        <AdminSidebar
          isCollapsed={false}
          onToggle={vi.fn()}
          isMobileOpen={true}
          triggerId="admin-mobile-menu-trigger"
        />
      </MemoryRouter>
    );

    expect(getAside()).not.toHaveAttribute('inert');
    expect(
      screen.getByRole('dialog', { name: 'Menu điều hướng quản trị' })
    ).toBeInTheDocument();
    expect(getAside()).toHaveAttribute('aria-modal', 'true');
    expect(document.activeElement).toBe(getAside());
  });

  it('restores focus to the hamburger trigger and goes inert again on close', () => {
    const { rerender } = renderSidebar({ isMobileOpen: true });
    expect(document.activeElement).toBe(getAside());

    rerender(
      <MemoryRouter>
        <button id="admin-mobile-menu-trigger">Mở menu admin</button>
        <AdminSidebar
          isCollapsed={false}
          onToggle={vi.fn()}
          isMobileOpen={false}
          triggerId="admin-mobile-menu-trigger"
        />
      </MemoryRouter>
    );

    expect(document.activeElement).toBe(
      document.getElementById('admin-mobile-menu-trigger')
    );
    expect(getAside()).toHaveAttribute('inert');
  });

  // D-1: jsdom does not implement inert, so focus() would succeed either way.
  // Record the inert state at the exact moment focus() is invoked to pin the
  // required order: un-inert -> focus on open, restore focus -> inert on close.
  it('un-inerts the drawer before focusing it, and restores focus before re-inerting (D-1 ordering)', () => {
    const { rerender } = renderSidebar({ isMobileOpen: false });
    expect(getAside()).toHaveAttribute('inert');

    const inertAtAsideFocus: boolean[] = [];
    const inertAtTriggerFocus: boolean[] = [];
    const focusSpy = vi
      .spyOn(HTMLElement.prototype, 'focus')
      .mockImplementation(function (this: HTMLElement) {
        if (this === getAside()) {
          inertAtAsideFocus.push(getAside().hasAttribute('inert'));
        }
        if (this.id === 'admin-mobile-menu-trigger') {
          inertAtTriggerFocus.push(getAside().hasAttribute('inert'));
        }
      });

    const tree = (isMobileOpen: boolean) => (
      <MemoryRouter>
        <button id="admin-mobile-menu-trigger">Mở menu admin</button>
        <AdminSidebar
          isCollapsed={false}
          onToggle={vi.fn()}
          isMobileOpen={isMobileOpen}
          triggerId="admin-mobile-menu-trigger"
        />
      </MemoryRouter>
    );

    try {
      rerender(tree(true));
      expect(inertAtAsideFocus).toEqual([false]);
      expect(getAside()).not.toHaveAttribute('inert');

      rerender(tree(false));
      expect(inertAtTriggerFocus).toEqual([false]);
      expect(getAside()).toHaveAttribute('inert');
    } finally {
      focusSpy.mockRestore();
    }
  });

  it('closes when Escape is pressed while the drawer is open', () => {
    const onMobileClose = vi.fn();
    renderSidebar({ isMobileOpen: true, onMobileClose });
    onMobileClose.mockClear();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onMobileClose).toHaveBeenCalledTimes(1);
  });

  it('does not listen for Escape while the drawer is closed', () => {
    const onMobileClose = vi.fn();
    renderSidebar({ isMobileOpen: false, onMobileClose });
    onMobileClose.mockClear();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onMobileClose).not.toHaveBeenCalled();
  });

  it('traps Tab and Shift+Tab inside the open drawer', () => {
    renderSidebar({ isMobileOpen: true });
    const aside = getAside();
    const focusables = getFocusableElements(aside);
    expect(focusables.length).toBeGreaterThanOrEqual(3);

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    aside.focus();
    fireEvent.keyDown(aside, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);

    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    expect(aside.contains(document.activeElement)).toBe(true);
  });
});

describe('AdminSidebar desktop behaviour (W2B-M2 complement)', () => {
  it('never marks the desktop sidebar as inert', () => {
    stubMatchMedia(true);
    renderSidebar({ isMobileOpen: false });

    expect(getAside()).not.toHaveAttribute('inert');
    expect(getAside()).not.toHaveAttribute('role', 'dialog');
  });
});
