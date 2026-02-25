import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Header from '@/components/layout/Header';
import AdminSidebar from '@/components/layout/AdminSidebar';
import CompareBar from '@/components/CompareBar';

interface AdminLayoutProps {
  children: React.ReactNode;
}

// localStorage key for sidebar state persistence - Requirements: 3.2
const SIDEBAR_COLLAPSED_KEY = 'admin-sidebar-collapsed';

/**
 * AdminLayout Component - Wrapper for all admin pages
 * Requirements: 1.1 - Display vertical sidebar on left side
 * Requirements: 1.3 - Position main content area to the right of sidebar
 * Requirements: 3.2 - Persist sidebar state to localStorage
 * Requirements: 3.3 - Restore sidebar state on mount
 * Requirements: 5.1 - Hide sidebar by default on viewport < 1024px
 * Requirements: 5.2 - Display sidebar as overlay drawer on mobile
 * Requirements: 5.3 - Close sidebar drawer on outside click
 * Requirements: 5.4 - Close sidebar drawer on navigation
 */
const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  const location = useLocation();
  
  // Sidebar collapsed state - Requirements: 3.2, 3.3
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    // Restore from localStorage on initial mount
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return saved === 'true';
  });
  
  // Mobile drawer state - Requirements: 5.1, 5.2
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Persist sidebar state to localStorage - Requirements: 3.2
  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isCollapsed));
  }, [isCollapsed]);

  // Close mobile drawer on route change - Requirements: 5.4
  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  // Toggle sidebar collapsed state
  const handleToggle = () => {
    setIsCollapsed((prev) => !prev);
  };

  // Close mobile drawer - Requirements: 5.3
  const handleMobileClose = () => {
    setIsMobileOpen(false);
  };

  // Open mobile drawer - Requirements: 5.2
  const handleMobileOpen = () => {
    setIsMobileOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <Header />

      {/* Admin Layout Container - Flex layout with sidebar and content */}
      <div className="flex">
        {/* Mobile Hamburger Menu Trigger - Requirements: 5.2 */}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'fixed bottom-4 left-4 z-30 lg:hidden',
            'bg-primary text-primary-foreground shadow-lg',
            'hover:bg-primary/90'
          )}
          onClick={handleMobileOpen}
          aria-label="Mở menu admin"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Admin Sidebar - Requirements: 1.1, 5.1, 5.2 */}
        <AdminSidebar
          isCollapsed={isCollapsed}
          onToggle={handleToggle}
          isMobileOpen={isMobileOpen}
          onMobileClose={handleMobileClose}
        />

        {/* Main Content Area - Requirements: 1.3 */}
        <main
          className={cn(
            'flex-1 min-h-[calc(100vh-64px)]',
            'transition-all duration-300 ease-in-out',
            // Adjust margin based on sidebar state (desktop only)
            'lg:ml-0',
            isCollapsed ? 'lg:pl-16' : 'lg:pl-64'
          )}
        >
          <div className="container mx-auto px-4 py-6">
            {children}
          </div>
        </main>
      </div>

      {/* CompareBar */}
      <CompareBar />
    </div>
  );
};

export default AdminLayout;
