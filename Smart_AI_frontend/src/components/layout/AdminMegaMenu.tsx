import React, { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Package,
  Star,
  MessageSquare,
  ShoppingCart,
  AlertCircle,
  Store,
  Calendar,
  LayoutDashboard,
  Tag,
} from 'lucide-react';

interface AdminMegaMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AdminLink {
  to: string;
  label: string;
  icon: React.ReactNode;
}

interface AdminGroup {
  title: string;
  links: AdminLink[];
}

/**
 * AdminMegaMenu Component - Dropdown mega menu with grouped admin links
 * Requirements: 2.2 - Display mega menu with grouped admin links on click
 * Requirements: 2.3 - Group links into categories: Sản phẩm, Đơn hàng, Cửa hàng, Hệ thống
 * Requirements: 2.4 - Close dropdown when clicking outside
 */
const AdminMegaMenu: React.FC<AdminMegaMenuProps> = ({ isOpen, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // Admin link groups - Requirements: 2.3
  const adminGroups: AdminGroup[] = [
    {
      title: 'Sản phẩm',
      links: [
        { to: '/admin/products', label: 'Quản lý sản phẩm', icon: <Package className="h-4 w-4" /> },
        { to: '/admin/reviews', label: 'Đánh giá', icon: <Star className="h-4 w-4" /> },
        { to: '/admin/qa', label: 'Q&A', icon: <MessageSquare className="h-4 w-4" /> },
      ],
    },
    {
      title: 'Đơn hàng',
      links: [
        { to: '/admin/orders', label: 'Quản lý đơn hàng', icon: <ShoppingCart className="h-4 w-4" /> },
        { to: '/complaints', label: 'Khiếu nại', icon: <AlertCircle className="h-4 w-4" /> },
      ],
    },
    {
      title: 'Cửa hàng',
      links: [
        { to: '/admin/stores', label: 'Quản lý cửa hàng', icon: <Store className="h-4 w-4" /> },
        { to: '/admin/appointments', label: 'Lịch hẹn', icon: <Calendar className="h-4 w-4" /> },
      ],
    },
    {
      title: 'Hệ thống',
      links: [
        { to: '/admin/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
        { to: '/admin/promotions', label: 'Khuyến mãi', icon: <Tag className="h-4 w-4" /> },
      ],
    },
  ];

  // Click outside to close - Requirements: 2.4
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        // Check if click is on the trigger button (parent element handles this)
        const target = event.target as HTMLElement;
        if (!target.closest('[data-admin-trigger]')) {
          onClose();
        }
      }
    };

    if (isOpen) {
      // Use setTimeout to avoid immediate close on the same click that opens
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen, onClose]);

  // Close on route change - Requirements: 2.5
  useEffect(() => {
    if (isOpen) {
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const isActiveLink = (path: string): boolean => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className="
        absolute top-full left-1/2 -translate-x-1/2 mt-2
        w-[500px] p-4
        bg-popover border border-border rounded-lg shadow-lg
        animate-in fade-in-0 zoom-in-95 duration-200
        origin-top
      "
      role="menu"
      aria-orientation="vertical"
    >
      <div className="grid grid-cols-2 gap-4">
        {adminGroups.map((group) => (
          <div key={group.title} className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">
              {group.title}
            </h3>
            <div className="space-y-1">
              {group.links.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`
                    flex items-center gap-3 px-2 py-2 rounded-md text-sm
                    transition-colors duration-150
                    ${isActiveLink(link.to)
                      ? 'text-primary bg-primary/10'
                      : 'text-foreground hover:bg-accent hover:text-accent-foreground'
                    }
                  `}
                  role="menuitem"
                  onClick={onClose}
                >
                  <span className="text-muted-foreground">{link.icon}</span>
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminMegaMenu;
