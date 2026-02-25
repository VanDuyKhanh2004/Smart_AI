import type { Pagination } from "./api.type";

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface ReviewUser {
  _id: string;
  name: string;
}

export interface Review {
  _id: string;
  user: ReviewUser;
  product: string;
  rating: number;
  comment?: string;
  status: ReviewStatus;
  isVerifiedPurchase: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductReviewStats {
  averageRating: number;
  totalCount: number;
}

export interface CreateReviewRequest {
  productId: string;
  rating: number;
  comment?: string;
}

export interface UpdateReviewRequest {
  rating?: number;
  comment?: string;
}

export interface GetProductReviewsResponse {
  success: boolean;
  message: string;
  data: {
    reviews: Review[];
    stats: ProductReviewStats;
    pagination: Pagination;
  };
}

export interface CreateReviewResponse {
  success: boolean;
  message: string;
  data: Review;
}

export interface UpdateReviewResponse {
  success: boolean;
  message: string;
  data: Review;
}

export interface DeleteReviewResponse {
  success: boolean;
  message: string;
}

export interface CanReviewResponse {
  success: boolean;
  message: string;
  data: {
    canReview: boolean;
    reason?: string;
  };
}

// Admin types
export interface GetAllReviewsParams {
  page?: number;
  limit?: number;
  status?: ReviewStatus;
  productId?: string;
  userId?: string;
}

export interface GetAllReviewsResponse {
  success: boolean;
  message: string;
  data: {
    reviews: Review[];
    pagination: Pagination;
  };
}

export interface UpdateReviewStatusResponse {
  success: boolean;
  message: string;
  data: Review;
}
