import type { Pagination } from "./api.type";

export type QuestionStatus = 'pending' | 'approved' | 'answered' | 'rejected';

export interface QuestionUser {
  _id: string;
  name: string;
}

export interface Answer {
  _id: string;
  question: string;
  user: QuestionUser;
  answerText: string;
  isOfficial: boolean;
  isAISuggestion: boolean;
  aiConfidence?: number;
  aiSourceSpecs?: string[];
  createdAt: string;
}

export interface Question {
  _id: string;
  product: string;
  user: QuestionUser;
  questionText: string;
  status: QuestionStatus;
  upvoteCount: number;
  hasUpvoted: boolean;
  answers: Answer[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateQuestionRequest {
  productId: string;
  questionText: string;
}

export interface CreateAnswerRequest {
  questionId: string;
  answerText: string;
}

// Response types
export interface GetProductQuestionsResponse {
  success: boolean;
  message: string;
  data: {
    questions: Question[];
    pagination: Pagination;
  };
}

export interface CreateQuestionResponse {
  success: boolean;
  message: string;
  data: {
    question: Question;
    aiSuggestion?: Answer;
  };
}

export interface ToggleUpvoteResponse {
  success: boolean;
  message: string;
  data: {
    upvoteCount: number;
    hasUpvoted: boolean;
  };
}

export interface DeleteQuestionResponse {
  success: boolean;
  message: string;
}

export interface CreateAnswerResponse {
  success: boolean;
  message: string;
  data: Answer;
}

export interface DeleteAnswerResponse {
  success: boolean;
  message: string;
}

// Admin types
export interface GetAllQuestionsParams {
  page?: number;
  limit?: number;
  status?: QuestionStatus;
  productId?: string;
}

export interface GetAllQuestionsResponse {
  success: boolean;
  message: string;
  data: {
    questions: Question[];
    pagination: Pagination;
  };
}

export interface UpdateQuestionStatusResponse {
  success: boolean;
  message: string;
  data: Question;
}
