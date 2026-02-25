import { useState, useCallback, useEffect } from "react";
import { OrderCard } from "../components/OrderCard";
import { OrderDetailDialog } from "../components/OrderDetailDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { orderService } from "@/services/order.service";
import type { Order } from "@/types/order.type";
import type { Pagination as PaginationType } from "@/types/api.type";
import { PackageOpen, RefreshCw } from "lucide-react";

const DEFAULT_PAGINATION: PaginationType = {
  currentPage: 1,
  totalPages: 1,
  totalCount: 0,
  limit: 10,
  hasNextPage: false,
  hasPrevPage: false,
  nextPage: null,
  prevPage: null,
};

/**
 * OrderHistoryPage displays paginated list of user's orders
 * Requirements 2.1, 2.4, 2.5: Display orders sorted by date, loading and empty states
 */
export function OrderHistoryPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [pagination, setPagination] = useState<PaginationType>(DEFAULT_PAGINATION);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Selected order for detail dialog
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Fetch orders
  const fetchOrders = useCallback(async (pageNum: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await orderService.getUserOrders(pageNum, 10);
      if (response.success) {
        // Handle response - backend returns data as array directly
        const ordersData = Array.isArray(response.data) ? response.data : (response.data as { orders: Order[] }).orders || [];
        setOrders(ordersData);
        
        // Map backend pagination to frontend format
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const backendPagination: any = response.pagination || (!Array.isArray(response.data) ? (response.data as any).pagination : undefined);
        if (backendPagination) {
          const pageNum = backendPagination.page || backendPagination.currentPage || 1;
          const totalPagesNum = backendPagination.totalPages || 1;
          setPagination({
            currentPage: pageNum,
            totalPages: totalPagesNum,
            totalCount: backendPagination.total || backendPagination.totalCount || 0,
            limit: backendPagination.limit || 10,
            hasNextPage: pageNum < totalPagesNum,
            hasPrevPage: pageNum > 1,
            nextPage: pageNum < totalPagesNum ? pageNum + 1 : null,
            prevPage: pageNum > 1 ? pageNum - 1 : null,
          });
        }
      } else {
        setError("Không thể tải danh sách đơn hàng");
      }
    } catch {
      setError("Đã xảy ra lỗi khi tải danh sách đơn hàng");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchOrders(page);
  }, [page, fetchOrders]);

  // Handle page change
  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  // Handle order click to open detail dialog
  const handleOrderClick = useCallback((order: Order) => {
    setSelectedOrder(order);
    setIsDialogOpen(true);
  }, []);

  // Handle dialog close
  const handleDialogClose = useCallback(() => {
    setIsDialogOpen(false);
    setSelectedOrder(null);
  }, []);

  // Handle order cancelled - refresh the list
  const handleOrderCancelled = useCallback((cancelledOrder: Order) => {
    // Update the order in the list
    setOrders(prevOrders => 
      prevOrders.map(order => 
        (order.id || order._id) === (cancelledOrder.id || cancelledOrder._id) 
          ? cancelledOrder 
          : order
      )
    );
    setIsDialogOpen(false);
    setSelectedOrder(null);
  }, []);

  // Handle retry
  const handleRetry = useCallback(() => {
    fetchOrders(page);
  }, [fetchOrders, page]);

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pages: number[] = [];
    const { currentPage, totalPages } = pagination;
    
    // Show max 5 page numbers
    let start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, start + 4);
    
    if (end - start < 4) {
      start = Math.max(1, end - 4);
    }
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    
    return pages;
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Đơn hàng của tôi</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRetry}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Làm mới
        </Button>
      </div>

      {/* Error State */}
      {error && (
        <div className="text-center py-8">
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={handleRetry}>Thử lại</Button>
        </div>
      )}

      {/* Loading State - Requirements 2.4 */}
      {isLoading && !error && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="space-y-3 p-6 border rounded-xl">
              <div className="flex justify-between">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-20" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State - Requirements 2.5 */}
      {!isLoading && !error && orders.length === 0 && (
        <div className="text-center py-16">
          <PackageOpen className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Chưa có đơn hàng nào</h2>
          <p className="text-muted-foreground mb-4">
            Bạn chưa đặt đơn hàng nào. Hãy khám phá sản phẩm và đặt hàng ngay!
          </p>
          <Button asChild>
            <a href="/products">Xem sản phẩm</a>
          </Button>
        </div>
      )}

      {/* Orders List - Requirements 2.1 */}
      {!isLoading && !error && orders.length > 0 && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {orders.map((order) => (
              <OrderCard
                key={order.id || order._id}
                order={order}
                onClick={() => handleOrderClick(order)}
              />
            ))}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => pagination.hasPrevPage && handlePageChange(page - 1)}
                    className={!pagination.hasPrevPage ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
                
                {getPageNumbers().map((pageNum) => (
                  <PaginationItem key={pageNum}>
                    <PaginationLink
                      onClick={() => handlePageChange(pageNum)}
                      isActive={pageNum === pagination.currentPage}
                      className="cursor-pointer"
                    >
                      {pageNum}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                
                <PaginationItem>
                  <PaginationNext
                    onClick={() => pagination.hasNextPage && handlePageChange(page + 1)}
                    className={!pagination.hasNextPage ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}

          {/* Order count info */}
          <p className="text-center text-sm text-muted-foreground">
            Hiển thị {orders.length} / {pagination.totalCount} đơn hàng
          </p>
        </>
      )}

      {/* Detail Dialog - Requirements 2.3 */}
      <OrderDetailDialog
        order={selectedOrder}
        isOpen={isDialogOpen}
        onClose={handleDialogClose}
        onOrderCancelled={handleOrderCancelled}
      />
    </div>
  );
}
