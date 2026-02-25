import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CANCEL_REASONS, type CancelReasonValue } from "@/types/order.type";
import { Loader2 } from "lucide-react";

interface CancelOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string, customReason?: string) => Promise<void>;
  orderNumber: string;
}

/**
 * CancelOrderModal displays cancellation reason options
 * Requirements 1.2, 2.1, 2.2, 2.3: Modal with predefined reasons and custom input
 */
export function CancelOrderModal({
  isOpen,
  onClose,
  onConfirm,
  orderNumber,
}: CancelOrderModalProps) {
  const [selectedReason, setSelectedReason] = useState<CancelReasonValue | "">("");
  const [customReason, setCustomReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    // Validation - Requirements 2.3
    if (!selectedReason) {
      setError("Vui lòng chọn lý do hủy đơn hàng");
      return;
    }

    if (selectedReason === "other" && !customReason.trim()) {
      setError("Vui lòng nhập lý do hủy đơn hàng");
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      await onConfirm(selectedReason, selectedReason === "other" ? customReason.trim() : undefined);
      handleClose();
    } catch {
      setError("Không thể hủy đơn hàng. Vui lòng thử lại.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setSelectedReason("");
      setCustomReason("");
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hủy đơn hàng</DialogTitle>
          <DialogDescription>
            Bạn có chắc chắn muốn hủy đơn hàng <span className="font-semibold">{orderNumber}</span>?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Cancellation Reasons - Requirements 2.1 */}
          <div className="space-y-3">
            <p className="text-sm font-medium">Lý do hủy đơn hàng:</p>
            <div className="space-y-2">
              {CANCEL_REASONS.map((reason) => (
                <label
                  key={reason.value}
                  className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <input
                    type="radio"
                    name="cancelReason"
                    value={reason.value}
                    checked={selectedReason === reason.value}
                    onChange={(e) => {
                      setSelectedReason(e.target.value as CancelReasonValue);
                      setError(null);
                    }}
                    className="h-4 w-4 text-primary"
                    disabled={isLoading}
                  />
                  <span className="text-sm">{reason.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Custom Reason Input - Requirements 2.2 */}
          {selectedReason === "other" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Nhập lý do khác:</label>
              <Textarea
                value={customReason}
                onChange={(e) => {
                  setCustomReason(e.target.value);
                  setError(null);
                }}
                placeholder="Nhập lý do hủy đơn hàng của bạn..."
                className="resize-none"
                rows={3}
                disabled={isLoading}
              />
            </div>
          )}

          {/* Error Message */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
          >
            Đóng
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isLoading || !selectedReason}
          >
            {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Xác nhận hủy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
