import { useState, useEffect, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StarRating } from "@/components/ui/StarRating";
import { reviewService } from "@/services/review.service";
import type { Review, ReviewStatus } from "@/types/review.type";
import type { Pagination as PaginationType } from "@/types/api.type";
import { CheckCircle, XCircle, Clock } from "lucide-react";

const DEFAULT_PAGINATION: PaginationType = {
  currentPage: 1,
  totalPages: 1,
  totalCount: 0,
  limit: 10,
  hasNextPage: false,
  hasPrevPage: false,
  nextPage: null,
  prevPage: null,
};

const STATUS_OPTIONS: { value: ReviewStatus | "all"; label: string }[] = [
  { value: "all", label: "Tất cả trạng thái" },
  { value: "approved", label: "Đã duyệt" },
  { value: "pending", label: "Chờ duyệt" },
  { value: "rejected", label: "Đã từ chối" },
];


function getStatusBadge(status: ReviewStatus) {
  switch (status) {
    case "approved":
      return (
        <Badge variant="default" className="bg-green-500 hover:bg-green-600">
          <CheckCircle className="w-3 h-3 mr-1" />
          Đã duyệt
        </Badge>
      );
    case "pending":
      return (
        <Badge variant="secondary">
          <Clock className="w-3 h-3 mr-1" />
          Chờ duyệt
        </Badge>
      );
    case "rejected":
      return (
        <Badge variant="destructive">
          <XCircle className="w-3 h-3 mr-1" />
          Đã từ chối
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("vi-VN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, index) => (
        <TableRow key={index}>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-48" /></TableCell>
          <TableCell><Skeleton className="h-6 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-8 w-32" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

function generatePageNumbers(currentPage: number, totalPages: number): number[] {
  const pages: number[] = [];
  const maxVisiblePages = 5;

  if (totalPages <= maxVisiblePages) {
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
  } else {
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
  }

  return pages;
}


/**
 * AdminReviewsPage - Review management page for admin
 * Requirements 5.1: Display all reviews with filtering options
 * Requirements 5.2, 5.3, 5.4: Approve/Reject actions to update review visibility
 */
export function AdminReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [pagination, setPagination] = useState<PaginationType>(DEFAULT_PAGINATION);
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | "all">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Fetch reviews
  const fetchReviews = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params: { page: number; limit: number; status?: ReviewStatus } = {
        page: currentPage,
        limit: 10,
      };

      if (statusFilter !== "all") {
        params.status = statusFilter;
      }

      const response = await reviewService.getAllReviews(params);
      setReviews(response.data?.reviews || []);
      setPagination(response.data?.pagination || DEFAULT_PAGINATION);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể tải danh sách đánh giá"
      );
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, statusFilter]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Handle status filter change
  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value as ReviewStatus | "all");
    setCurrentPage(1);
  };

  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Handle status update
  const handleUpdateStatus = async (reviewId: string, newStatus: ReviewStatus) => {
    setIsUpdating(reviewId);

    try {
      await reviewService.updateReviewStatus(reviewId, newStatus);
      setNotification({
        type: "success",
        message: `Đã ${newStatus === "approved" ? "duyệt" : "từ chối"} đánh giá`,
      });
      fetchReviews();
    } catch (err) {
      setNotification({
        type: "error",
        message:
          err instanceof Error ? err.message : "Không thể cập nhật trạng thái",
      });
    } finally {
      setIsUpdating(null);
    }
  };

  const pageNumbers = generatePageNumbers(
    pagination.currentPage,
    pagination.totalPages
  );


  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Quản lý đánh giá</h1>
      </div>

      {/* Notification */}
      {notification && (
        <div
          className={`p-4 rounded-md ${
            notification.type === "success"
              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
              : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
          }`}
        >
          {notification.message}
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Trạng thái:</span>
          <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Chọn trạng thái" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
          {error}
        </div>
      )}

      {/* Reviews table */}
      <div className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Người dùng</TableHead>
              <TableHead>Đánh giá</TableHead>
              <TableHead>Nhận xét</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Ngày tạo</TableHead>
              <TableHead>Hành động</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton />
            ) : reviews.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground py-8"
                >
                  Không có đánh giá nào
                </TableCell>
              </TableRow>
            ) : (
              reviews.map((review) => {
                const reviewId = review._id || (review as unknown as { id: string }).id;
                if (!reviewId) return null;
                
                return (
                  <TableRow key={reviewId}>
                    <TableCell className="font-mono text-xs">
                      {reviewId.slice(0, 8)}...
                    </TableCell>
                    <TableCell>{review.user?.name || "N/A"}</TableCell>
                    <TableCell>
                      <StarRating rating={review.rating} size="sm" />
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {review.comment || "-"}
                    </TableCell>
                    <TableCell>{getStatusBadge(review.status)}</TableCell>
                    <TableCell>{formatDate(review.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {review.status !== "approved" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            onClick={() => handleUpdateStatus(reviewId, "approved")}
                            disabled={isUpdating === reviewId}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Duyệt
                          </Button>
                        )}
                        {review.status !== "rejected" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleUpdateStatus(reviewId, "rejected")}
                            disabled={isUpdating === reviewId}
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Từ chối
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>


        {/* Pagination */}
        {!isLoading && pagination.totalPages > 1 && (
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() =>
                    pagination.hasPrevPage &&
                    handlePageChange(pagination.currentPage - 1)
                  }
                  className={
                    !pagination.hasPrevPage
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer"
                  }
                />
              </PaginationItem>

              {pageNumbers.map((page) => (
                <PaginationItem key={page}>
                  <PaginationLink
                    isActive={page === pagination.currentPage}
                    onClick={() => handlePageChange(page)}
                    className="cursor-pointer"
                  >
                    {page}
                  </PaginationLink>
                </PaginationItem>
              ))}

              <PaginationItem>
                <PaginationNext
                  onClick={() =>
                    pagination.hasNextPage &&
                    handlePageChange(pagination.currentPage + 1)
                  }
                  className={
                    !pagination.hasNextPage
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer"
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}

        {/* Page info */}
        {!isLoading && (
          <div className="text-sm text-muted-foreground text-center">
            Trang {pagination.currentPage} / {pagination.totalPages} (
            {pagination.totalCount} đánh giá)
          </div>
        )}
      </div>
    </div>
  );
}
