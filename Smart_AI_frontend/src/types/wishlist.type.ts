import type { Product } from './product.type';

// Product in wishlist can have either _id or id due to MongoDB toJSON transform
export interface WishlistProduct {
  _id?: string;
  id?: string;
  name: string;
  brand: string;
  price: number;
  image: string;
  inStock: number;
  isActive: boolean;
  colors?: string[];
}

export interface WishlistItem {
  _id?: string;
  id?: string;
  product: WishlistProduct;
  addedAt: string;
}

export interface Wishlist {
  _id: string;
  user: string;
  items: WishlistItem[];
  createdAt: string;
  updatedAt: string;
}

export interface WishlistStatusMap {
  [productId: string]: boolean;
}

export interface WishlistResponse {
  success: boolean;
  message: string;
  data: Wishlist;
}

export interface AddToWishlistResponse {
  success: boolean;
  message: string;
  data: Wishlist;
}

export interface RemoveFromWishlistResponse {
  success: boolean;
  message: string;
  data: Wishlist;
}

export interface CheckWishlistStatusResponse {
  success: boolean;
  data: {
    inWishlist: boolean;
  };
}

export interface CheckMultipleWishlistStatusResponse {
  success: boolean;
  data: WishlistStatusMap;
}

export interface ClearWishlistResponse {
  success: boolean;
  message: string;
}
