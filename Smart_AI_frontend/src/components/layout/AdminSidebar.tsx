import React, { useEffect, useRef, useState } from 'react';
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
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { trapTabKey } from '@/lib/drawerFocus';
import SidebarNavGroup, { type NavLink } from './SidebarNavGroup';

interface AdminGroup {
  title: string;
  links: NavLink[];
}

export interface AdminSidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
  /** Element id of the hamburger trigger; focused again when the drawer closes (H08). */
  triggerId?: string;
}

const DESKTOP_QUERY = '(min-width: 1024px)';

/**
 * AdminSidebar Component - Main sidebar for admin navigation
 * Requirements: 1.2 - Fixed width of 256px expanded, 64px collapsed
 * Requirements: 1.4 - Sticky positioning
 * Requirements: 2.1 - Group links into categories
 * Requirements: 3.1 - Toggle between collapsed/expanded with smooth animation
 * Requirements: 6.3 - Active link highlighting with primary color and left border
 * Requirements: 6.4 - Header with "Admin Panel" branding
 */
const AdminSidebar: React.FC<AdminSidebarProps> = ({
  isCollapsed,
  onToggle,
  isMobileOpen = false,
  onMobileClose,
  triggerId,
}) => {
  const asideRef = useRef<HTMLElement>(null);
  const wasMobileOpenRef = useRef(false);

  // H08: the sidebar only behaves as a modal drawer below the lg breakpoint;
  // on desktop it stays an ordinary (never inert) sidebar landmark.
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(DESKTOP_QUERY).matches
      : true
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia(DESKTOP_QUERY);
    const handleChange = () => setIsDesktop(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // H08 focus lifecycle + inert state — MUST stay a single effect (D-1).
  // Browsers ignore focus() on an inert element, so on open the drawer is
  // un-inerted first and only then focused; on close focus is handed back to
  // the trigger before inert is applied. The desktop sidebar is never inert.
  useEffect(() => {
    const aside = asideRef.current;
    if (!aside) return;

    if (isMobileOpen) {
      wasMobileOpenRef.current = true;
      aside.removeAttribute('inert');
      aside.focus();
      return;
    }

    if (wasMobileOpenRef.current) {
      wasMobileOpenRef.current = false;
      if (triggerId) {
        document.getElementById(triggerId)?.focus();
      }
    }
    if (!isDesktop) {
      aside.setAttribute('inert', '');
    } else {
      aside.removeAttribute('inert');
    }
  }, [isMobileOpen, isDesktop, triggerId]);

  // H08: Escape closes the drawer while it is open
  useEffect(() => {
    if (!isMobileOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onMobileClose?.();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMobileOpen, onMobileClose]);

  // Admin navigation groups - Requirements: 2.1
  const adminGroups: AdminGroup[] = [
    {
      title: 'Sản phẩm',
      links: [
        { to: '/admin/products', label: 'Quản lý sản phẩm', icon: <Package className="h-5 w-5" aria-hidden="true" /> },
        { to: '/admin/reviews', label: 'Đánh giá', icon: <Star className="h-5 w-5" aria-hidden="true" /> },
        { to: '/admin/qa', label: 'Q&A', icon: <MessageSquare className="h-5 w-5" aria-hidden="true" /> },
      ],
    },
    {
      title: 'Đơn hàng',
      links: [
        { to: '/admin/orders', label: 'Quản lý đơn hàng', icon: <ShoppingCart className="h-5 w-5" aria-hidden="true" /> },
        { to: '/complaints', label: 'Khiếu nại', icon: <AlertCircle className="h-5 w-5" aria-hidden="true" /> },
      ],
    },
    {
      title: 'Cửa hàng',
      links: [
        { to: '/admin/stores', label: 'Quản lý cửa hàng', icon: <Store className="h-5 w-5" aria-hidden="true" /> },
        { to: '/admin/appointments', label: 'Lịch hẹn', icon: <Calendar className="h-5 w-5" aria-hidden="true" /> },
      ],
    },
    {
      title: 'Hệ thống',
      links: [
        { to: '/admin/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" aria-hidden="true" /> },
        { to: '/admin/promotions', label: 'Khuyến mãi', icon: <Tag className="h-5 w-5" aria-hidden="true" /> },
      ],
    },
  ];

  // Handle link click on mobile - close drawer - Requirements: 5.4
  const handleNavLinkClick = () => {
    if (isMobileOpen && onMobileClose) {
      onMobileClose();
    }
  };

  return (
    <>
      {/* Mobile Overlay - Requirements: 5.3 */}
      {isMobileOpen && (
        <div
          // W3-16: above the CompareBar (z-50) and its hamburger (z-[55]).
          className="fixed inset-0 bg-black/50 z-[65] lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — modal dialog when the mobile drawer is open, inert when
          hidden on small viewports (H08) */}
      <aside
        id="admin-sidebar-drawer"
        ref={asideRef}
        tabIndex={-1}
        role={isMobileOpen ? 'dialog' : undefined}
        aria-modal={isMobileOpen ? 'true' : undefined}
        aria-label={isMobileOpen ? 'Menu điều hướng quản trị' : undefined}
        onKeyDown={(event) => trapTabKey(event, asideRef.current)}
        className={cn(
          // shrink-0 prevents the fixed-width sidebar (Requirements 1.2) from
          // being compressed when wide page content overflows the flex line.
          // W3-16: above the overlay (z-[65]) and the CompareBar (z-50).
          'fixed top-0 left-0 z-[70] h-screen shrink-0',
          // Background and border - Requirements: 6.1: Consistent styling with main theme
          // Using sidebar-specific CSS variables for theme consistency
          'bg-sidebar border-r border-sidebar-border',
          'text-sidebar-foreground',
          'flex flex-col',
          // Smooth width transition - Requirements: 3.1, 6.2, 6.3
          'transition-all duration-300 ease-in-out',
          // Subtle shadow for depth
          'shadow-sm',
          // Desktop: sticky sidebar
          'lg:sticky lg:top-0',
          // Width based on collapsed state - Requirements: 1.2
          isCollapsed ? 'w-16' : 'w-64',
          // Mobile: transform-based show/hide - Requirements: 5.1, 5.2
          'lg:translate-x-0',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Header Section - Requirements: 6.4 */}
        <div className={cn(
          'flex items-center h-16 px-4 border-b border-sidebar-border',
          // Subtle background gradient for header using sidebar theme
          'bg-gradient-to-r from-sidebar to-sidebar/95',
          isCollapsed ? 'justify-center' : 'justify-between',
          // Smooth transition for layout changes
          'transition-all duration-300 ease-in-out'
        )}>
          {!isCollapsed && (
            <div className="flex items-center gap-2 transition-opacity duration-200">
              <span className="font-bold text-lg bg-gradient-to-r from-sidebar-primary to-sidebar-primary/80 bg-clip-text text-transparent">
                Admin Panel
              </span>
            </div>
          )}
          
          {/* Toggle Button - Requirements: 3.1 */}
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className={cn(
              'flex-shrink-0',
              // Hover effect with smooth transition using sidebar theme
              'transition-all duration-200 ease-in-out',
              'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              // Rotate animation on hover
              'hover:scale-105'
            )}
            aria-label={isCollapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
          >
            {isCollapsed ? (
              <ChevronRight className="h-5 w-5 transition-transform duration-200" aria-hidden="true" />
            ) : (
              <ChevronLeft className="h-5 w-5 transition-transform duration-200" aria-hidden="true" />
            )}
          </Button>
        </div>

        {/* Navigation Groups */}
        <div className={cn(
          'flex-1 overflow-y-auto py-4 px-2 space-y-6',
          // Smooth scrollbar styling
          'scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent'
        )}>
          {adminGroups.map((group) => (
            <SidebarNavGroup
              key={group.title}
              title={group.title}
              links={group.links}
              isCollapsed={isCollapsed}
              onLinkClick={handleNavLinkClick}
            />
          ))}
        </div>
      </aside>
    </>
  );
};

export default AdminSidebar;
