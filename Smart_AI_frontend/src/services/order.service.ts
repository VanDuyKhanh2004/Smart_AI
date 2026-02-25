import apiClient from '@/lib/axios';
import type {
  OrderResponse,
  OrderListResponse,
  OrderStatsResponse,
  CreateOrderRequest,
  UpdateOrderStatusRequest,
  OrderFilterParams,
  CancelOrderRequest,
} from '@/types/order.type';

export const orderService = {
  /**
   * Create a new order from cart
   */
  createOrder: async (data: CreateOrderRequest): Promise<OrderResponse> => {
    const response = await apiClient.post<OrderResponse>('/orders', data);
    return response.data;
  },

  /**
   * Get current user's orders with pagination
   */
  getUserOrders: async (page = 1, limit = 10): Promise<OrderListResponse> => {
    const response = await apiClient.get<OrderListResponse>('/orders', {
      params: { page, limit },
    });
    return response.data;
  },

  /**
   * Get single order by ID
   */
  getOrderById: async (id: string): Promise<OrderResponse> => {
    const response = await apiClient.get<OrderResponse>(`/orders/${id}`);
    return response.data;
  },

  /**
   * Get all orders with filters (admin only)
   */
  getAllOrders: async (params: OrderFilterParams): Promise<OrderListResponse> => {
    const response = await apiClient.get<OrderListResponse>('/orders/admin/all', {
      params,
    });
    return response.data;
  },

  /**
   * Get order statistics (admin only)
   */
  getOrderStats: async (): Promise<OrderStatsResponse> => {
    const response = await apiClient.get<OrderStatsResponse>('/orders/admin/stats');
    return response.data;
  },

  /**
   * Update order status (admin only)
   */
  updateOrderStatus: async (id: string, data: UpdateOrderStatusRequest): Promise<OrderResponse> => {
    const response = await apiClient.patch<OrderResponse>(`/orders/${id}/status`, data);
    return response.data;
  },

  /**
   * Cancel order (user only, for pending/confirmed orders)
   */
  cancelOrder: async (id: string, data: CancelOrderRequest): Promise<OrderResponse> => {
    const response = await apiClient.post<OrderResponse>(`/orders/${id}/cancel`, data);
    return response.data;
  },
};

// Export individual functions for direct use
export const {
  createOrder,
  getUserOrders,
  getOrderById,
  getAllOrders,
  getOrderStats,
  updateOrderStatus,
  cancelOrder,
} = orderService;
