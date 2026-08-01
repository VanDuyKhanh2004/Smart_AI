import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/types/order.type";
import { getOrderStatusColor, getOrderStatusLabel } from "./order-status-meta";

interface OrderStatusBadgeProps {
  status: OrderStatus;
  className?: string;
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
