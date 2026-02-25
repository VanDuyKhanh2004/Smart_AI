import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';
import MainNavigation from './MainNavigation';
import MobileMenu from './MobileMenu';
import UserActions from './UserActions';

interface HeaderProps {
  className?: string;
}

/**
 * Header Component - Main header with three-section layout
 * Requirements: 1.1 - Logo on left, navigation in center, user actions on right
 * Requirements: 1.3 - Consistent height of 64px with proper vertical alignment
 * Requirements: 5.1 - Subtle shadow and backdrop blur for depth
 * Requirements: 5.4 - Smooth transition when scrolling past initial position
 */
const Header: React.FC<HeaderProps> = ({ className = '' }) => {
  const { isAuthenticated, isLoading, user } = useAuthStore();
  const isAdmin = isAuthenticated && user?.role === 'admin';
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const location = useLocation();

  // Detect if current page is an admin page - Requirements: 4.1, 4.2
  const isAdminPage = location.pathname.startsWith('/admin') || location.pathname.startsWith('/complaints');

  // Track scroll position for sticky header transition - Requirements: 5.4
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <header
        className={`
          sticky top-0 z-40 w-full border-b 
          bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60
          transition-shadow duration-300 ease-in-out
          ${isScrolled ? 'shadow-md' : 'shadow-sm'}
          ${className}
        `}
      >
        <div className="container mx-auto px-4 flex h-16 items-center justify-between">
          {/* Left Section: Logo / Brand */}
          <div className="flex items-center gap-4">
            {/* Mobile Menu Trigger - Requirements: 3.1 */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Mở menu"
            >
              <Menu className="h-5 w-5" />
            </Button>

            <Link to="/" className="flex items-center gap-2">
              <span className="font-bold text-xl">Smart AI</span>
            </Link>
          </div>

          {/* Center Section: Main Navigation (Desktop only) */}
          <MainNavigation
            isAdmin={isAdmin}
            isAuthenticated={isAuthenticated}
            isAdminPage={isAdminPage}
            className="hidden md:flex"
          />

          {/* "Về trang chính" link when on admin pages - Requirements: 4.2 */}
          {isAdminPage && (
            <Link
              to="/"
              className="hidden md:flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors duration-200"
            >
              <Home className="h-4 w-4" />
              Về trang chính
            </Link>
          )}

          {/* Right Section: User Actions */}
          <UserActions
            isAuthenticated={isAuthenticated}
            isLoading={isLoading}
          />
        </div>
      </header>

      {/* Mobile Menu Drawer */}
      <MobileMenu
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        isAdmin={isAdmin}
        isAuthenticated={isAuthenticated}
      />
    </>
  );
};

export default Header;
