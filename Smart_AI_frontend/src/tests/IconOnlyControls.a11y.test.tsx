import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import CartItem from '@/features/cart/components/CartItem';
import FloatingChat from '@/features/chat/components/FloatingChat';
import MobileMenu from '@/components/layout/MobileMenu';
import SidebarNavGroup from '@/components/layout/SidebarNavGroup';
import type { CartItem as CartItemType } from '@/types/cart.type';

const cartItem: CartItemType = {
  _id: 'i1',
  product: {
    _id: 'p1',
    name: 'iPhone',
    price: 1000000,
    image: '',
    brand: 'apple',
    colors: [],
    tags: [],
    description: '',
    inStock: 10,
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
  quantity: 1,
  color: 'black',
  addedAt: '2024-01-01T00:00:00.000Z',
};

describe('Icon-only controls have accessible names (H06)', () => {
  it('labels the cart item quantity and remove buttons', () => {
    render(
      <CartItem
        item={cartItem}
        onUpdateQuantity={vi.fn()}
        onRemove={vi.fn()}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Xóa iPhone khỏi giỏ hàng' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Giảm số lượng iPhone' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Tăng số lượng iPhone' })
    ).toBeInTheDocument();
  });

  it('labels the floating chat toggle button', () => {
    render(
      <MemoryRouter>
        <FloatingChat />
      </MemoryRouter>
    );

    const fab = screen.getByRole('button', {
      name: 'Mở cửa sổ chat với CSKH',
    });
    expect(fab).toHaveAttribute('aria-expanded', 'false');
  });

  it('exposes the mobile admin section as an aria-expanded disclosure', () => {
    render(
      <MemoryRouter>
        <MobileMenu
          isOpen={false}
          onClose={vi.fn()}
          isAdmin={true}
          isAuthenticated={true}
        />
      </MemoryRouter>
    );

    const toggle = screen.getByRole('button', { name: 'Quản lý' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'mobile-admin-links');
    expect(document.getElementById('mobile-admin-links')).toBeNull();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('link', { name: 'Quản lý sản phẩm' })
    ).toBeInTheDocument();
    expect(document.getElementById('mobile-admin-links')).not.toBeNull();
  });

  it('keeps collapsed sidebar links labelled', () => {
    const links = [
      {
        to: '/admin/dashboard',
        label: 'Dashboard',
        icon: <span aria-hidden="true">📊</span>,
      },
    ];

    const { rerender } = render(
      <MemoryRouter>
        <SidebarNavGroup title="Tổng quan" links={links} isCollapsed={true} />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('link', { name: 'Dashboard' })
    ).toHaveAttribute('aria-label', 'Dashboard');

    rerender(
      <MemoryRouter>
        <SidebarNavGroup title="Tổng quan" links={links} isCollapsed={false} />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('link', { name: 'Dashboard' })
    ).not.toHaveAttribute('aria-label');
  });
});
