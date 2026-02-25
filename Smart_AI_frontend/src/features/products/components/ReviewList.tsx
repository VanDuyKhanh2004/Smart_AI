import { StarRating } from '@/components/ui/StarRating';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Review, ProductReviewStats } from '@/types/review.type';
import { MessageSquare } from 'lucide-react';

interface ReviewListProps {
  reviews: Review[];
  stats: ProductReviewStats;
  isLoading?: boolean;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('vi-VN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function ReviewList({ reviews, stats, isLoading = false }: ReviewListProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Đánh giá sản phẩm</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-pulse text-muted-foreground">
              Đang tải đánh giá...
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
          <CardTitle>Đánh giá sản phẩm</CardTitle>
          {stats.totalCount > 0 && (
            <div className="flex items-center gap-2">
              <StarRating rating={stats.averageRating} size="md" />
              <span className="text-lg font-semibold">
                {stats.averageRating.toFixed(1)}
              </span>
              <span className="text-muted-foreground">
                ({stats.totalCount} đánh giá)
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {reviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">
              Chưa có đánh giá nào cho sản phẩm này.
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Hãy là người đầu tiên đánh giá!
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {reviews.map((review) => (
              <ReviewItem key={review._id} review={review} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ReviewItemProps {
  review: Review;
}

function ReviewItem({ review }: ReviewItemProps) {
  return (
    <div className="flex gap-4 pb-6 border-b last:border-b-0 last:pb-0">
      <Avatar className="h-10 w-10 shrink-0">
        <AvatarFallback className="bg-primary/10 text-primary text-sm">
          {getInitials(review.user.name)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium">{review.user.name}</span>
            {review.isVerifiedPurchase && (
              <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                Đã mua hàng
              </span>
            )}
          </div>
          <span className="text-sm text-muted-foreground">
            {formatDate(review.createdAt)}
          </span>
        </div>
        <div className="mt-1">
          <StarRating rating={review.rating} size="sm" />
        </div>
        {review.comment && (
          <p className="mt-2 text-sm text-foreground/90 whitespace-pre-wrap">
            {review.comment}
          </p>
        )}
      </div>
    </div>
  );
}

export type { ReviewListProps };
