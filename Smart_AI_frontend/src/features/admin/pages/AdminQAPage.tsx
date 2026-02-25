import React, { useState, useEffect, useCallback } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { qaService } from "@/services/qa.service";
import { productService } from "@/services/product.service";
import type { Question, QuestionStatus, Answer } from "@/types/qa.type";
import type { Product } from "@/types/product.type";
import type { Pagination as PaginationType } from "@/types/api.type";
import {
  CheckCircle,
  XCircle,
  Clock,
  Trash2,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Bot,
  Shield,
  ThumbsUp,
} from "lucide-react";

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

const STATUS_OPTIONS: { value: QuestionStatus | "all"; label: string }[] = [
  { value: "all", label: "Tất cả trạng thái" },
  { value: "pending", label: "Chờ duyệt" },
  { value: "approved", label: "Đã duyệt" },
  { value: "answered", label: "Đã trả lời" },
  { value: "rejected", label: "Đã từ chối" },
];


function getStatusBadge(status: QuestionStatus) {
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
    case "answered":
      return (
        <Badge variant="default" className="bg-blue-500 hover:bg-blue-600">
          <MessageSquare className="w-3 h-3 mr-1" />
          Đã trả lời
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
          <TableCell><Skeleton className="h-4 w-8" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-48" /></TableCell>
          <TableCell><Skeleton className="h-6 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-12" /></TableCell>
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

interface AnswerItemProps {
  answer: Answer;
  onDelete: (answerId: string) => void;
  isDeleting: boolean;
}

function AnswerItemRow({ answer, onDelete, isDeleting }: AnswerItemProps) {
  return (
    <div className="p-3 bg-muted/50 rounded-md space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm">{answer.user?.name || "N/A"}</span>
            {answer.isOfficial && (
              <Badge variant="default" className="bg-blue-500 text-xs">
                <Shield className="w-3 h-3 mr-1" />
                Official
              </Badge>
            )}
            {answer.isAISuggestion && (
              <Badge variant="secondary" className="text-xs">
                <Bot className="w-3 h-3 mr-1" />
                AI {answer.aiConfidence ? `(${Math.round(answer.aiConfidence * 100)}%)` : ""}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{answer.answerText}</p>
          {answer.aiSourceSpecs && answer.aiSourceSpecs.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Nguồn: {answer.aiSourceSpecs.join(", ")}
            </p>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
          onClick={() => onDelete(answer._id)}
          disabled={isDeleting}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{formatDate(answer.createdAt)}</p>
    </div>
  );
}


/**
 * AdminQAPage - Q&A management page for admin
 * Requirements 6.1: Display all questions with filtering options by status and product
 * Requirements 6.2, 6.3: Approve/Reject actions to update question visibility
 * Requirements 6.4: Delete question and all associated answers
 * Requirements 3.1: Answer questions with official badge
 */
export function AdminQAPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [pagination, setPagination] = useState<PaginationType>(DEFAULT_PAGINATION);
  const [statusFilter, setStatusFilter] = useState<QuestionStatus | "all">("all");
  const [productFilter, setProductFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Answer form state
  const [answerDialogOpen, setAnswerDialogOpen] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);

  // Fetch products for filter dropdown
  const fetchProducts = useCallback(async () => {
    try {
      const response = await productService.getAllProducts({ limit: 100 });
      setProducts(response.data?.products || []);
    } catch {
      // Silent fail for products filter
    }
  }, []);

  // Fetch questions
  const fetchQuestions = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params: { page: number; limit: number; status?: QuestionStatus; productId?: string } = {
        page: currentPage,
        limit: 10,
      };

      if (statusFilter !== "all") {
        params.status = statusFilter;
      }

      if (productFilter !== "all") {
        params.productId = productFilter;
      }

      const response = await qaService.getAllQuestions(params);
      setQuestions(response.data?.questions || []);
      setPagination(response.data?.pagination || DEFAULT_PAGINATION);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể tải danh sách câu hỏi"
      );
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, statusFilter, productFilter]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Handle status filter change
  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value as QuestionStatus | "all");
    setCurrentPage(1);
  };

  // Handle product filter change
  const handleProductFilterChange = (value: string) => {
    setProductFilter(value);
    setCurrentPage(1);
  };

  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Toggle expanded question
  const toggleExpanded = (questionId: string) => {
    setExpandedQuestions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(questionId)) {
        newSet.delete(questionId);
      } else {
        newSet.add(questionId);
      }
      return newSet;
    });
  };

  // Handle status update
  const handleUpdateStatus = async (questionId: string, newStatus: QuestionStatus) => {
    setIsUpdating(questionId);

    try {
      await qaService.updateQuestionStatus(questionId, newStatus);
      setNotification({
        type: "success",
        message: `Đã ${newStatus === "approved" ? "duyệt" : "từ chối"} câu hỏi`,
      });
      fetchQuestions();
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

  // Handle delete question
  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm("Bạn có chắc muốn xóa câu hỏi này và tất cả câu trả lời?")) {
      return;
    }

    setIsDeleting(questionId);

    try {
      await qaService.deleteQuestion(questionId);
      setNotification({
        type: "success",
        message: "Đã xóa câu hỏi",
      });
      fetchQuestions();
    } catch (err) {
      setNotification({
        type: "error",
        message: err instanceof Error ? err.message : "Không thể xóa câu hỏi",
      });
    } finally {
      setIsDeleting(null);
    }
  };

  // Handle delete answer
  const handleDeleteAnswer = async (answerId: string) => {
    if (!confirm("Bạn có chắc muốn xóa câu trả lời này?")) {
      return;
    }

    setIsDeleting(answerId);

    try {
      await qaService.deleteAnswer(answerId);
      setNotification({
        type: "success",
        message: "Đã xóa câu trả lời",
      });
      fetchQuestions();
    } catch (err) {
      setNotification({
        type: "error",
        message: err instanceof Error ? err.message : "Không thể xóa câu trả lời",
      });
    } finally {
      setIsDeleting(null);
    }
  };

  // Open answer dialog
  const openAnswerDialog = (question: Question) => {
    setSelectedQuestion(question);
    setAnswerText("");
    setAnswerDialogOpen(true);
  };

  // Submit answer
  const handleSubmitAnswer = async () => {
    if (!selectedQuestion || answerText.trim().length < 5) {
      setNotification({
        type: "error",
        message: "Câu trả lời phải có ít nhất 5 ký tự",
      });
      return;
    }

    if (answerText.trim().length > 1000) {
      setNotification({
        type: "error",
        message: "Câu trả lời không được vượt quá 1000 ký tự",
      });
      return;
    }

    setIsSubmittingAnswer(true);

    // Get questionId - handle both _id and id formats
    const questionId = selectedQuestion._id || (selectedQuestion as unknown as { id: string }).id;
    if (!questionId) {
      setNotification({
        type: "error",
        message: "Không tìm thấy ID câu hỏi",
      });
      setIsSubmittingAnswer(false);
      return;
    }

    try {
      await qaService.createAnswer({
        questionId,
        answerText: answerText.trim(),
      });
      setNotification({
        type: "success",
        message: "Đã trả lời câu hỏi",
      });
      setAnswerDialogOpen(false);
      setSelectedQuestion(null);
      setAnswerText("");
      fetchQuestions();
    } catch (err) {
      setNotification({
        type: "error",
        message: err instanceof Error ? err.message : "Không thể gửi câu trả lời",
      });
    } finally {
      setIsSubmittingAnswer(false);
    }
  };

  const pageNumbers = generatePageNumbers(
    pagination.currentPage,
    pagination.totalPages
  );


  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Quản lý Hỏi đáp</h1>
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

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
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

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Sản phẩm:</span>
          <Select value={productFilter} onValueChange={handleProductFilterChange}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Chọn sản phẩm" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả sản phẩm</SelectItem>
              {products.map((product) => (
                <SelectItem key={product._id} value={product._id}>
                  {product.name}
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

      {/* Questions table */}
      <div className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Người hỏi</TableHead>
              <TableHead className="max-w-xs">Câu hỏi</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Upvotes</TableHead>
              <TableHead>Ngày tạo</TableHead>
              <TableHead>Hành động</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton />
            ) : questions.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center text-muted-foreground py-8"
                >
                  Không có câu hỏi nào
                </TableCell>
              </TableRow>
            ) : (
              questions.map((question) => {
                // Handle both _id and id formats (Mongoose can return either)
                const questionId = question._id || (question as unknown as { id: string }).id;
                if (!questionId) return null;
                
                const isExpanded = expandedQuestions.has(questionId);
                const hasAnswers = question.answers && question.answers.length > 0;

                return (
                  <React.Fragment key={questionId}>
                    <TableRow>
                      <TableCell>
                        {hasAnswers && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toggleExpanded(questionId)}
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {questionId.slice(0, 8)}...
                      </TableCell>
                      <TableCell>{question.user?.name || "N/A"}</TableCell>
                      <TableCell className="max-w-xs">
                        <p className="truncate" title={question.questionText}>
                          {question.questionText}
                        </p>
                      </TableCell>
                      <TableCell>{getStatusBadge(question.status)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <ThumbsUp className="w-4 h-4 text-muted-foreground" />
                          {question.upvoteCount}
                        </div>
                      </TableCell>
                      <TableCell>{formatDate(question.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {question.status !== "approved" && question.status !== "answered" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                              onClick={() => handleUpdateStatus(questionId, "approved")}
                              disabled={isUpdating === questionId}
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Duyệt
                            </Button>
                          )}
                          {question.status !== "rejected" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => handleUpdateStatus(questionId, "rejected")}
                              disabled={isUpdating === questionId}
                            >
                              <XCircle className="w-4 h-4 mr-1" />
                              Từ chối
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openAnswerDialog(question)}
                          >
                            <MessageSquare className="w-4 h-4 mr-1" />
                            Trả lời
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDeleteQuestion(questionId)}
                            disabled={isDeleting === questionId}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {/* Expanded answers row */}
                    {isExpanded && hasAnswers && (
                      <TableRow key={`${questionId}-answers`}>
                        <TableCell colSpan={8} className="bg-muted/30 p-4">
                          <div className="space-y-3">
                            <h4 className="font-medium text-sm">
                              Câu trả lời ({question.answers.length})
                            </h4>
                            {question.answers.map((answer) => (
                              <AnswerItemRow
                                key={answer._id}
                                answer={answer}
                                onDelete={handleDeleteAnswer}
                                isDeleting={isDeleting === answer._id}
                              />
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
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
            {pagination.totalCount} câu hỏi)
          </div>
        )}
      </div>

      {/* Answer Dialog */}
      <Dialog open={answerDialogOpen} onOpenChange={setAnswerDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Trả lời câu hỏi</DialogTitle>
          </DialogHeader>
          {selectedQuestion && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm font-medium mb-1">Câu hỏi:</p>
                <p className="text-sm text-muted-foreground">
                  {selectedQuestion.questionText}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Bởi: {selectedQuestion.user?.name || "N/A"} -{" "}
                  {formatDate(selectedQuestion.createdAt)}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Câu trả lời:</label>
                <Textarea
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                  placeholder="Nhập câu trả lời (5-1000 ký tự)..."
                  rows={4}
                  maxLength={1000}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Tối thiểu 5 ký tự</span>
                  <span>{answerText.length}/1000</span>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setAnswerDialogOpen(false)}
                  disabled={isSubmittingAnswer}
                >
                  Hủy
                </Button>
                <Button
                  onClick={handleSubmitAnswer}
                  disabled={
                    isSubmittingAnswer ||
                    answerText.trim().length < 5 ||
                    answerText.trim().length > 1000
                  }
                >
                  {isSubmittingAnswer ? "Đang gửi..." : "Gửi câu trả lời"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
