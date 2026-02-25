import { useState, useEffect, useCallback } from "react";
import { OrderStats } from "../components/OrderStats";
import { OrderFilters } from "../components/OrderFilters";
import { OrderTable } from "../components/OrderTable";
import { AdminOrderDetailDialog } from "../components/AdminOrderDetailDialog";
import { orderService } from "@/services/order.service";
import type {
  Order,
  OrderFilterState,
  OrderStats as OrderStatsType,
  UpdateOrderStatusRequest,
} from "@/types/order.type";
import type { Pagination } from "@/types/api.type";

const DEFAULT_PAGINATION: Pagination = {
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
 * AdminOrderPage - Order management page for admin
 * Requirements 3.1: Display paginated table of all orders
 * Requirements 3.4: Handle loading indicator
 * Requirements 3.5: Handle API errors
 */
export function AdminOrderPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<OrderStatsType | null>(null);
  const [pagination, setPagination] = useState<Pagination>(DEFAULT_PAGINATION);
  const [filters, setFilters] = useState<OrderFilterState>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Fetch orders
  const fetchOrders = useCallback(async (page: number, filterParams: OrderFilterState) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await orderService.getAllOrders({
        page,
        limit: 10,
        ...filterParams,
      });

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải danh sách đơn hàng");
    } finally {
      setIsLoading(false);
    }
  }, []);


  // Fetch stats
  const fetchStats = useCallback(async () => {
    setIsStatsLoading(true);

    try {
      const response = await orderService.getOrderStats();
      // Handle backend response format: { total, byStatus: { pending, confirmed, ... } }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = response.data as any;
      if (data.byStatus) {
        // Map backend format to frontend format
        setStats({
          total: data.total || 0,
          pending: data.byStatus.pending || 0,
          confirmed: data.byStatus.confirmed || 0,
          processing: data.byStatus.processing || 0,
          shipping: data.byStatus.shipping || 0,
          delivered: data.byStatus.delivered || 0,
          cancelled: data.byStatus.cancelled || 0,
        });
      } else {
        // Already in correct format
        setStats(response.data);
      }
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    } finally {
      setIsStatsLoading(false);
    }
  }, []);

  // Fetch orders when page or filters change
  useEffect(() => {
    fetchOrders(currentPage, filters);
  }, [currentPage, filters, fetchOrders]);

  // Fetch stats on initial load
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Handle filter change - reset to page 1
  // Requirements 5.4: Filter change resets pagination to page 1
  const handleFilterChange = useCallback((newFilters: OrderFilterState) => {
    setFilters(newFilters);
    setCurrentPage(1);
  }, []);

  // Handle clear filters
  // Requirements 5.5: Reset all filters to default values
  const handleClearFilters = useCallback(() => {
    setFilters({});
    setCurrentPage(1);
  }, []);

  // Handle page change
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  // Handle order click
  const handleOrderClick = useCallback((order: Order) => {
    setSelectedOrder(order);
    setIsDialogOpen(true);
  }, []);

  // Handle dialog close
  const handleDialogClose = useCallback(() => {
    setIsDialogOpen(false);
    setSelectedOrder(null);
  }, []);

  // Handle status update with optimistic UI
  // Requirements 4.6: Handle status update with optimistic UI
  const handleUpdateStatus = useCallback(async (orderId: string, data: UpdateOrderStatusRequest) => {
    // Optimistic update
    const previousOrders = [...orders];
    const previousSelectedOrder = selectedOrder;

    setOrders((prev) =>
      prev.map((order) =>
        (order.id || order._id) === orderId ? { ...order, status: data.status } : order
      )
    );

    if (selectedOrder && (selectedOrder.id || selectedOrder._id) === orderId) {
      setSelectedOrder((prev) =>
        prev ? { ...prev, status: data.status } : null
      );
    }

    try {
      const response = await orderService.updateOrderStatus(orderId, data);
      
      // Update with actual data from server
      setOrders((prev) =>
        prev.map((order) =>
          (order.id || order._id) === orderId ? response.data : order
        )
      );

      if (selectedOrder && (selectedOrder.id || selectedOrder._id) === orderId) {
        setSelectedOrder(response.data);
      }

      // Refresh stats after status update
      fetchStats();
    } catch (err) {
      // Rollback on error
      setOrders(previousOrders);
      setSelectedOrder(previousSelectedOrder);
      throw err;
    }
  }, [orders, selectedOrder, fetchStats]);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Quản lý đơn hàng</h1>
      </div>

      {/* Stats */}
      <OrderStats stats={stats} isLoading={isStatsLoading} />

      {/* Filters */}
      <OrderFilters
        filters={filters}
        onFilterChange={handleFilterChange}
        onClearFilters={handleClearFilters}
      />

      {/* Error message */}
      {error && (
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
          {error}
        </div>
      )}

      {/* Orders table */}
      <OrderTable
        orders={orders}
        pagination={pagination}
        onPageChange={handlePageChange}
        onOrderClick={handleOrderClick}
        isLoading={isLoading}
      />

      {/* Order detail dialog */}
      <AdminOrderDetailDialog
        order={selectedOrder}
        isOpen={isDialogOpen}
        onClose={handleDialogClose}
        onUpdateStatus={handleUpdateStatus}
      />
    </div>
  );
}
