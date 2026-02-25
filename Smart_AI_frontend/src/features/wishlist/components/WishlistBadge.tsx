import React from 'react';
import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWishlistStore } from '@/stores/wishlistStore';
import { useAuthStore } from '@/stores/authStore';

interface WishlistBadgeProps {
  showZero?: boolean;
}

/**
 * WishlistBadge Component
 * 
 * Heart icon with count badge in navigation header.
 * Links to wishlist page.
 * 
 * Requirements: 6.1, 6.2, 6.3
 */
const WishlistBadge: React.FC<WishlistBadgeProps> = ({ showZero = false }) => {
  const { isAuthenticated } = useAuthStore();
  // Subscribe directly to items to trigger re-render when wishlist changes
  // Requirements: 6.2 - Update count immediately when wishlist changes
  const items = useWishlistStore((state) => state.items);
  const totalItems = items.length;

  // Requirements: 6.3 - Hide badge or show 0 when wishlist is empty
  const shouldShowBadge = (totalItems > 0 || showZero) && isAuthenticated;

  return (
    <Link to="/wishlist">
      <Button variant="ghost" size="icon" className="relative">
        <Heart className="h-5 w-5" />
        {shouldShowBadge && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white">
            {totalItems > 99 ? '99+' : totalItems}
          </span>
        )}
        <span className="sr-only">Yêu thích ({totalItems} sản phẩm)</span>
      </Button>
    </Link>
  );
};

export default WishlistBadge;
