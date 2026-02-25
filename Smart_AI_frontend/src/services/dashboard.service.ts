import apiClient from '@/lib/axios';
import type {
  PeriodFilter,
  RevenueStatsResponse,
  TopProductsResponse,
  OrderTrendsResponse,
  UserStatsResponse,
  DashboardSummaryResponse,
} from '@/types/dashboard.type';

export const dashboardService = {
  /**
   * Get revenue statistics by period
   */
  getRevenueStats: async (period: PeriodFilter): Promise<RevenueStatsResponse> => {
    const response = await apiClient.get<RevenueStatsResponse>('/dashboard/revenue', {
      params: { period },
    });
    return response.data;
  },

  /**
   * Get top selling products
   */
  getTopSellingProducts: async (limit = 10): Promise<TopProductsResponse> => {
    const response = await apiClient.get<TopProductsResponse>('/dashboard/top-products', {
      params: { limit },
    });
    return response.data;
  },

  /**
   * Get order trends by period
   */
  getOrderTrends: async (period: PeriodFilter): Promise<OrderTrendsResponse> => {
    const response = await apiClient.get<OrderTrendsResponse>('/dashboard/order-trends', {
      params: { period },
    });
    return response.data;
  },

  /**
   * Get user registration statistics
   */
  getUserStats: async (period: PeriodFilter): Promise<UserStatsResponse> => {
    const response = await apiClient.get<UserStatsResponse>('/dashboard/user-stats', {
      params: { period },
    });
    return response.data;
  },

  /**
   * Get dashboard summary with key metrics
   */
  getDashboardSummary: async (): Promise<DashboardSummaryResponse> => {
    const response = await apiClient.get<DashboardSummaryResponse>('/dashboard/summary');
    return response.data;
  },
};

// Export individual functions for direct use
export const {
  getRevenueStats,
  getTopSellingProducts,
  getOrderTrends,
  getUserStats,
  getDashboardSummary,
} = dashboardService;
