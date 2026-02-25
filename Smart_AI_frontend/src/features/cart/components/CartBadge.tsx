import React from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCartStore } from '@/stores/cartStore';

interface CartBadgeProps {
  showZero?: boolean;
}

const CartBadge: React.FC<CartBadgeProps> = ({ showZero = false }) => {
  // Subscribe directly to items to trigger re-render when cart changes
  const items = useCartStore((state) => state.items);
  const totalItems = items.reduce((total, item) => total + item.quantity, 0);

  const shouldShowBadge = totalItems > 0 || showZero;

  return (
    <Link to="/cart">
      <Button variant="ghost" size="icon" className="relative">
        <ShoppingCart className="h-5 w-5" />
        {shouldShowBadge && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
            {totalItems > 99 ? '99+' : totalItems}
          </span>
        )}
        <span className="sr-only">Giỏ hàng ({totalItems} sản phẩm)</span>
      </Button>
    </Link>
  );
};

export default CartBadge;
