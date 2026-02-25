import type { Product } from './product.type';

/**
 * Represents a single item in the comparison list
 */
export interface CompareItem {
  productId: string;
  product?: Product;
}

/**
 * State of the comparison feature
 */
export interface CompareState {
  items: CompareItem[];
  isBarVisible: boolean;
}

/**
 * A saved comparison history entry
 */
export interface CompareHistory {
  _id: string;
  products: Product[];
  createdAt: string;
  updatedAt: string;
}

/**
 * A row in the comparison table
 */
export interface CompareTableRow {
  category: string;
  attribute: string;
  values: (string | number | null)[];
  isDifferent: boolean;
  bestIndex?: number;
}

/**
 * API response for getting comparison history
 */
export interface GetCompareHistoryResponse {
  success: boolean;
  message: string;
  data: CompareHistory[];
}

/**
 * API response for saving comparison to history
 */
export interface SaveCompareHistoryResponse {
  success: boolean;
  message: string;
  data: CompareHistory;
}

/**
 * API response for getting products for comparison
 */
export interface GetCompareProductsResponse {
  success: boolean;
  message: string;
  data: Product[];
}

/**
 * API response for deleting comparison from history
 */
export interface DeleteCompareHistoryResponse {
  success: boolean;
  message: string;
}
