import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/types/order.type";

interface OrderStatusBadgeProps {
  status: OrderStatus;
  className?: string;
}

/**
 * Color mapping for order statuses
 * Requirements 6.1: pending=yellow, confirmed=blue, processing=purple, 
 * shipping=orange, delivered=green, cancelled=red
 */
const statusColorMap: Record<OrderStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  confirmed: "bg-blue-100 text-blue-800 border-blue-200",
  processing: "bg-purple-100 text-purple-800 border-purple-200",
  shipping: "bg-orange-100 text-orange-800 border-orange-200",
  delivered: "bg-green-100 text-green-800 border-green-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
};

const statusLabelMap: Record<OrderStatus, string> = {
  pending: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  processing: "Đang xử lý",
  shipping: "Đang giao",
  delivered: "Đã giao",
  cancelled: "Đã hủy",
};

export function getOrderStatusColor(status: OrderStatus): string {
  return statusColorMap[status] ?? statusColorMap.pending;
}

export function getOrderStatusLabel(status: OrderStatus): string {
  return statusLabelMap[status] ?? status;
}

export function OrderStatusBadge({ status, className }: OrderStatusBadgeProps) {
  const colorClass = getOrderStatusColor(status);
  const label = getOrderStatusLabel(status);

  return (
    <Badge className={cn("font-medium", colorClass, className)}>
      {label}
    </Badge>
  );
}
