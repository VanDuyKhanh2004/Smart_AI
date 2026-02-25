import { create } from 'zustand';

const LOCAL_COMPARE_KEY = 'compareList';
const MAX_COMPARE_ITEMS = 4;

interface CompareState {
  items: string[]; // Product IDs
}

interface CompareActions {
  // Actions
  addToCompare: (productId: string) => boolean;
  removeFromCompare: (productId: string) => void;
  clearCompare: () => void;
  
  // Helpers
  isInCompare: (productId: string) => boolean;
  canAddMore: () => boolean;
  
  // Persistence
  loadFromStorage: () => void;
  saveToStorage: () => void;
}

type CompareStore = CompareState & CompareActions;

export const useCompareStore = create<CompareStore>((set, get) => ({
  items: [],

  /**
   * Add a product to the comparison list
   * Returns true if added successfully, false otherwise
   * Requirements: 1.1, 1.2, 1.3
   */
  addToCompare: (productId: string): boolean => {
    const { items } = get();
    
    // Check if already in list (Requirement 1.3)
    if (items.includes(productId)) {
      return false;
    }
    
    // Check if list is full (Requirement 1.2)
    if (items.length >= MAX_COMPARE_ITEMS) {
      return false;
    }
    
    // Add to list (Requirement 1.1)
    const newItems = [...items, productId];
    set({ items: newItems });
    
    // Persist to localStorage (Requirement 1.5)
    get().saveToStorage();
    
    return true;
  },

  /**
   * Remove a product from the comparison list
   * Requirements: 2.1, 2.2
   */
  removeFromCompare: (productId: string): void => {
    const { items } = get();
    const newItems = items.filter(id => id !== productId);
    set({ items: newItems });
    
    // Persist to localStorage
    get().saveToStorage();
  },

  /**
   * Clear all products from the comparison list
   * Requirement: 2.2
   */
  clearCompare: (): void => {
    set({ items: [] });
    
    // Clear from localStorage
    localStorage.removeItem(LOCAL_COMPARE_KEY);
  },

  /**
   * Check if a product is in the comparison list
   */
  isInCompare: (productId: string): boolean => {
    return get().items.includes(productId);
  },

  /**
   * Check if more products can be added to the comparison list
   */
  canAddMore: (): boolean => {
    return get().items.length < MAX_COMPARE_ITEMS;
  },

  /**
   * Load comparison list from localStorage
   * Requirement: 1.5
   */
  loadFromStorage: (): void => {
    try {
      const stored = localStorage.getItem(LOCAL_COMPARE_KEY);
      if (stored) {
        const parsedItems = JSON.parse(stored);
        // Validate that it's an array of strings
        if (Array.isArray(parsedItems) && parsedItems.every(item => typeof item === 'string')) {
          // Ensure we don't exceed max items and no duplicates
          const uniqueItems = [...new Set(parsedItems)].slice(0, MAX_COMPARE_ITEMS);
          set({ items: uniqueItems });
        }
      }
    } catch {
      // Invalid data in localStorage, clear it
      localStorage.removeItem(LOCAL_COMPARE_KEY);
    }
  },

  /**
   * Save comparison list to localStorage
   * Requirement: 1.5
   */
  saveToStorage: (): void => {
    const { items } = get();
    if (items.length > 0) {
      localStorage.setItem(LOCAL_COMPARE_KEY, JSON.stringify(items));
    } else {
      localStorage.removeItem(LOCAL_COMPARE_KEY);
    }
  },
}));

// Export constants for external use
export { LOCAL_COMPARE_KEY, MAX_COMPARE_ITEMS };
