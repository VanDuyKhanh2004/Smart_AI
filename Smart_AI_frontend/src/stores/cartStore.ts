import { create } from 'zustand';
import { cartService } from '@/services/cart.service';
import type { CartItem, LocalCartItem } from '@/types/cart.type';

const LOCAL_CART_KEY = 'guestCart';

interface CartState {
  items: CartItem[];
  isLoading: boolean;
  error: string | null;
}

interface CartActions {
  // Computed getters
  getTotalItems: () => number;
  getTotalPrice: () => number;
  
  // Actions
  fetchCart: () => Promise<void>;
  addItem: (productId: string, quantity: number, color: string) => Promise<void>;
  updateQuantity: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  
  // localStorage functions
  loadFromLocalStorage: () => void;
  saveToLocalStorage: () => void;
  clearLocalCart: () => void;
  
  // Guest cart merge
  mergeGuestCart: () => Promise<void>;
  
  // Helper
  clearError: () => void;
  setItems: (items: CartItem[]) => void;
}

type CartStore = CartState & CartActions;

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  isLoading: false,
  error: null,

  // Computed: total number of items (sum of quantities)
  getTotalItems: () => {
    return get().items.reduce((total, item) => total + item.quantity, 0);
  },

  // Computed: total price of all items
  getTotalPrice: () => {
    return get().items.reduce((total, item) => {
      return total + (item.product.price * item.quantity);
    }, 0);
  },

  // Fetch cart from server (for authenticated users)
  fetchCart: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await cartService.getCart();
      set({ items: response.data.items, isLoading: false });
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      set({
        isLoading: false,
        error: axiosError.response?.data?.message || 'Failed to fetch cart',
      });
    }
  },


  // Add item to cart
  addItem: async (productId: string, quantity: number, color: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await cartService.addItem({ productId, quantity, color });
      set({ items: response.data.items, isLoading: false });
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      set({
        isLoading: false,
        error: axiosError.response?.data?.message || 'Failed to add item to cart',
      });
      throw error;
    }
  },

  // Update item quantity
  updateQuantity: async (itemId: string, quantity: number) => {
    set({ isLoading: true, error: null });
    try {
      if (quantity <= 0) {
        // Remove item if quantity is zero or less
        await get().removeItem(itemId);
        return;
      }
      const response = await cartService.updateItem(itemId, { quantity });
      set({ items: response.data.items, isLoading: false });
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      set({
        isLoading: false,
        error: axiosError.response?.data?.message || 'Failed to update item quantity',
      });
      throw error;
    }
  },

  // Remove item from cart
  removeItem: async (itemId: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await cartService.removeItem(itemId);
      set({ items: response.data.items, isLoading: false });
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      set({
        isLoading: false,
        error: axiosError.response?.data?.message || 'Failed to remove item from cart',
      });
      throw error;
    }
  },

  // Clear entire cart
  clearCart: async () => {
    set({ isLoading: true, error: null });
    try {
      await cartService.clearCart();
      set({ items: [], isLoading: false });
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      set({
        isLoading: false,
        error: axiosError.response?.data?.message || 'Failed to clear cart',
      });
      throw error;
    }
  },

  // Load cart from localStorage (for guest users)
  loadFromLocalStorage: () => {
    try {
      const stored = localStorage.getItem(LOCAL_CART_KEY);
      if (stored) {
        const localItems: LocalCartItem[] = JSON.parse(stored);
        // Note: LocalCartItem doesn't have full product info
        // This is used for guest users before login
        // Full product info will be populated after merge on login
        set({ items: localItems as unknown as CartItem[] });
      }
    } catch {
      // Invalid data in localStorage, clear it
      localStorage.removeItem(LOCAL_CART_KEY);
    }
  },

  // Save cart to localStorage (for guest users)
  saveToLocalStorage: () => {
    const { items } = get();
    const localItems: LocalCartItem[] = items.map((item) => ({
      productId: item.product?._id || (item as unknown as LocalCartItem).productId,
      quantity: item.quantity,
      color: item.color,
    }));
    localStorage.setItem(LOCAL_CART_KEY, JSON.stringify(localItems));
  },

  // Clear localStorage cart
  clearLocalCart: () => {
    localStorage.removeItem(LOCAL_CART_KEY);
    set({ items: [] });
  },

  // Merge guest cart with user cart on login
  mergeGuestCart: async () => {
    try {
      const stored = localStorage.getItem(LOCAL_CART_KEY);
      if (!stored) {
        // No guest cart, just fetch user's cart
        await get().fetchCart();
        return;
      }

      const localItems: LocalCartItem[] = JSON.parse(stored);
      if (localItems.length === 0) {
        await get().fetchCart();
        return;
      }

      set({ isLoading: true, error: null });
      const response = await cartService.mergeCart(localItems);
      set({ items: response.data.items, isLoading: false });
      
      // Clear localStorage after successful merge
      localStorage.removeItem(LOCAL_CART_KEY);
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      set({
        isLoading: false,
        error: axiosError.response?.data?.message || 'Failed to merge cart',
      });
      // Still try to fetch user's cart even if merge fails
      await get().fetchCart();
    }
  },

  // Clear error
  clearError: () => {
    set({ error: null });
  },

  // Set items directly (useful for testing or manual updates)
  setItems: (items: CartItem[]) => {
    set({ items });
  },
}));

// Export localStorage key for external use
export { LOCAL_CART_KEY };
