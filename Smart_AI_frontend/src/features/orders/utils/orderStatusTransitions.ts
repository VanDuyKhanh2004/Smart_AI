import type { OrderStatus } from "@/types/order.type";

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipping", "cancelled"],
  shipping: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export function getAllowedNextStatuses(currentStatus: OrderStatus): OrderStatus[] {
  return VALID_TRANSITIONS[currentStatus] ?? [];
}

export function canTransition(currentStatus: OrderStatus, nextStatus: OrderStatus): boolean {
  return getAllowedNextStatuses(currentStatus).includes(nextStatus);
}

export function isTerminal(status: OrderStatus): boolean {
  return status === "delivered" || status === "cancelled";
}
