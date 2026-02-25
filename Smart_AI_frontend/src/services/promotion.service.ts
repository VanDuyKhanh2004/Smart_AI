import apiClient from '@/lib/axios';
import type {
  PromotionResponse,
  PromotionListResponse,
  CreatePromotionRequest,
  UpdatePromotionRequest,
  ValidatePromotionRequest,
  ValidatePromotionResponse,
  DeletePromotionResponse,
  PromotionFilterParams,
} from '@/types/promotion.type';

export const promotionService = {
  // ==================== Admin Methods ====================

  /**
   * Get all promotions with pagination and filters (admin only)
   */
  getPromotions: async (params?: PromotionFilterParams): Promise<PromotionListResponse> => {
    const response = await apiClient.get<PromotionListResponse>('/promotions', {
      params,
    });
    return response.data;
  },

  /**
   * Get single promotion by ID (admin only)
   */
  getPromotion: async (id: string): Promise<PromotionResponse> => {
    const response = await apiClient.get<PromotionResponse>(`/promotions/${id}`);
    return response.data;
  },

  /**
   * Create a new promotion (admin only)
   */
  createPromotion: async (data: CreatePromotionRequest): Promise<PromotionResponse> => {
    const response = await apiClient.post<PromotionResponse>('/promotions', data);
    return response.data;
  },

  /**
   * Update an existing promotion (admin only)
   */
  updatePromotion: async (id: string, data: UpdatePromotionRequest): Promise<PromotionResponse> => {
    const response = await apiClient.put<PromotionResponse>(`/promotions/${id}`, data);
    return response.data;
  },

  /**
   * Delete a promotion (admin only)
   */
  deletePromotion: async (id: string): Promise<DeletePromotionResponse> => {
    const response = await apiClient.delete<DeletePromotionResponse>(`/promotions/${id}`);
    return response.data;
  },

  /**
   * Toggle promotion active status (admin only)
   */
  toggleStatus: async (id: string): Promise<PromotionResponse> => {
    const response = await apiClient.patch<PromotionResponse>(`/promotions/${id}/toggle`);
    return response.data;
  },

  // ==================== User Methods ====================

  /**
   * Validate a promotion code and calculate discount (user)
   */
  validatePromotion: async (data: ValidatePromotionRequest): Promise<ValidatePromotionResponse> => {
    const response = await apiClient.post<ValidatePromotionResponse>('/promotions/validate', data);
    return response.data;
  },
};

// Export individual functions for direct use
export const {
  getPromotions,
  getPromotion,
  createPromotion,
  updatePromotion,
  deletePromotion,
  toggleStatus,
  validatePromotion,
} = promotionService;
