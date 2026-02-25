import apiClient from '@/lib/axios';
import type {
  WishlistResponse,
  AddToWishlistResponse,
  RemoveFromWishlistResponse,
  CheckWishlistStatusResponse,
  CheckMultipleWishlistStatusResponse,
  ClearWishlistResponse,
} from '@/types/wishlist.type';

export const wishlistService = {
  /**
   * Get user's wishlist with populated product details
   * Requirements: 3.1, 3.2, 4.1
   */
  getWishlist: async (): Promise<WishlistResponse> => {
    const response = await apiClient.get<WishlistResponse>('/wishlist');
    return response.data;
  },

  /**
   * Add product to wishlist
   * Requirements: 1.1, 1.2, 4.2
   */
  addToWishlist: async (productId: string): Promise<AddToWishlistResponse> => {
    const response = await apiClient.post<AddToWishlistResponse>('/wishlist', { productId });
    return response.data;
  },

  /**
   * Remove product from wishlist
   * Requirements: 2.1, 2.2
   */
  removeFromWishlist: async (productId: string): Promise<RemoveFromWishlistResponse> => {
    const response = await apiClient.delete<RemoveFromWishlistResponse>(`/wishlist/${productId}`);
    return response.data;
  },

  /**
   * Check if a single product is in wishlist
   * Requirements: 7.1, 7.2
   */
  checkWishlistStatus: async (productId: string): Promise<CheckWishlistStatusResponse> => {
    const response = await apiClient.get<CheckWishlistStatusResponse>(`/wishlist/check/${productId}`);
    return response.data;
  },

  /**
   * Check multiple products wishlist status
   * Requirements: 7.1
   */
  checkMultipleWishlistStatus: async (productIds: string[]): Promise<CheckMultipleWishlistStatusResponse> => {
    const response = await apiClient.post<CheckMultipleWishlistStatusResponse>('/wishlist/check-multiple', { productIds });
    return response.data;
  },

  /**
   * Clear entire wishlist
   * Requirements: 2.1
   */
  clearWishlist: async (): Promise<ClearWishlistResponse> => {
    const response = await apiClient.delete<ClearWishlistResponse>('/wishlist');
    return response.data;
  },
};

// Export individual functions for direct use
export const {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  checkWishlistStatus,
  checkMultipleWishlistStatus,
  clearWishlist,
} = wishlistService;
