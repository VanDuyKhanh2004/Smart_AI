import type { Pagination } from './api.type';

export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipping' | 'delivered' | 'cancelled';

export interface OrderItem {
  product: string;
  name: string;
  price: number;
  quantity: number;
  color: string;
  image: string;
}

export interface ShippingAddress {
  fullName: string;
  phone: string;
  address: string;
  ward: string;
  district: string;
  city: string;
}

export interface OrderStatusHistoryEntry {
  status: OrderStatus;
  timestamp: string;
  note?: string;
}

export interface Order {
  id: string;
  _id?: string; // Keep for backward compatibility
  orderNumber: string;
  user: {
    id: string;
    _id?: string; // Keep for backward compatibility
    name: string;
    email: string;
  };
  items: OrderItem[];
  shippingAddress: ShippingAddress;
  subtotal: number;
  shippingFee: number;
  total: number;
  status: OrderStatus;
  statusHistory: OrderStatusHistoryEntry[];
  promotion?: OrderPromotion;
  confirmedAt?: string;
  shippedAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderPromotion {
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  discountAmount: number;
}

export interface CreateOrderRequest {
  shippingAddress: ShippingAddress;
  promotionCode?: string;
}

export interface CancelOrderRequest {
  reason: string;
  customReason?: string;
}

export const CANCEL_REASONS = [
  { value: 'changed_mind', label: 'Đổi ý không muốn mua nữa' },
  { value: 'found_better_price', label: 'Tìm được giá tốt hơn' },
  { value: 'wrong_product', label: 'Đặt nhầm sản phẩm' },
  { value: 'change_address', label: 'Muốn thay đổi địa chỉ giao hàng' },
  { value: 'other', label: 'Khác' },
] as const;

export type CancelReasonValue = typeof CANCEL_REASONS[number]['value'];

export interface UpdateOrderStatusRequest {
  status: OrderStatus;
  note?: string;
  cancelReason?: string;
}

export interface OrderFilterState {
  status?: OrderStatus;
  search?: string;
  startDate?: string;
  endDate?: string;
}

// API Response Types
export interface OrderResponse {
  success: boolean;
  message: string;
  data: Order;
}

// Backend pagination format
export interface BackendPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface OrderListResponse {
  success: boolean;
  message?: string;
  data: Order[] | { orders: Order[]; pagination: Pagination };
  pagination?: BackendPagination;
}

export interface OrderStats {
  total: number;
  pending: number;
  confirmed: number;
  processing: number;
  shipping: number;
  delivered: number;
  cancelled: number;
}

export interface OrderStatsResponse {
  success: boolean;
  message: string;
  data: OrderStats;
}

export interface OrderFilterParams {
  page?: number;
  limit?: number;
  status?: OrderStatus;
  search?: string;
  startDate?: string;
  endDate?: string;
}
