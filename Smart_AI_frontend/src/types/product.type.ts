import type { Pagination } from "./api.type";

export interface ProductSpecs {
  screen?: {
    size?: string;
    technology?: string;
    resolution?: string;
  };
  processor?: {
    chipset?: string;
    cpu?: string;
    gpu?: string;
  };
  memory?: {
    ram?: string;
    storage?: string;
  };
  camera?: {
    rear?: {
      primary?: string;
      secondary?: string;
      tertiary?: string;
    };
    front?: string;
    features?: string[];
  };
  battery?: {
    capacity?: string;
    charging?: {
      wired?: string;
      wireless?: string;
    };
  };
  os?: string;
  dimensions?: string;
  weight?: string;
  connectivity?: {
    network?: string[];
    ports?: string[];
  };
}

export interface Product {
  _id: string;
  id?: string; // Some APIs return 'id' instead of '_id' due to Mongoose toJSON transform
  name: string;
  brand: string;
  price: number;
  specs?: ProductSpecs;
  description: string;
  inStock: number;
  colors: string[];
  tags: string[];
  image: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  averageRating?: number;
  reviewCount?: number;
}


export interface GetAllProductsResponse {
  success: boolean;
  message: string;
  data: {
    products: Product[];
    pagination: Pagination;
  };
}

export interface GetProductByIdResponse {
  success: boolean;
  message: string;
  data: Product;
}

export interface GetProductsParams {
  page?: number;
  limit?: number;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  minRating?: number;
}

// Filter State Types
export interface ProductFilterState {
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: 'all' | 'true' | 'false';
  search?: string;
  sortBy?: 'price' | 'name' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
  minRating?: number;
}

export const DEFAULT_FILTER_STATE: ProductFilterState = {
  brand: undefined,
  minPrice: undefined,
  maxPrice: undefined,
  inStock: 'all',
  search: '',
  sortBy: 'createdAt',
  sortOrder: 'desc',
  minRating: undefined,
};

export const SORT_OPTIONS = [
  { value: 'createdAt-desc', label: 'Mới nhất' },
  { value: 'price-asc', label: 'Giá: Thấp đến cao' },
  { value: 'price-desc', label: 'Giá: Cao đến thấp' },
  { value: 'name-asc', label: 'Tên: A-Z' },
] as const;

// Admin Product Management Types
export interface CreateProductRequest {
  name: string;
  brand: string;
  price: number;
  description: string;
  image?: string;
  inStock?: number;
  specs?: ProductSpecs;
  colors?: string[];
  tags?: string[];
}

export interface CreateProductResponse {
  success: boolean;
  message: string;
  data: Product;
}

export interface DeleteProductResponse {
  success: boolean;
  message: string;
}

