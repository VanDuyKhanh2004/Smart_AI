import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderStatusBadge } from "./OrderStatusBadge";
import type { Order } from "@/types/order.type";

interface OrderCardProps {
  order: Order;
  onClick?: () => void;
}

/**
 * OrderCard component displays order summary
 * Requirements 2.2: Show order ID, total amount, status, and creation date
 */
export function OrderCard({ order, onClick }: OrderCardProps) {
  const formattedDate = new Date(order.createdAt).toLocaleDateString("vi-VN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const formattedTotal = new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(order.total);

  return (
    <Card
      className={onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">
            {order.orderNumber}
          </CardTitle>
          <OrderStatusBadge status={order.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Tổng tiền:</span>
          <span className="font-medium">{formattedTotal}</span>
        </div>
        {/* Promotion Info - Requirements 5.4 */}
        {order.promotion && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Mã giảm giá:</span>
            <span className="text-green-600 font-medium">
              {order.promotion.code} (-{new Intl.NumberFormat("vi-VN", {
                style: "currency",
                currency: "VND",
              }).format(order.promotion.discountAmount)})
            </span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Ngày đặt:</span>
          <span>{formattedDate}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Số sản phẩm:</span>
          <span>{order.items.length} sản phẩm</span>
        </div>
      </CardContent>
    </Card>
  );
}
