import apiClient from '@/lib/axios';
import type {
  GetProductReviewsResponse,
  CreateReviewRequest,
  CreateReviewResponse,
  UpdateReviewRequest,
  UpdateReviewResponse,
  DeleteReviewResponse,
  CanReviewResponse,
  GetAllReviewsParams,
  GetAllReviewsResponse,
  UpdateReviewStatusResponse,
  ReviewStatus,
} from '@/types/review.type';

export interface GetProductReviewsParams {
  page?: number;
  limit?: number;
}

export const reviewService = {
  // Get product reviews (public)
  getProductReviews: async (
    productId: string,
    params: GetProductReviewsParams = {}
  ): Promise<GetProductReviewsResponse> => {
    const response = await apiClient.get<GetProductReviewsResponse>(
      `/reviews/product/${productId}`,
      {
        params: {
          page: params.page || 1,
          limit: params.limit || 10,
        },
      }
    );
    return response.data;
  },

  // Create review (auth required)
  createReview: async (data: CreateReviewRequest): Promise<CreateReviewResponse> => {
    const response = await apiClient.post<CreateReviewResponse>('/reviews', data);
    return response.data;
  },

  // Update own review (auth required)
  updateReview: async (
    id: string,
    data: UpdateReviewRequest
  ): Promise<UpdateReviewResponse> => {
    const response = await apiClient.put<UpdateReviewResponse>(`/reviews/${id}`, data);
    return response.data;
  },

  // Delete own review (auth required)
  deleteReview: async (id: string): Promise<DeleteReviewResponse> => {
    const response = await apiClient.delete<DeleteReviewResponse>(`/reviews/${id}`);
    return response.data;
  },

  // Check if user can review product (auth required)
  canReviewProduct: async (productId: string): Promise<CanReviewResponse> => {
    const response = await apiClient.get<CanReviewResponse>(
      `/reviews/can-review/${productId}`
    );
    return response.data;
  },

  // Admin: Get all reviews
  getAllReviews: async (
    params: GetAllReviewsParams = {}
  ): Promise<GetAllReviewsResponse> => {
    const response = await apiClient.get<GetAllReviewsResponse>('/reviews/admin', {
      params: {
        page: params.page || 1,
        limit: params.limit || 10,
        ...(params.status && { status: params.status }),
        ...(params.productId && { productId: params.productId }),
        ...(params.userId && { userId: params.userId }),
      },
    });
    return response.data;
  },

  // Admin: Update review status
  updateReviewStatus: async (
    id: string,
    status: ReviewStatus
  ): Promise<UpdateReviewStatusResponse> => {
    const response = await apiClient.put<UpdateReviewStatusResponse>(
      `/reviews/admin/${id}/status`,
      { status }
    );
    return response.data;
  },
};

// Export individual functions for direct use
export const {
  getProductReviews,
  createReview,
  updateReview,
  deleteReview,
  canReviewProduct,
  getAllReviews,
  updateReviewStatus,
} = reviewService;
