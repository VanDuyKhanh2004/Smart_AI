import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { CancelOrderModal } from "./CancelOrderModal";
import { orderService } from "@/services/order.service";
import type { Order } from "@/types/order.type";
import { CANCEL_REASONS, type CancelReasonValue } from "@/types/order.type";
import { XCircle } from "lucide-react";

interface OrderDetailDialogProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onOrderCancelled?: (order: Order) => void;
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString("vi-VN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(amount);
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-2 border-b border-border last:border-0">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <div className="col-span-2 text-sm">{children}</div>
    </div>
  );
}

/**
 * OrderDetailDialog displays full order details
 * Requirements 2.3: Display items, quantities, prices, and shipping address
 * Requirements 1.1, 1.3: Show cancel button for pending/confirmed orders
 */
export function OrderDetailDialog({
  order,
  isOpen,
  onClose,
  onOrderCancelled,
}: OrderDetailDialogProps) {
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  if (!order) return null;

  // Check if order can be cancelled - Requirements 1.1
  const canCancel = order.status === "pending" || order.status === "confirmed";

  // Handle cancel order - Requirements 1.3
  const handleCancelOrder = async (reason: CancelReasonValue | string, customReason?: string) => {
    setCancelError(null);
    
    // Get the label for the reason
    const reasonLabel = CANCEL_REASONS.find(r => r.value === reason)?.label || customReason || reason;
    const finalReason = reason === "other" && customReason ? customReason : reasonLabel;

    const response = await orderService.cancelOrder(order.id || order._id || "", {
      reason: finalReason,
      customReason,
    });

    if (response.success && response.data) {
      setIsCancelModalOpen(false);
      onOrderCancelled?.(response.data);
      onClose();
    } else {
      throw new Error("Failed to cancel order");
    }
  };

  const shippingAddress = order.shippingAddress;
  const fullAddress = [
    shippingAddress.address,
    shippingAddress.ward,
    shippingAddress.district,
    shippingAddress.city,
  ].filter(Boolean).join(", ");

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Chi tiết đơn hàng {order.orderNumber}
            <OrderStatusBadge status={order.status} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Order Items */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm">Sản phẩm</h3>
            <div className="space-y-3">
              {order.items.map((item, index) => (
                <div
                  key={index}
                  className="flex gap-3 p-3 bg-muted/50 rounded-lg"
                >
                  {item.image && (
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-16 h-16 object-cover rounded"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Màu: {item.color}
                    </p>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-xs text-muted-foreground">
                        SL: {item.quantity}
                      </span>
                      <span className="text-sm font-medium">
                        {formatCurrency(item.price * item.quantity)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Shipping Address */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Địa chỉ giao hàng</h3>
            <div className="p-3 bg-muted/50 rounded-lg space-y-1">
              <p className="font-medium text-sm">{shippingAddress.fullName}</p>
              <p className="text-sm text-muted-foreground">
                {shippingAddress.phone}
              </p>
              <p className="text-sm text-muted-foreground">{fullAddress}</p>
            </div>
          </div>

          {/* Order Summary */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Tổng cộng</h3>
            <div className="p-3 bg-muted/50 rounded-lg space-y-2">
              <DetailRow label="Tạm tính">
                {formatCurrency(order.subtotal)}
              </DetailRow>
              <DetailRow label="Phí vận chuyển">
                {formatCurrency(order.shippingFee)}
              </DetailRow>
              {/* Promotion Info - Requirements 5.4 */}
              {order.promotion && (
                <DetailRow label="Mã giảm giá">
                  <div className="flex flex-col">
                    <span className="font-medium text-green-600">
                      {order.promotion.code}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Giảm {order.promotion.discountType === 'percentage' 
                        ? `${order.promotion.discountValue}%` 
                        : formatCurrency(order.promotion.discountValue)}
                    </span>
                    <span className="text-green-600">
                      -{formatCurrency(order.promotion.discountAmount)}
                    </span>
                  </div>
                </DetailRow>
              )}
              <div className="grid grid-cols-3 gap-2 py-2 border-t border-border">
                <span className="text-sm font-semibold">Tổng tiền</span>
                <span className="col-span-2 text-sm font-semibold text-primary">
                  {formatCurrency(order.total)}
                </span>
              </div>
            </div>
          </div>

          {/* Status History */}
          {order.statusHistory && order.statusHistory.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">Lịch sử trạng thái</h3>
              <div className="space-y-2">
                {order.statusHistory.map((entry, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 bg-muted/50 rounded"
                  >
                    <div className="flex items-center gap-2">
                      <OrderStatusBadge status={entry.status} />
                      {entry.note && (
                        <span className="text-xs text-muted-foreground">
                          - {entry.note}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(entry.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cancel Reason */}
          {order.status === "cancelled" && order.cancelReason && (
            <div className="space-y-2">
              <h3 className="font-semibold text-sm text-destructive">
                Lý do hủy
              </h3>
              <p className="text-sm text-muted-foreground p-3 bg-destructive/10 rounded-lg">
                {order.cancelReason}
              </p>
            </div>
          )}

          {/* Timestamps */}
          <div className="space-y-1 pt-2 border-t">
            <DetailRow label="Ngày đặt hàng">
              {formatDateTime(order.createdAt)}
            </DetailRow>
            {order.confirmedAt && (
              <DetailRow label="Ngày xác nhận">
                {formatDateTime(order.confirmedAt)}
              </DetailRow>
            )}
            {order.shippedAt && (
              <DetailRow label="Ngày giao hàng">
                {formatDateTime(order.shippedAt)}
              </DetailRow>
            )}
            {order.deliveredAt && (
              <DetailRow label="Ngày nhận hàng">
                {formatDateTime(order.deliveredAt)}
              </DetailRow>
            )}
            {order.cancelledAt && (
              <DetailRow label="Ngày hủy">
                {formatDateTime(order.cancelledAt)}
              </DetailRow>
            )}
          </div>

          {/* Cancel Error */}
          {cancelError && (
            <p className="text-sm text-destructive">{cancelError}</p>
          )}
        </div>

        {/* Cancel Button - Requirements 1.1 */}
        {canCancel && (
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => setIsCancelModalOpen(true)}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Hủy đơn hàng
            </Button>
          </DialogFooter>
        )}
      </DialogContent>

      {/* Cancel Order Modal - Requirements 1.2 */}
      <CancelOrderModal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        onConfirm={handleCancelOrder}
        orderNumber={order.orderNumber}
      />
    </Dialog>
  );
}
