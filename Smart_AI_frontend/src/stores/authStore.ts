import { create } from 'zustand';
import { authService } from '@/services/auth.service';
import { useCartStore } from '@/stores/cartStore';
import { useWishlistStore } from '@/stores/wishlistStore';
import type { User } from '@/types/auth.type';

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
  clearError: () => void;
  initialize: () => Promise<void>;
  setAccessToken: (token: string) => void;
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  updateUserProfile: (updates: Partial<Pick<User, 'name' | 'phone' | 'avatar'>>) => void;
}

type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.login({ email, password });
      const { user, accessToken, refreshToken } = response.data;
      
      localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
      
      set({
        user,
        accessToken,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });

      // Merge guest cart with user cart after successful login (don't block on failure)
      useCartStore.getState().mergeGuestCart().catch(() => {
        // Ignore cart merge errors
      });
      // Fetch wishlist for authenticated user
      useWishlistStore.getState().fetchWishlist().catch(() => {
        // Ignore wishlist fetch errors
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Login failed';
      const axiosError = error as { response?: { data?: { message?: string } } };
      set({
        isLoading: false,
        error: axiosError.response?.data?.message || message,
      });
      throw error;
    }
  },

  register: async (name: string, email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.register({ name, email, password });
      const { user, accessToken, refreshToken } = response.data;
      
      localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
      
      set({
        user,
        accessToken,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });

      // Merge guest cart with user cart after successful registration (don't block on failure)
      useCartStore.getState().mergeGuestCart().catch(() => {
        // Ignore cart merge errors
      });
      // Fetch wishlist for authenticated user
      useWishlistStore.getState().fetchWishlist().catch(() => {
        // Ignore wishlist fetch errors
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Registration failed';
      const axiosError = error as { response?: { data?: { message?: string } } };
      set({
        isLoading: false,
        error: axiosError.response?.data?.message || message,
      });
      throw error;
    }
  },

  logout: async () => {
    try {
      await authService.logout();
    } catch {
      // Continue with local logout even if server request fails
    } finally {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      
      // Clear local cart state on logout
      useCartStore.getState().clearLocalCart();
      // Clear wishlist state on logout
      useWishlistStore.getState().reset();
      
      set({
        user: null,
        accessToken: null,
        isAuthenticated: false,
        error: null,
      });
    }
  },

  refreshToken: async () => {
    const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!storedRefreshToken) {
      return false;
    }

    try {
      const response = await authService.refreshToken(storedRefreshToken);
      const { accessToken } = response.data;
      
      localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
      set({ accessToken });
      return true;
    } catch {
      // Refresh failed, clear auth state
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      
      set({
        user: null,
        accessToken: null,
        isAuthenticated: false,
      });
      return false;
    }
  },

  clearError: () => {
    set({ error: null });
  },

  setAccessToken: (token: string) => {
    set({ accessToken: token });
    localStorage.setItem(ACCESS_TOKEN_KEY, token);
  },

  setAuth: (user: User, accessToken: string, refreshToken: string) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    
    set({
      user,
      accessToken,
      isAuthenticated: true,
      error: null,
    });

    // Merge guest cart and fetch wishlist
    useCartStore.getState().mergeGuestCart().catch(() => {});
    useWishlistStore.getState().fetchWishlist().catch(() => {});
  },

  updateUserProfile: (updates: Partial<Pick<User, 'name' | 'phone' | 'avatar'>>) => {
    const currentUser = get().user;
    if (currentUser) {
      set({
        user: {
          ...currentUser,
          ...updates,
        },
      });
    }
  },

  initialize: async () => {
    const storedAccessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
    const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

    if (!storedAccessToken || !storedRefreshToken) {
      // Load guest cart from localStorage for unauthenticated users
      try {
        useCartStore.getState().loadFromLocalStorage();
      } catch {
        // Ignore cart errors during initialization
      }
      set({ isLoading: false });
      return;
    }

    set({ isLoading: true, accessToken: storedAccessToken });

    try {
      const user = await authService.getMe();
      set({
        user,
        isAuthenticated: true,
        isLoading: false,
      });
      // Fetch cart for authenticated user (don't await to prevent blocking)
      useCartStore.getState().fetchCart().catch(() => {
        // Ignore cart fetch errors
      });
      // Fetch wishlist for authenticated user
      useWishlistStore.getState().fetchWishlist().catch(() => {
        // Ignore wishlist fetch errors
      });
    } catch {
      // Token might be expired, try to refresh
      const refreshed = await get().refreshToken();
      if (refreshed) {
        try {
          const user = await authService.getMe();
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
          });
          // Fetch cart for authenticated user (don't await to prevent blocking)
          useCartStore.getState().fetchCart().catch(() => {
            // Ignore cart fetch errors
          });
          // Fetch wishlist for authenticated user
          useWishlistStore.getState().fetchWishlist().catch(() => {
            // Ignore wishlist fetch errors
          });
        } catch {
          set({ isLoading: false });
        }
      } else {
        set({ isLoading: false });
      }
    }
  },
}));

// Export token keys for use in axios interceptors
export { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY };
