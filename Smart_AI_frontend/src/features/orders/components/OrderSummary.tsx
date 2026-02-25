import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CartItem } from '@/types/cart.type';

interface OrderSummaryProps {
  items: CartItem[];
  shippingFee?: number;
  discountAmount?: number;
}

const SHIPPING_FEE = 30000; // Default shipping fee: 30,000 VND

const OrderSummary: React.FC<OrderSummaryProps> = ({ 
  items, 
  shippingFee = SHIPPING_FEE,
  discountAmount = 0,
}) => {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(price);
  };

  const subtotal = items.reduce((total, item) => {
    return total + item.product.price * item.quantity;
  }, 0);

  const total = subtotal + shippingFee - discountAmount;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Đơn hàng của bạn</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Order Items */}
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item._id}
              className="flex items-start gap-3 pb-3 border-b last:border-b-0"
            >
              {/* Product Image */}
              <div className="w-16 h-16 rounded-md overflow-hidden bg-muted flex-shrink-0">
                {item.product.image ? (
                  <img
                    src={item.product.image}
                    alt={item.product.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                    No image
                  </div>
                )}
              </div>

              {/* Product Info */}
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-sm line-clamp-2">
                  {item.product.name}
                </h4>
                <div className="text-xs text-muted-foreground mt-1">
                  <span>Màu: {item.color}</span>
                  <span className="mx-2">•</span>
                  <span>SL: {item.quantity}</span>
                </div>
              </div>

              {/* Price */}
              <div className="text-sm font-medium text-right">
                {formatPrice(item.product.price * item.quantity)}
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="space-y-2 pt-2 border-t">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Tạm tính:</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Phí vận chuyển:</span>
            <span>{formatPrice(shippingFee)}</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Giảm giá:</span>
              <span>-{formatPrice(discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between pt-2 border-t">
            <span className="font-semibold">Tổng cộng:</span>
            <span className="text-xl font-bold text-primary">
              {formatPrice(total)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default OrderSummary;
