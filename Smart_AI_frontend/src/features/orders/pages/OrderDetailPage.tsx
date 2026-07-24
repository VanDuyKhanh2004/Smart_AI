import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { OrderDetailDialog } from "../components/OrderDetailDialog";
import { orderService } from "@/services/order.service";
import type { Order } from "@/types/order.type";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError("Mã đơn hàng không hợp lệ");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    orderService.getOrderById(id)
      .then((response) => {
        if (response.success) {
          setOrder(response.data);
        } else {
          setError(response.message || "Không thể tải thông tin đơn hàng");
        }
      })
      .catch((err) => {
        if (err.response?.status === 401 || err.response?.status === 403) {
          setError("Bạn cần đăng nhập để xem thông tin đơn hàng");
        } else if (err.response?.status === 404) {
          setError("Không tìm thấy đơn hàng");
        } else {
          setError("Đã xảy ra lỗi khi tải thông tin đơn hàng");
        }
      })
      .finally(() => setIsLoading(false));
  }, [id]);

  const handleClose = () => {
    navigate("/orders");
  };

  const handleOrderCancelled = (updatedOrder: Order) => {
    setOrder(updatedOrder);
    navigate("/orders");
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center py-16">
          <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
          <h2 className="text-xl font-semibold mb-2">Lỗi</h2>
          <p className="text-muted-foreground mb-4">{error}</p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => navigate("/orders")}>
              Quay lại đơn hàng
            </Button>
            <Button onClick={() => window.location.reload()}>
              Thử lại
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <OrderDetailDialog
        order={order}
        isOpen={true}
        onClose={handleClose}
        onOrderCancelled={handleOrderCancelled}
      />
    </div>
  );
}
