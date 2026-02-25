import apiClient from '@/lib/axios';
import type {
  GetProductQuestionsResponse,
  CreateQuestionRequest,
  CreateQuestionResponse,
  ToggleUpvoteResponse,
  DeleteQuestionResponse,
  CreateAnswerRequest,
  CreateAnswerResponse,
  DeleteAnswerResponse,
  GetAllQuestionsParams,
  GetAllQuestionsResponse,
  UpdateQuestionStatusResponse,
  QuestionStatus,
} from '@/types/qa.type';

export interface GetProductQuestionsParams {
  page?: number;
  limit?: number;
}

export const qaService = {
  // Get product questions (public, with optional auth for hasUpvoted)
  getProductQuestions: async (
    productId: string,
    params: GetProductQuestionsParams = {}
  ): Promise<GetProductQuestionsResponse> => {
    const response = await apiClient.get<GetProductQuestionsResponse>(
      `/questions/product/${productId}`,
      {
        params: {
          page: params.page || 1,
          limit: params.limit || 10,
        },
      }
    );
    return response.data;
  },

  // Create question (auth required)
  createQuestion: async (data: CreateQuestionRequest): Promise<CreateQuestionResponse> => {
    const response = await apiClient.post<CreateQuestionResponse>('/questions', data);
    return response.data;
  },

  // Toggle upvote (auth required)
  toggleUpvote: async (questionId: string): Promise<ToggleUpvoteResponse> => {
    const response = await apiClient.post<ToggleUpvoteResponse>(
      `/questions/${questionId}/upvote`
    );
    return response.data;
  },

  // Delete own question (auth required)
  deleteQuestion: async (questionId: string): Promise<DeleteQuestionResponse> => {
    const response = await apiClient.delete<DeleteQuestionResponse>(
      `/questions/${questionId}`
    );
    return response.data;
  },

  // Admin: Get all questions with filters
  getAllQuestions: async (
    params: GetAllQuestionsParams = {}
  ): Promise<GetAllQuestionsResponse> => {
    const response = await apiClient.get<GetAllQuestionsResponse>('/questions/admin', {
      params: {
        page: params.page || 1,
        limit: params.limit || 10,
        ...(params.status && { status: params.status }),
        ...(params.productId && { productId: params.productId }),
      },
    });
    return response.data;
  },

  // Admin: Update question status
  updateQuestionStatus: async (
    questionId: string,
    status: QuestionStatus
  ): Promise<UpdateQuestionStatusResponse> => {
    const response = await apiClient.put<UpdateQuestionStatusResponse>(
      `/questions/admin/${questionId}/status`,
      { status }
    );
    return response.data;
  },

  // Admin: Create answer
  createAnswer: async (data: CreateAnswerRequest): Promise<CreateAnswerResponse> => {
    const response = await apiClient.post<CreateAnswerResponse>('/questions/answers', data);
    return response.data;
  },

  // Admin: Delete answer
  deleteAnswer: async (answerId: string): Promise<DeleteAnswerResponse> => {
    const response = await apiClient.delete<DeleteAnswerResponse>(
      `/questions/answers/${answerId}`
    );
    return response.data;
  },
};

// Export individual functions for direct use
export const {
  getProductQuestions,
  createQuestion,
  toggleUpvote,
  deleteQuestion,
  getAllQuestions,
  updateQuestionStatus,
  createAnswer,
  deleteAnswer,
} = qaService;
