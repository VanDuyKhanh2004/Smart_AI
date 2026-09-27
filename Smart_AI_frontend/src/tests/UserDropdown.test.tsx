import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const { authState } = vi.hoisted(() => ({
  authState: {
    user: {
      name: 'Nguyễn Văn A',
      email: 'a@example.com',
      role: 'customer',
      avatar: '',
    },
    logout: vi.fn(),
    isLoading: false,
  },
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector?: (s: typeof authState) => unknown) =>
    typeof selector === 'function' ? selector(authState) : authState,
}));

import UserDropdown from '@/components/layout/UserDropdown';

function renderDropdown() {
  return render(
    <MemoryRouter>
      <UserDropdown />
    </MemoryRouter>
  );
}

function getTrigger() {
  return screen.getByRole('button', { name: /Nguyễn Văn A/ });
}

describe('UserDropdown escape handling (W2B-L1)', () => {
  beforeEach(() => {
    authState.user = {
      name: 'Nguyễn Văn A',
      email: 'a@example.com',
      role: 'customer',
      avatar: '',
    };
    authState.isLoading = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports disclosure state on the trigger and renders menu links when open', () => {
    renderDropdown();
    const trigger = getTrigger();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-haspopup', 'true');

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('link', { name: 'Hồ sơ của tôi' })
    ).toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the trigger', () => {
    renderDropdown();
    const trigger = getTrigger();

    fireEvent.click(trigger);
    expect(
      screen.getByRole('link', { name: 'Hồ sơ của tôi' })
    ).toBeInTheDocument();

    trigger.focus();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(
      screen.queryByRole('link', { name: 'Hồ sơ của tôi' })
    ).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(trigger);
  });

  it('attaches its Escape listener only while the dropdown is open', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const keydownAdds = () =>
      addSpy.mock.calls.filter((call) => call[0] === 'keydown').length;
    const keydownRemoves = () =>
      removeSpy.mock.calls.filter((call) => call[0] === 'keydown').length;

    renderDropdown();
    expect(keydownAdds()).toBe(0);

    fireEvent.click(getTrigger());
    expect(keydownAdds()).toBe(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(keydownRemoves()).toBe(1);
    expect(keydownAdds()).toBe(1);
  });

  it('keeps decorative trigger and item icons out of the accessibility tree', () => {
    renderDropdown();
    const trigger = getTrigger();
    expect(trigger.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(trigger);

    const profileLink = screen.getByRole('link', { name: 'Hồ sơ của tôi' });
    expect(profileLink.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    const logout = screen.getByRole('button', { name: 'Đăng xuất' });
    expect(logout.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
