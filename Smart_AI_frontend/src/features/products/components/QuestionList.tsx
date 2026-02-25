import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { Question } from '@/types/qa.type';
import type { Pagination } from '@/types/api.type';
import { QuestionItem } from './QuestionItem';
import { HelpCircle, ChevronLeft, ChevronRight } from 'lucide-react';

interface QuestionListProps {
  questions: Question[];
  pagination?: Pagination;
  isLoading?: boolean;
  onUpvote: (questionId: string) => Promise<void>;
  onDelete: (questionId: string) => Promise<void>;
  onPageChange?: (page: number) => void;
}

export function QuestionList({
  questions,
  pagination,
  isLoading = false,
  onUpvote,
  onDelete,
  onPageChange,
}: QuestionListProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Hỏi đáp về sản phẩm</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-pulse text-muted-foreground">
              Đang tải câu hỏi...
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Hỏi đáp về sản phẩm</CardTitle>
          {pagination && pagination.totalCount > 0 && (
            <span className="text-sm text-muted-foreground">
              {pagination.totalCount} câu hỏi
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {questions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <HelpCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">
              Chưa có câu hỏi nào cho sản phẩm này.
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Hãy là người đầu tiên đặt câu hỏi!
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {questions.map((question) => {
              const questionId = question._id || (question as unknown as { id: string }).id;
              return (
                <QuestionItem
                  key={questionId}
                  question={question}
                  onUpvote={onUpvote}
                  onDelete={onDelete}
                />
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6 pt-6 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange?.(pagination.currentPage - 1)}
              disabled={!pagination.hasPrevPage}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Trang {pagination.currentPage} / {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange?.(pagination.currentPage + 1)}
              disabled={!pagination.hasNextPage}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export type { QuestionListProps };
