import type { Product } from './product.type';

export interface CartItem {
  _id: string;
  product: Product;
  quantity: number;
  color: string;
  addedAt: string;
}

export interface Cart {
  _id: string;
  user: string;
  items: CartItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CartResponse {
  success: boolean;
  data: Cart;
}

export interface AddToCartRequest {
  productId: string;
  quantity: number;
  color: string;
}

export interface UpdateCartItemRequest {
  quantity: number;
}

// For localStorage (guest users)
export interface LocalCartItem {
  productId: string;
  quantity: number;
  color: string;
}
