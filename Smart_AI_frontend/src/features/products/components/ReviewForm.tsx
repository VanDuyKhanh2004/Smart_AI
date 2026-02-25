import * as React from 'react';
import { StarRating } from '@/components/ui/StarRating';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Send, AlertCircle } from 'lucide-react';

const MAX_COMMENT_LENGTH = 1000;

interface ReviewFormProps {
  canReview: boolean;
  canReviewReason?: string;
  onSubmit: (rating: number, comment?: string) => Promise<void>;
  isSubmitting?: boolean;
  className?: string;
}

export function ReviewForm({
  canReview,
  canReviewReason,
  onSubmit,
  isSubmitting = false,
  className,
}: ReviewFormProps) {
  const [rating, setRating] = React.useState<number>(0);
  const [comment, setComment] = React.useState<string>('');
  const [error, setError] = React.useState<string | null>(null);

  const commentLength = comment.length;
  const isCommentTooLong = commentLength > MAX_COMMENT_LENGTH;
  const isValid = rating >= 1 && rating <= 5 && !isCommentTooLong;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isValid) {
      if (rating < 1) {
        setError('Vui lòng chọn số sao đánh giá');
      } else if (isCommentTooLong) {
        setError(`Nhận xét không được vượt quá ${MAX_COMMENT_LENGTH} ký tự`);
      }
      return;
    }

    try {
      await onSubmit(rating, comment.trim() || undefined);
      // Reset form on success
      setRating(0);
      setComment('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra khi gửi đánh giá');
    }
  };

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setComment(e.target.value);
    if (error) setError(null);
  };

  const handleRatingChange = (newRating: number) => {
    setRating(newRating);
    if (error) setError(null);
  };

  // Show message if user cannot review
  if (!canReview) {
    return (
      <Card className={cn('bg-muted/50', className)}>
        <CardContent className="py-6">
          <div className="flex items-center gap-3 text-muted-foreground">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm">
              {canReviewReason || 'Bạn cần mua sản phẩm để có thể đánh giá'}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Viết đánh giá của bạn</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Rating selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Đánh giá <span className="text-destructive">*</span>
            </label>
            <div className="flex items-center gap-3">
              <StarRating
                rating={rating}
                interactive
                onChange={handleRatingChange}
                size="lg"
              />
              {rating > 0 && (
                <span className="text-sm text-muted-foreground">
                  {rating} sao
                </span>
              )}
            </div>
          </div>

          {/* Comment textarea */}
          <div className="space-y-2">
            <label htmlFor="review-comment" className="text-sm font-medium">
              Nhận xét (không bắt buộc)
            </label>
            <Textarea
              id="review-comment"
              placeholder="Chia sẻ trải nghiệm của bạn về sản phẩm này..."
              value={comment}
              onChange={handleCommentChange}
              disabled={isSubmitting}
              className={cn(
                'min-h-[100px] resize-none',
                isCommentTooLong && 'border-destructive focus-visible:ring-destructive/50'
              )}
              aria-invalid={isCommentTooLong}
              aria-describedby="comment-counter"
            />
            <div
              id="comment-counter"
              className={cn(
                'text-xs text-right',
                isCommentTooLong ? 'text-destructive' : 'text-muted-foreground'
              )}
            >
              {commentLength}/{MAX_COMMENT_LENGTH}
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}

          {/* Submit button */}
          <Button
            type="submit"
            disabled={!isValid || isSubmitting}
            className="w-full sm:w-auto"
          >
            {isSubmitting ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Đang gửi...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Gửi đánh giá
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export type { ReviewFormProps };
