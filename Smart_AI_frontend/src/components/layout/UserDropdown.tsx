import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { User, Package, Heart, History, Calendar, LogOut, ChevronDown } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';

/**
 * UserDropdown - Dropdown menu with avatar and user options
 * Requirements: 4.3 - Display user avatar dropdown with user info, quick links, and logout
 */
const UserDropdown: React.FC = () => {
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

  // Build avatar URL
  const avatarSrc = user.avatar
    ? user.avatar.startsWith('http') || user.avatar.startsWith('data:')
      ? user.avatar
      : `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/${user.avatar}`
    : undefined;

  const menuItems = [
    { to: '/profile', icon: User, label: 'Hồ sơ của tôi' },
    { to: '/orders', icon: Package, label: 'Đơn hàng' },
    { to: '/wishlist', icon: Heart, label: 'Danh sách yêu thích' },
    { to: '/compare/history', icon: History, label: 'Lịch sử so sánh' },
    { to: '/my-appointments', icon: Calendar, label: 'Lịch hẹn của tôi' },
  ];

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1.5 rounded-full hover:bg-accent transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Avatar className="size-8 ring-2 ring-background shadow-sm">
          {avatarSrc ? (
            <AvatarImage src={avatarSrc} alt={user.name} />
          ) : null}
          <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
            {getInitials(user.name)}
          </AvatarFallback>
        </Avatar>
        <span className="text-sm font-medium hidden lg:inline-block max-w-[100px] truncate">
          {user.name}
        </span>
        <ChevronDown 
          className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-60 rounded-lg shadow-lg bg-popover border border-border z-50 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200">
          {/* User Info Header */}
          <div className="px-4 py-3 bg-muted/50 border-b border-border">
            <div className="flex items-center gap-3">
              <Avatar className="size-10">
                {avatarSrc ? (
                  <AvatarImage src={avatarSrc} alt={user.name} />
                ) : null}
                <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {user.email}
                </p>
              </div>
            </div>
          </div>
          
          {/* Navigation Links */}
          <div className="py-2">
            {menuItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-accent transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <item.icon className="h-4 w-4 text-muted-foreground" />
                {item.label}
              </Link>
            ))}
          </div>
          
          {/* Logout Button */}
          <div className="border-t border-border py-2">
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 px-4 py-2.5 text-sm text-destructive hover:text-destructive hover:bg-destructive/10 rounded-none"
              onClick={handleLogout}
              disabled={isLoading}
            >
              <LogOut className="h-4 w-4" />
              {isLoading ? 'Đang đăng xuất...' : 'Đăng xuất'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserDropdown;
