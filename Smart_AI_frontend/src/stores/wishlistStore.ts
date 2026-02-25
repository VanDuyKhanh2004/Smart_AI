import { create } from 'zustand';
import { wishlistService } from '@/services/wishlist.service';
import { useCartStore } from '@/stores/cartStore';
import type { WishlistItem, WishlistStatusMap } from '@/types/wishlist.type';

interface WishlistState {
  items: WishlistItem[];
  wishlistMap: WishlistStatusMap;
  isLoading: boolean;
  error: string | null;
}

interface WishlistActions {
  // Computed getters
  getItemCount: () => number;
  isInWishlist: (productId: string) => boolean;

  // Actions
  fetchWishlist: () => Promise<void>;
  addItem: (productId: string) => Promise<void>;
  removeItem: (productId: string) => Promise<void>;
  toggleWishlist: (productId: string) => Promise<void>;
  checkMultipleStatus: (productIds: string[]) => Promise<void>;
  moveToCart: (productId: string, color: string, removeAfterAdd?: boolean) => Promise<void>;
  clearWishlist: () => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

type WishlistStore = WishlistState & WishlistActions;

export const useWishlistStore = create<WishlistStore>((set, get) => ({
  items: [],
  wishlistMap: {},
  isLoading: false,
  error: null,

  // Computed: total number of items in wishlist
  getItemCount: () => {
    return get().items.length;
  },

  // Check if product is in wishlist using local map
  isInWishlist: (productId: string) => {
    return get().wishlistMap[productId] ?? false;
  },

  // Fetch wishlist from server
  // Requirements: 4.1 - Load wishlist from database on login
  fetchWishlist: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await wishlistService.getWishlist();
      const items = response.data.items;
      
      // Build wishlistMap from items for quick lookup
      // Handle case where product might be string (not populated) or object
      const wishlistMap: WishlistStatusMap = {};
      items.forEach((item) => {
        const productId = typeof item.product === 'string' 
          ? item.product 
          : item.product?._id;
        if (productId) {
          wishlistMap[productId] = true;
        }
      });

      set({ items, wishlistMap, isLoading: false });
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      set({
        isLoading: false,
        error: axiosError.response?.data?.message || 'Failed to fetch wishlist',
      });
    }
  },

  // Add item to wishlist
  // Requirements: 1.1 - Add product to wishlist
  // Requirements: 4.2 - Persist changes to database immediately
  addItem: async (productId: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await wishlistService.addToWishlist(productId);
      const items = response.data.items;

      // Update wishlistMap - handle case where product might be string or object
      const wishlistMap: WishlistStatusMap = {};
      items.forEach((item) => {
        const pid = typeof item.product === 'string' 
          ? item.product 
          : item.product?._id;
        if (pid) {
          wishlistMap[pid] = true;
        }
      });

      set({ items, wishlistMap, isLoading: false });
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      set({
        isLoading: false,
        error: axiosError.response?.data?.message || 'Failed to add item to wishlist',
      });
      throw error;
    }
  },

  // Remove item from wishlist
  // Requirements: 2.1 - Remove product from wishlist
  removeItem: async (productId: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await wishlistService.removeFromWishlist(productId);
      const items = response.data.items;

      // Update wishlistMap - handle case where product might be string or object
      const wishlistMap: WishlistStatusMap = {};
      items.forEach((item) => {
        const pid = typeof item.product === 'string' 
          ? item.product 
          : item.product?._id;
        if (pid) {
          wishlistMap[pid] = true;
        }
      });

      set({ items, wishlistMap, isLoading: false });
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      set({
        isLoading: false,
        error: axiosError.response?.data?.message || 'Failed to remove item from wishlist',
      });
      throw error;
    }
  },

  // Toggle wishlist status (add if not in wishlist, remove if in wishlist)
  // Requirements: 1.1, 2.1
  toggleWishlist: async (productId: string) => {
    const { isInWishlist, addItem, removeItem } = get();
    if (isInWishlist(productId)) {
      await removeItem(productId);
    } else {
      await addItem(productId);
    }
  },

  // Check multiple products wishlist status (for product list)
  // Requirements: 7.1 - Show filled heart if product is in wishlist
  checkMultipleStatus: async (productIds: string[]) => {
    if (productIds.length === 0) return;

    try {
      const response = await wishlistService.checkMultipleWishlistStatus(productIds);
      const statusMap = response.data;

      set((state) => ({
        wishlistMap: { ...state.wishlistMap, ...statusMap },
      }));
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      set({
        error: axiosError.response?.data?.message || 'Failed to check wishlist status',
      });
    }
  },

  // Move product from wishlist to cart
  // Requirements: 5.1 - Add product to cart with quantity 1
  // Requirements: 5.4 - Optionally remove from wishlist after adding
  moveToCart: async (productId: string, color: string, removeAfterAdd: boolean = false) => {
    set({ isLoading: true, error: null });
    try {
      // Find the item in wishlist to check stock
      const item = get().items.find((i) => i.product._id === productId);
      
      // Requirements: 5.3 - Check if product is out of stock
      if (item && item.product.inStock <= 0) {
        set({
          isLoading: false,
          error: 'Sản phẩm đã hết hàng',
        });
        throw new Error('Sản phẩm đã hết hàng');
      }

      // Add to cart with quantity 1
      await useCartStore.getState().addItem(productId, 1, color);

      // Optionally remove from wishlist after adding to cart
      if (removeAfterAdd) {
        await get().removeItem(productId);
      }

      set({ isLoading: false });
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 
        (error instanceof Error ? error.message : 'Failed to move item to cart');
      set({
        isLoading: false,
        error: errorMessage,
      });
      throw error;
    }
  },

  // Clear entire wishlist
  // Requirements: 2.1
  clearWishlist: async () => {
    set({ isLoading: true, error: null });
    try {
      await wishlistService.clearWishlist();
      set({ items: [], wishlistMap: {}, isLoading: false });
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      set({
        isLoading: false,
        error: axiosError.response?.data?.message || 'Failed to clear wishlist',
      });
      throw error;
    }
  },

  // Clear error
  clearError: () => {
    set({ error: null });
  },

  // Reset store (useful for logout)
  reset: () => {
    set({ items: [], wishlistMap: {}, isLoading: false, error: null });
  },
}));
