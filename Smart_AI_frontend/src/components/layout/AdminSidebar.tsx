import React from 'react';
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
}

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
}) => {
  // Admin navigation groups - Requirements: 2.1
  const adminGroups: AdminGroup[] = [
    {
      title: 'Sản phẩm',
      links: [
        { to: '/admin/products', label: 'Quản lý sản phẩm', icon: <Package className="h-5 w-5" /> },
        { to: '/admin/reviews', label: 'Đánh giá', icon: <Star className="h-5 w-5" /> },
        { to: '/admin/qa', label: 'Q&A', icon: <MessageSquare className="h-5 w-5" /> },
      ],
    },
    {
      title: 'Đơn hàng',
      links: [
        { to: '/admin/orders', label: 'Quản lý đơn hàng', icon: <ShoppingCart className="h-5 w-5" /> },
        { to: '/complaints', label: 'Khiếu nại', icon: <AlertCircle className="h-5 w-5" /> },
      ],
    },
    {
      title: 'Cửa hàng',
      links: [
        { to: '/admin/stores', label: 'Quản lý cửa hàng', icon: <Store className="h-5 w-5" /> },
        { to: '/admin/appointments', label: 'Lịch hẹn', icon: <Calendar className="h-5 w-5" /> },
      ],
    },
    {
      title: 'Hệ thống',
      links: [
        { to: '/admin/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
        { to: '/admin/promotions', label: 'Khuyến mãi', icon: <Tag className="h-5 w-5" /> },
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
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-screen',
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
              <ChevronRight className="h-5 w-5 transition-transform duration-200" />
            ) : (
              <ChevronLeft className="h-5 w-5 transition-transform duration-200" />
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
