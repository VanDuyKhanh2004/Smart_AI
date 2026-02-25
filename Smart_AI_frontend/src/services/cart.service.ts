import apiClient from '@/lib/axios';
import type {
  CartResponse,
  AddToCartRequest,
  UpdateCartItemRequest,
  LocalCartItem,
} from '@/types/cart.type';

export const cartService = {
  /**
   * Get user's cart with populated product details
   */
  getCart: async (): Promise<CartResponse> => {
    const response = await apiClient.get<CartResponse>('/cart');
    return response.data;
  },

  /**
   * Add item to cart
   */
  addItem: async (data: AddToCartRequest): Promise<CartResponse> => {
    const response = await apiClient.post<CartResponse>('/cart/items', data);
    return response.data;
  },

  /**
   * Update item quantity in cart
   */
  updateItem: async (itemId: string, data: UpdateCartItemRequest): Promise<CartResponse> => {
    const response = await apiClient.put<CartResponse>(`/cart/items/${itemId}`, data);
    return response.data;
  },

  /**
   * Remove item from cart
   */
  removeItem: async (itemId: string): Promise<CartResponse> => {
    const response = await apiClient.delete<CartResponse>(`/cart/items/${itemId}`);
    return response.data;
  },

  /**
   * Clear entire cart
   */
  clearCart: async (): Promise<void> => {
    await apiClient.delete('/cart');
  },

  /**
   * Merge guest cart items into user cart on login
   */
  mergeCart: async (items: LocalCartItem[]): Promise<CartResponse> => {
    const response = await apiClient.post<CartResponse>('/cart/merge', { items });
    return response.data;
  },
};

// Export individual functions for direct use
export const { getCart, addItem, updateItem, removeItem, clearCart, mergeCart } = cartService;
