import * as React from 'react';
import { qaService } from '@/services/qa.service';
import type { Question } from '@/types/qa.type';
import type { Pagination } from '@/types/api.type';
import { QuestionForm } from './QuestionForm';
import { QuestionList } from './QuestionList';
import { AlertCircle } from 'lucide-react';

interface QASectionProps {
  productId: string;
}

export function QASection({ productId }: QASectionProps) {
  const [questions, setQuestions] = React.useState<Question[]>([]);
  const [pagination, setPagination] = React.useState<Pagination | undefined>();
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [currentPage, setCurrentPage] = React.useState(1);

  const fetchQuestions = React.useCallback(async (page: number = 1) => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await qaService.getProductQuestions(productId, { page, limit: 10 });
      setQuestions(response.data.questions);
      setPagination(response.data.pagination);
    } catch (err) {
      console.error('Error fetching questions:', err);
      setError('Không thể tải câu hỏi. Vui lòng thử lại sau.');
    } finally {
      setIsLoading(false);
    }
  }, [productId]);

  React.useEffect(() => {
    fetchQuestions(currentPage);
  }, [fetchQuestions, currentPage]);

  const handleSubmitQuestion = async (questionText: string) => {
    setIsSubmitting(true);
    try {
      await qaService.createQuestion({ productId, questionText });
      // Refresh questions after successful submission
      await fetchQuestions(1);
      setCurrentPage(1);
    } catch (err) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      throw new Error(axiosError.response?.data?.message || 'Không thể gửi câu hỏi');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpvote = async (questionId: string) => {
    try {
      const response = await qaService.toggleUpvote(questionId);
      // Update the question in the list - handle both _id and id formats
      setQuestions((prev) =>
        prev.map((q) => {
          const qId = q._id || (q as unknown as { id: string }).id;
          return qId === questionId
            ? { ...q, upvoteCount: response.data.upvoteCount, hasUpvoted: response.data.hasUpvoted }
            : q;
        })
      );
    } catch (err) {
      console.error('Error toggling upvote:', err);
    }
  };

  const handleDelete = async (questionId: string) => {
    try {
      await qaService.deleteQuestion(questionId);
      // Remove the question from the list - handle both _id and id formats
      setQuestions((prev) => prev.filter((q) => {
        const qId = q._id || (q as unknown as { id: string }).id;
        return qId !== questionId;
      }));
      // Update pagination totalCount
      if (pagination) {
        setPagination({ ...pagination, totalCount: pagination.totalCount - 1 });
      }
    } catch (err) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      throw new Error(axiosError.response?.data?.message || 'Không thể xóa câu hỏi');
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <div className="space-y-6">
      {/* Question Form */}
      <QuestionForm onSubmit={handleSubmitQuestion} isSubmitting={isSubmitting} />

      {/* Error State */}
      {error && !isLoading && (
        <div className="flex items-center gap-2 p-4 rounded-md bg-destructive/10 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      {/* Question List */}
      <QuestionList
        questions={questions}
        pagination={pagination}
        isLoading={isLoading}
        onUpvote={handleUpvote}
        onDelete={handleDelete}
        onPageChange={handlePageChange}
      />
    </div>
  );
}

export type { QASectionProps };
