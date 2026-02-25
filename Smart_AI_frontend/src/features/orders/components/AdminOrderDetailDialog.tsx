import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { OrderStatusBadge, getOrderStatusLabel } from "./OrderStatusBadge";
import type { Order, OrderStatus, UpdateOrderStatusRequest } from "@/types/order.type";
import { Loader2 } from "lucide-react";

interface AdminOrderDetailDialogProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateStatus: (orderId: string, data: UpdateOrderStatusRequest) => Promise<void>;
}

const statusOptions: OrderStatus[] = [
  "pending",
  "confirmed",
  "processing",
  "shipping",
  "delivered",
  "cancelled",
];

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
 * AdminOrderDetailDialog displays full order details with status update
 * Requirements 3.3: Display full order details in a dialog
 * Requirements 4.1: Update order status
 * Requirements 4.6: Handle status update with optimistic UI
 */
export function AdminOrderDetailDialog({
  order,
  isOpen,
  onClose,
  onUpdateStatus,
}: AdminOrderDetailDialogProps) {
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | null>(null);
  const [note, setNote] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!order) return null;

  const shippingAddress = order.shippingAddress;
  const fullAddress = [
    shippingAddress.address,
    shippingAddress.ward,
    shippingAddress.district,
    shippingAddress.city,
  ].filter(Boolean).join(", ");

  const handleStatusChange = (value: string) => {
    setSelectedStatus(value as OrderStatus);
    setError(null);
  };

  const handleUpdateStatus = async () => {
    if (!selectedStatus || selectedStatus === order.status) return;

    setIsUpdating(true);
    setError(null);

    try {
      const data: UpdateOrderStatusRequest = {
        status: selectedStatus,
        note: note || undefined,
        cancelReason: selectedStatus === "cancelled" ? cancelReason : undefined,
      };

      await onUpdateStatus(order.id || order._id!, data);
      
      // Reset form
      setSelectedStatus(null);
      setNote("");
      setCancelReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cập nhật trạng thái thất bại");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleClose = () => {
    setSelectedStatus(null);
    setNote("");
    setCancelReason("");
    setError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Chi tiết đơn hàng {order.orderNumber}
            <OrderStatusBadge status={order.status} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status Update Section */}
          <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
            <h3 className="font-semibold text-sm">Cập nhật trạng thái</h3>
            <div className="flex flex-wrap gap-3">
              <Select
                value={selectedStatus ?? order.status}
                onValueChange={handleStatusChange}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Chọn trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((status) => (
                    <SelectItem key={status} value={status}>
                      {getOrderStatusLabel(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Button
                onClick={handleUpdateStatus}
                disabled={!selectedStatus || selectedStatus === order.status || isUpdating}
              >
                {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Cập nhật
              </Button>
            </div>

            {/* Note input */}
            {selectedStatus && selectedStatus !== order.status && (
              <div className="space-y-2">
                <Textarea
                  placeholder="Ghi chú (tùy chọn)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                />
              </div>
            )}

            {/* Cancel reason input */}
            {selectedStatus === "cancelled" && (
              <div className="space-y-2">
                <Textarea
                  placeholder="Lý do hủy đơn"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={2}
                />
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          {/* Customer Info */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Thông tin khách hàng</h3>
            <div className="p-3 bg-muted/50 rounded-lg space-y-1">
              <p className="font-medium text-sm">{order.user?.name ?? "N/A"}</p>
              <p className="text-sm text-muted-foreground">{order.user?.email ?? ""}</p>
            </div>
          </div>

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
        </div>
      </DialogContent>
    </Dialog>
  );
}
