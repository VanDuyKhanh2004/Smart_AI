import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';

const UserMenu: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { user, logout, isLoading } = useAuthStore();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Close dropdown on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const handleLogout = async () => {
    setIsOpen(false);
    await logout();
  };

  // Get initials from user name
  const getInitials = (name: string | undefined): string => {
    if (!name) return '??';
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (!user) {
    return null;
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1 rounded-full hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Avatar>
          <AvatarFallback className="bg-primary text-primary-foreground text-sm">
            {getInitials(user.name)}
          </AvatarFallback>
        </Avatar>
        <span className="text-sm font-medium hidden sm:inline-block">
          {user.name}
        </span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-popover border border-border z-50">
          <div className="py-1">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {user.email}
              </p>
            </div>
            
            {/* Navigation Links */}
            <div className="py-1 border-b border-border">
              <Link
                to="/orders"
                className="block px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                onClick={() => setIsOpen(false)}
              >
                Đơn hàng của tôi
              </Link>
              <Link
                to="/wishlist"
                className="block px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                onClick={() => setIsOpen(false)}
              >
                Danh sách yêu thích
              </Link>
              {/* Compare History - Requirements: 5.3 */}
              <Link
                to="/compare/history"
                className="block px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                onClick={() => setIsOpen(false)}
              >
                Lịch sử so sánh
              </Link>
              {/* Saved Addresses - Requirements: 2.1 */}
              <Link
                to="/profile/addresses"
                className="block px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                onClick={() => setIsOpen(false)}
              >
                Địa chỉ đã lưu
              </Link>
            </div>
            
            <div className="py-1">
              <Button
                variant="ghost"
                className="w-full justify-start px-4 py-2 text-sm text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleLogout}
                disabled={isLoading}
              >
                {isLoading ? 'Đang đăng xuất...' : 'Đăng xuất'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
