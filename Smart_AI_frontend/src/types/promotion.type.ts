export type DiscountType = 'percentage' | 'fixed';

export type PromotionStatus = 'active' | 'inactive' | 'expired' | 'depleted';

export interface Promotion {
  _id: string;
  id?: string;
  code: string;
  description?: string;
  discountType: DiscountType;
  discountValue: number;
  minOrderValue: number;
  maxDiscountAmount?: number | null;
  usageLimit: number;
  usedCount: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePromotionRequest {
  code: string;
  description?: string;
  discountType: DiscountType;
  discountValue: number;
  minOrderValue?: number;
  maxDiscountAmount?: number | null;
  usageLimit: number;
  startDate: string;
  endDate: string;
}

export interface UpdatePromotionRequest {
  description?: string;
  discountValue?: number;
  minOrderValue?: number;
  maxDiscountAmount?: number | null;
  usageLimit?: number;
  endDate?: string;
  isActive?: boolean;
}

export interface ValidatePromotionRequest {
  code: string;
  orderTotal: number;
}

export interface ValidatePromotionResponse {
  success: boolean;
  message: string;
  data: {
    promotion: Promotion;
    discountAmount: number;
    finalTotal: number;
  };
}

export interface PromotionResponse {
  success: boolean;
  message: string;
  data: Promotion;
}

export interface PromotionListResponse {
  success: boolean;
  message: string;
  data: Promotion[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface DeletePromotionResponse {
  success: boolean;
  message: string;
}

export interface PromotionFilterParams {
  page?: number;
  limit?: number;
  status?: PromotionStatus;
}

/**
 * Get the current status of a promotion based on its properties
 */
export const getPromotionStatus = (promotion: Promotion): PromotionStatus => {
  const now = new Date();
  const endDate = new Date(promotion.endDate);
  
  if (!promotion.isActive) return 'inactive';
  if (endDate < now) return 'expired';
  if (promotion.usedCount >= promotion.usageLimit) return 'depleted';
  return 'active';
};

/**
 * Get display label for promotion status
 */
export const getPromotionStatusLabel = (status: PromotionStatus): string => {
  const labels: Record<PromotionStatus, string> = {
    active: 'Đang hoạt động',
    inactive: 'Tạm dừng',
    expired: 'Hết hạn',
    depleted: 'Hết lượt',
  };
  return labels[status];
};

/**
 * Format discount value for display
 */
export const formatDiscount = (promotion: Promotion): string => {
  if (promotion.discountType === 'percentage') {
    return `${promotion.discountValue}%`;
  }
  return `${promotion.discountValue.toLocaleString('vi-VN')}đ`;
};
