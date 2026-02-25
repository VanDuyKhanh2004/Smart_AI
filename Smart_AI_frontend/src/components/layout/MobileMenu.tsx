import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  isAuthenticated: boolean;
}

/**
 * MobileMenu Component - Slide-out drawer for mobile navigation
 * Requirements: 3.2 - Display slide-out drawer with all navigation links
 * Requirements: 3.3 - Show collapsible sections for admin links
 * Requirements: 3.4 - Close drawer and navigate on link click
 * Requirements: 3.5 - Display overlay behind drawer
 * Note: Full implementation in Phase 3, this is a placeholder for Phase 1
 */
const MobileMenu: React.FC<MobileMenuProps> = ({
  isOpen,
  onClose,
  isAdmin,
  isAuthenticated,
}) => {
  const location = useLocation();
  const [isAdminExpanded, setIsAdminExpanded] = React.useState(false);

  // Close menu on route change
  useEffect(() => {
    onClose();
  }, [location.pathname, onClose]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const isActiveLink = (path: string): boolean => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const navLinkClass = (path: string) => `
    block px-4 py-3 text-base font-medium rounded-md transition-colors
    ${isActiveLink(path)
      ? 'text-primary bg-primary/10'
      : 'text-foreground hover:bg-accent'
    }
  `;

  return (
    <>
      {/* Overlay - Requirements: 3.5 */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden animate-in fade-in-0 duration-200"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <div
        className={`
          fixed top-0 left-0 z-50 h-full w-72 bg-background border-r shadow-xl
          transform transition-transform duration-300 ease-in-out md:hidden
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <span className="font-bold text-xl">Smart AI</span>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Đóng menu">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Navigation Links */}
        <nav className="p-4 space-y-1 overflow-y-auto max-h-[calc(100vh-80px)]">
          <Link to="/products" className={navLinkClass('/products')}>
            Sản phẩm
          </Link>
          <Link to="/stores" className={navLinkClass('/stores')}>
            Cửa hàng
          </Link>
          {isAuthenticated && (
            <Link to="/orders" className={navLinkClass('/orders')}>
              Đơn hàng
            </Link>
          )}

          {/* Admin Section - Requirements: 3.3 */}
          {isAdmin && (
            <div className="pt-4 border-t mt-4">
              <button
                onClick={() => setIsAdminExpanded(!isAdminExpanded)}
                className="flex items-center justify-between w-full px-4 py-3 text-base font-medium text-foreground hover:bg-accent rounded-md transition-colors"
              >
                Quản lý
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-200 ${
                    isAdminExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {isAdminExpanded && (
                <div className="ml-4 mt-1 space-y-1 animate-in slide-in-from-top-2 duration-200">
                  <Link to="/admin/dashboard" className={navLinkClass('/admin/dashboard')}>
                    Dashboard
                  </Link>
                  <Link to="/admin/products" className={navLinkClass('/admin/products')}>
                    Quản lý sản phẩm
                  </Link>
                  <Link to="/admin/orders" className={navLinkClass('/admin/orders')}>
                    Quản lý đơn hàng
                  </Link>
                  <Link to="/admin/reviews" className={navLinkClass('/admin/reviews')}>
                    Đánh giá
                  </Link>
                  <Link to="/admin/qa" className={navLinkClass('/admin/qa')}>
                    Q&A
                  </Link>
                  <Link to="/admin/promotions" className={navLinkClass('/admin/promotions')}>
                    Khuyến mãi
                  </Link>
                  <Link to="/admin/stores" className={navLinkClass('/admin/stores')}>
                    Quản lý cửa hàng
                  </Link>
                  <Link to="/admin/appointments" className={navLinkClass('/admin/appointments')}>
                    Lịch hẹn
                  </Link>
                  <Link to="/complaints" className={navLinkClass('/complaints')}>
                    Khiếu nại
                  </Link>
                </div>
              )}
            </div>
          )}
        </nav>
      </div>
    </>
  );
};

export default MobileMenu;
