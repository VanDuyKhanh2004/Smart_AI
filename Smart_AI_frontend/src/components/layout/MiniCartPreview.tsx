import React from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCartStore } from '@/stores/cartStore';

interface MiniCartPreviewProps {
  isVisible: boolean;
}

/**
 * MiniCartPreview Component - Hover preview for cart
 * Requirements: 4.2 - Display mini cart preview with recent items on hover
 */
const MiniCartPreview: React.FC<MiniCartPreviewProps> = ({ isVisible }) => {
  const items = useCartStore((state) => state.items);
  const getTotalPrice = useCartStore((state) => state.getTotalPrice);
  
  // Show only 3 most recent items
  const recentItems = items.slice(-3).reverse();
  const totalPrice = getTotalPrice();
  const hasMoreItems = items.length > 3;

  if (!isVisible) return null;

  // Format price in VND
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(price);
  };

  return (
    <div className="absolute right-0 top-full mt-2 w-80 rounded-lg border bg-popover shadow-lg z-50 animate-in fade-in-0 zoom-in-95 duration-200">
      {items.length === 0 ? (
        // Empty cart state
        <div className="p-6 text-center">
          <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Giỏ hàng trống</p>
          <Link to="/products">
            <Button variant="link" size="sm" className="mt-2">
              Tiếp tục mua sắm
            </Button>
          </Link>
        </div>
      ) : (
        <>
          {/* Cart items */}
          <div className="max-h-64 overflow-y-auto p-3 space-y-3">
            {recentItems.map((item) => (
              <div key={item._id} className="flex gap-3">
                {/* Product image */}
                <div className="h-16 w-16 flex-shrink-0 rounded-md border bg-muted overflow-hidden">
                  {item.product.image ? (
                    <img
                      src={item.product.image}
                      alt={item.product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center">
                      <ShoppingBag className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                </div>
                
                {/* Product info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.product.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.color && <span>Màu: {item.color} • </span>}
                    SL: {item.quantity}
                  </p>
                  <p className="text-sm font-medium text-primary">
                    {formatPrice(item.product.price * item.quantity)}
                  </p>
                </div>
              </div>
            ))}
            
            {hasMoreItems && (
              <p className="text-xs text-center text-muted-foreground pt-1">
                +{items.length - 3} sản phẩm khác
              </p>
            )}
          </div>

          {/* Footer with total and buttons */}
          <div className="border-t p-3 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Tổng cộng:</span>
              <span className="text-base font-semibold">{formatPrice(totalPrice)}</span>
            </div>
            
            <div className="flex gap-2">
              <Link to="/cart" className="flex-1">
                <Button variant="outline" size="sm" className="w-full">
                  Xem giỏ hàng
                </Button>
              </Link>
              <Link to="/checkout" className="flex-1">
                <Button size="sm" className="w-full">
                  Thanh toán
                </Button>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default MiniCartPreview;
