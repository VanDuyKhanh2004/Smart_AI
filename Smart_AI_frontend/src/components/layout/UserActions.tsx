import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCartStore } from '@/stores/cartStore';
import { useWishlistStore } from '@/stores/wishlistStore';
import UserDropdown from './UserDropdown';
import MiniCartPreview from './MiniCartPreview';

interface UserActionsProps {
  isAuthenticated: boolean;
  isLoading: boolean;
}

/**
 * UserActions Component - Right section of header with cart, wishlist, and auth
 * Requirements: 4.1 - Show icons for Wishlist, Cart with badge counts
 * Requirements: 4.2 - Display mini cart preview on hover
 * Requirements: 4.4 - Display login/register buttons for unauthenticated users
 */
const UserActions: React.FC<UserActionsProps> = ({ isAuthenticated, isLoading }) => {
  const [isCartPreviewVisible, setIsCartPreviewVisible] = useState(false);
  const cartHoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const cartItems = useCartStore((state) => state.items);
  const wishlistItems = useWishlistStore((state) => state.items);
  
  const cartCount = cartItems.reduce((total, item) => total + item.quantity, 0);
  const wishlistCount = wishlistItems.length;

  // Handle cart hover with delay for better UX
  const handleCartMouseEnter = () => {
    if (cartHoverTimeoutRef.current) {
      clearTimeout(cartHoverTimeoutRef.current);
    }
    cartHoverTimeoutRef.current = setTimeout(() => {
      setIsCartPreviewVisible(true);
    }, 200);
  };

  const handleCartMouseLeave = () => {
    if (cartHoverTimeoutRef.current) {
      clearTimeout(cartHoverTimeoutRef.current);
    }
    cartHoverTimeoutRef.current = setTimeout(() => {
      setIsCartPreviewVisible(false);
    }, 300);
  };

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      {/* Wishlist Icon with Badge - Requirements: 4.1 */}
      {isAuthenticated && (
        <Link to="/wishlist">
          <Button variant="ghost" size="icon" className="relative">
            <Heart className="h-5 w-5" />
            {wishlistCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white animate-in zoom-in-50 duration-200">
                {wishlistCount > 99 ? '99+' : wishlistCount}
              </span>
            )}
            <span className="sr-only">Yêu thích ({wishlistCount} sản phẩm)</span>
          </Button>
        </Link>
      )}

      {/* Cart Icon with Badge and Preview - Requirements: 4.1, 4.2 */}
      <div 
        className="relative hidden sm:block"
        onMouseEnter={handleCartMouseEnter}
        onMouseLeave={handleCartMouseLeave}
      >
        <Link to="/cart">
          <Button variant="ghost" size="icon" className="relative">
            <ShoppingCart className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground animate-in zoom-in-50 duration-200">
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
            <span className="sr-only">Giỏ hàng ({cartCount} sản phẩm)</span>
          </Button>
        </Link>
        <MiniCartPreview isVisible={isCartPreviewVisible} />
      </div>

      {/* Cart Icon for mobile (no preview) */}
      <Link to="/cart" className="sm:hidden">
        <Button variant="ghost" size="icon" className="relative">
          <ShoppingCart className="h-5 w-5" />
          {cartCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground animate-in zoom-in-50 duration-200">
              {cartCount > 99 ? '99+' : cartCount}
            </span>
          )}
          <span className="sr-only">Giỏ hàng ({cartCount} sản phẩm)</span>
        </Button>
      </Link>

      {/* Auth Section - Requirements: 4.4 */}
      {isLoading ? (
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary ml-2" />
      ) : isAuthenticated ? (
        <UserDropdown />
      ) : (
        <div className="flex items-center gap-1 sm:gap-2 ml-1">
          <Link to="/login">
            <Button variant="ghost" size="sm" className="text-xs sm:text-sm">
              Đăng nhập
            </Button>
          </Link>
          <Link to="/register">
            <Button size="sm" className="text-xs sm:text-sm">
              Đăng ký
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
};

export default UserActions;
