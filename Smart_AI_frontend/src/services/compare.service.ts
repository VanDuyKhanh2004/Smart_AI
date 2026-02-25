import apiClient from '@/lib/axios';
import type {
  GetCompareHistoryResponse,
  SaveCompareHistoryResponse,
  GetCompareProductsResponse,
  DeleteCompareHistoryResponse,
} from '@/types/compare.type';

export const compareService = {
  /**
   * Get products for comparison (public endpoint)
   * Requirements: 3.2, 6.3
   */
  getCompareProducts: async (productIds: string[]): Promise<GetCompareProductsResponse> => {
    try {
      const response = await apiClient.get<GetCompareProductsResponse>('/compare/products', {
        params: {
          ids: productIds.join(','),
        },
      });
      return response.data;
    } catch (error) {
      throw new Error(error as string);
    }
  },

  /**
   * Save comparison to history (requires authentication)
   * Requirements: 5.1
   */
  saveToHistory: async (productIds: string[]): Promise<SaveCompareHistoryResponse> => {
    try {
      const response = await apiClient.post<SaveCompareHistoryResponse>('/compare/history', {
        products: productIds,
      });
      return response.data;
    } catch (error) {
      throw new Error(error as string);
    }
  },

  /**
   * Get user's comparison history (requires authentication)
   * Requirements: 5.3
   */
  getHistory: async (): Promise<GetCompareHistoryResponse> => {
    try {
      const response = await apiClient.get<GetCompareHistoryResponse>('/compare/history');
      return response.data;
    } catch (error) {
      throw new Error(error as string);
    }
  },

  /**
   * Delete comparison from history (requires authentication)
   * Requirements: 5.6
   */
  deleteFromHistory: async (id: string): Promise<DeleteCompareHistoryResponse> => {
    try {
      const response = await apiClient.delete<DeleteCompareHistoryResponse>(`/compare/history/${id}`);
      return response.data;
    } catch (error) {
      throw new Error(error as string);
    }
  },
};

// Export individual functions for direct use if needed
export const { getCompareProducts, saveToHistory, getHistory, deleteFromHistory } = compareService;
