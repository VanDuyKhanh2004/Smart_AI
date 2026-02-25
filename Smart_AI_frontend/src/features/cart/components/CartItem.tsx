import React from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { CartItem as CartItemType } from '@/types/cart.type';

interface CartItemProps {
  item: CartItemType;
  onUpdateQuantity: (itemId: string, quantity: number) => void;
  onRemove: (itemId: string) => void;
  isLoading?: boolean;
}

const CartItem: React.FC<CartItemProps> = ({
  item,
  onUpdateQuantity,
  onRemove,
  isLoading = false,
}) => {
  const { product, quantity, color, _id } = item;
  const isOutOfStock = product.inStock === 0;
  const isLowStock = product.inStock > 0 && product.inStock < quantity;

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(price);
  };

  const subtotal = product.price * quantity;

  const handleDecrease = () => {
    if (quantity > 1) {
      onUpdateQuantity(_id, quantity - 1);
    } else {
      onRemove(_id);
    }
  };

  const handleIncrease = () => {
    if (quantity < product.inStock) {
      onUpdateQuantity(_id, quantity + 1);
    }
  };

  return (
    <Card className={`${isOutOfStock ? 'opacity-60' : ''}`}>
      <CardContent className="p-4">
        <div className="flex gap-4">
          {/* Product Image */}
          <div className="flex-shrink-0 w-24 h-24 rounded-md overflow-hidden bg-muted">
            <img
              src={product.image || 'https://via.placeholder.com/96x96/e5e5e5/9ca3af?text=No+Image'}
              alt={product.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = 'https://via.placeholder.com/96x96/e5e5e5/9ca3af?text=No+Image';
              }}
            />
          </div>

          {/* Product Info */}
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <h3 className="font-medium text-sm truncate">{product.name}</h3>
                <p className="text-sm text-muted-foreground">{product.brand}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">
                    {color}
                  </Badge>
                  {isOutOfStock && (
                    <Badge variant="destructive" className="text-xs">
                      Hết hàng
                    </Badge>
                  )}
                  {isLowStock && !isOutOfStock && (
                    <Badge variant="secondary" className="text-xs">
                      Chỉ còn {product.inStock}
                    </Badge>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onRemove(_id)}
                disabled={isLoading}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {/* Price and Quantity */}
            <div className="flex items-center justify-between mt-3">
              <div className="text-sm">
                <span className="text-muted-foreground">Đơn giá: </span>
                <span className="font-medium">{formatPrice(product.price)}</span>
              </div>

              {/* Quantity Controls */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={handleDecrease}
                  disabled={isLoading || isOutOfStock}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-8 text-center text-sm font-medium">{quantity}</span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={handleIncrease}
                  disabled={isLoading || isOutOfStock || quantity >= product.inStock}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {/* Subtotal */}
            <div className="flex justify-end mt-2">
              <span className="text-sm font-semibold text-primary">
                {formatPrice(subtotal)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CartItem;
