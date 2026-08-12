import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/components/layout/Header', () => ({
  default: () => <div data-testid="mock-header" />,
}));

vi.mock('@/components/CompareBar', () => ({
  default: () => <div data-testid="mock-compare-bar" />,
}));

import AdminLayout from '@/components/AdminLayout';

describe('AdminLayout shared shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders the main content area with min-w-0 so wide tables scroll instead of overflowing the layout', () => {
    render(
      <MemoryRouter>
        <AdminLayout>
          <div>Admin content</div>
        </AdminLayout>
      </MemoryRouter>
    );

    const main = document.querySelector('main');
    expect(main).not.toBeNull();
    expect(main!.className).toContain('flex-1');
    expect(main!.className).toContain('min-w-0');
    expect(screen.getByText('Admin content')).toBeInTheDocument();
  });

  it('does not double-compensate for the sidebar: main carries no redundant desktop left padding', () => {
    render(
      <MemoryRouter>
        <AdminLayout>
          <div>Admin content</div>
        </AdminLayout>
      </MemoryRouter>
    );

    const main = document.querySelector('main');
    const aside = document.querySelector('aside');
    expect(main).not.toBeNull();
    expect(aside).not.toBeNull();
    // Sidebar is sticky (in-flow) at desktop, so it already occupies width.
    expect(aside!.className).toContain('lg:sticky');
    // Main must not add a second, sidebar-sized offset.
    expect(main!.className).not.toContain('lg:pl-');
    expect(main!.className).not.toContain('lg:ml-');
  });

  it('renders the sidebar as a non-shrinkable fixed-width flex item', () => {
    render(
      <MemoryRouter>
        <AdminLayout>
          <div>Admin content</div>
        </AdminLayout>
      </MemoryRouter>
    );

    const aside = document.querySelector('aside');
    expect(aside).not.toBeNull();
    expect(aside!.className).toContain('shrink-0');
    expect(aside!.className).toContain('w-64');
  });

  it('keeps the collapsed sidebar at fixed collapsed width without shrinking', () => {
    localStorage.setItem('admin-sidebar-collapsed', 'true');
    render(
      <MemoryRouter>
        <AdminLayout>
          <div>Admin content</div>
        </AdminLayout>
      </MemoryRouter>
    );

    const aside = document.querySelector('aside');
    const main = document.querySelector('main');
    expect(aside).not.toBeNull();
    expect(aside!.className).toContain('shrink-0');
    expect(aside!.className).toContain('w-16');
    // Collapsed state must not reintroduce a compensating main padding either.
    expect(main!.className).not.toContain('lg:pl-');
  });
});
