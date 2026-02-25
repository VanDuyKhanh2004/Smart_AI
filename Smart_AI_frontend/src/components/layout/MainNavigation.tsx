import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AdminMegaMenu from './AdminMegaMenu';

interface MainNavigationProps {
  isAdmin: boolean;
  isAuthenticated: boolean;
  isAdminPage?: boolean;
  className?: string;
}

interface NavLink {
  to: string;
  label: string;
  requiresAuth?: boolean;
}

const navLinks: NavLink[] = [
  { to: '/products', label: 'Sản phẩm' },
  { to: '/stores', label: 'Cửa hàng' },
  { to: '/orders', label: 'Đơn hàng', requiresAuth: true },
];

/**
 * MainNavigation Component - Desktop navigation with primary links
 * Requirements: 1.2 - Show maximum 5 primary links for regular users
 * Requirements: 1.4 - Clear visual hierarchy with proper spacing
 * Requirements: 5.2 - Smooth hover animation with underline or background change
 * Requirements: 5.3 - Highlight current page with distinct styling
 */
const MainNavigation: React.FC<MainNavigationProps> = ({
  isAdmin,
  isAuthenticated,
  isAdminPage = false,
  className = '',
}) => {
  const location = useLocation();
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false);

  const isActiveLink = (path: string): boolean => {
    if (path === '/products') {
      return location.pathname === '/products' || location.pathname.startsWith('/products/');
    }
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const isAdminActive = (): boolean => {
    return location.pathname.startsWith('/admin') || location.pathname === '/complaints';
  };

  return (
    <nav className={`items-center gap-1 ${className}`}>
      {navLinks.map((link) => {
        // Skip auth-required links for unauthenticated users
        if (link.requiresAuth && !isAuthenticated) {
          return null;
        }

        const isActive = isActiveLink(link.to);

        return (
          <Link
            key={link.to}
            to={link.to}
            className={`
              group relative px-4 py-2 text-sm font-medium rounded-md
              transition-all duration-200 ease-in-out
              ${isActive
                ? 'text-primary bg-primary/10'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }
            `}
          >
            {link.label}
            {/* Active/Hover indicator underline - Requirements: 5.2, 5.3 */}
            <span 
              className={`
                absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 bg-primary rounded-full
                transition-all duration-200 ease-out
                ${isActive ? 'w-1/2 opacity-100' : 'w-0 opacity-0 group-hover:w-1/3 group-hover:opacity-50'}
              `}
            />
          </Link>
        );
      })}

      {/* Admin Dropdown - Requirements: 2.1, 4.1 - Hidden when on admin pages */}
      {isAdmin && !isAdminPage && (
        <div className="relative">
          <Button
            variant="ghost"
            data-admin-trigger
            className={`
              px-4 py-2 h-auto text-sm font-medium
              transition-colors duration-200
              ${isAdminActive()
                ? 'text-primary bg-primary/10'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }
            `}
            onClick={() => setIsAdminMenuOpen(!isAdminMenuOpen)}
            aria-expanded={isAdminMenuOpen}
            aria-haspopup="menu"
          >
            Quản lý
            <ChevronDown
              className={`ml-1 h-4 w-4 transition-transform duration-200 ${
                isAdminMenuOpen ? 'rotate-180' : ''
              }`}
            />
          </Button>

          <AdminMegaMenu
            isOpen={isAdminMenuOpen}
            onClose={() => setIsAdminMenuOpen(false)}
          />
        </div>
      )}
    </nav>
  );
};

export default MainNavigation;
