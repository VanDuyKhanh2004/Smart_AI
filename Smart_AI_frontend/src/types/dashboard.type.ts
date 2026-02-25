export type PeriodFilter = 'daily' | 'weekly' | 'monthly';

export interface RevenueData {
  period: string;
  revenue: number;
  orderCount: number;
}

export interface TopProduct {
  product: {
    _id: string;
    name: string;
    image: string;
    price: number;
  };
  totalQuantity: number;
  totalRevenue: number;
}

export interface OrderTrendData {
  period: string;
  pending: number;
  confirmed: number;
  processing: number;
  shipping: number;
  delivered: number;
  cancelled: number;
}

export interface UserStatsData {
  total: number;
  newUsers: Array<{ period: string; count: number }>;
}

export interface DashboardSummary {
  totalRevenue: number;
  totalOrders: number;
  totalUsers: number;
  pendingOrders: number;
  revenueChange: number;
  ordersChange: number;
  usersChange: number;
}

// API Response Types
export interface RevenueStatsResponse {
  success: boolean;
  message: string;
  data: RevenueData[];
}

export interface TopProductsResponse {
  success: boolean;
  message: string;
  data: TopProduct[];
}

export interface OrderTrendsResponse {
  success: boolean;
  message: string;
  data: OrderTrendData[];
}

export interface UserStatsResponse {
  success: boolean;
  message: string;
  data: UserStatsData;
}

export interface DashboardSummaryResponse {
  success: boolean;
  message: string;
  data: DashboardSummary;
}
