import React, { useState } from 'react';
import { ShoppingBag, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface CartSummaryProps {
  totalItems: number;
  totalPrice: number;
  onClearCart: () => void | Promise<void>;
  onCheckout?: () => void;
  isLoading?: boolean;
}

const CartSummary: React.FC<CartSummaryProps> = ({
  totalItems,
  totalPrice,
  onClearCart,
  onCheckout,
  isLoading = false,
}) => {
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(price);
  };

  const handleClearConfirm = async () => {
    if (isClearing) return;
    setClearError(null);
    setIsClearing(true);
    try {
      await onClearCart();
      setShowClearDialog(false);
    } catch {
      // Keep the dialog open so the failure stays readable (H03).
      setClearError('Không thể xóa giỏ hàng. Vui lòng thử lại.');
    } finally {
      setIsClearing(false);
    }
  };

  const handleClearDialogOpenChange = (open: boolean) => {
    if (isClearing) return;
    setClearError(null);
    setShowClearDialog(open);
  };

  const isEmpty = totalItems === 0;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tóm tắt đơn hàng</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Số lượng sản phẩm:</span>
            <span className="font-medium">{totalItems}</span>
          </div>
          <div className="border-t pt-4">
            <div className="flex justify-between">
              <span className="font-medium">Tổng cộng:</span>
              <span className="text-xl font-bold text-primary">
                {formatPrice(totalPrice)}
              </span>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Button
            className="w-full"
            size="lg"
            disabled={isEmpty || isLoading}
            onClick={onCheckout}
          >
            <ShoppingBag className="h-5 w-5 mr-2" />
            Thanh toán
          </Button>
          <Button
            variant="outline"
            className="w-full"
            disabled={isEmpty || isLoading}
            onClick={() => handleClearDialogOpenChange(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Xóa tất cả
          </Button>
        </CardFooter>
      </Card>

      {/* Clear Cart Confirmation Dialog */}
      <Dialog open={showClearDialog} onOpenChange={handleClearDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận xóa giỏ hàng</DialogTitle>
            <DialogDescription>
              Bạn có chắc chắn muốn xóa tất cả sản phẩm trong giỏ hàng? Hành động này không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          {clearError && (
            <Alert variant="destructive">
              <AlertDescription>{clearError}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleClearDialogOpenChange(false)}
              disabled={isClearing || isLoading}
            >
              Hủy
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearConfirm}
              disabled={isClearing || isLoading}
            >
              {isClearing ? 'Đang xóa...' : 'Xóa tất cả'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CartSummary;
