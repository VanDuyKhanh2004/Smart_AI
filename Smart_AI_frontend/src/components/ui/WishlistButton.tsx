import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWishlistStore } from '@/stores/wishlistStore';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';

interface WishlistButtonProps {
  productId: string;
  size?: 'sm' | 'default' | 'lg' | 'icon';
  variant?: 'default' | 'outline' | 'ghost';
  className?: string;
  showText?: boolean;
}

/**
 * WishlistButton Component
 * 
 * Heart icon button that toggles wishlist status for a product.
 * - Shows filled heart if product is in wishlist
 * - Shows unfilled heart if product is not in wishlist
 * - Shows loading state during API call
 * - Redirects to login if user is not authenticated
 * 
 * Requirements: 1.1, 1.3, 1.4, 2.1, 2.3
 */
const WishlistButton: React.FC<WishlistButtonProps> = ({
  productId,
  size = 'icon',
  variant = 'ghost',
  className,
  showText = false,
}) => {
  const navigate = useNavigate();
  const [isToggling, setIsToggling] = useState(false);
  
  const { isAuthenticated } = useAuthStore();
  const { isInWishlist, toggleWishlist } = useWishlistStore();
  
  const inWishlist = isInWishlist(productId);

  const handleClick = async (e: React.MouseEvent) => {
    // Prevent event bubbling (e.g., when button is inside a Link)
    e.preventDefault();
    e.stopPropagation();

    // Requirement 1.3: Redirect to login if not authenticated
    if (!isAuthenticated) {
      navigate('/login', { state: { from: window.location.pathname } });
      return;
    }

    setIsToggling(true);
    try {
      await toggleWishlist(productId);
    } catch (error) {
      // Error is handled by the store
      console.error('Failed to toggle wishlist:', error);
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={cn(
        'transition-colors',
        inWishlist && 'text-red-500 hover:text-red-600',
        className
      )}
      onClick={handleClick}
      disabled={isToggling}
      aria-label={inWishlist ? 'Xóa khỏi yêu thích' : 'Thêm vào yêu thích'}
    >
      {isToggling ? (
        <Loader2 className={cn('animate-spin', size === 'lg' ? 'h-5 w-5' : 'h-4 w-4')} />
      ) : (
        <Heart
          className={cn(
            size === 'lg' ? 'h-5 w-5' : 'h-4 w-4',
            inWishlist && 'fill-current'
          )}
        />
      )}
      {showText && (
        <span className="ml-2">
          {inWishlist ? 'Đã yêu thích' : 'Yêu thích'}
        </span>
      )}
    </Button>
  );
};

export default WishlistButton;
