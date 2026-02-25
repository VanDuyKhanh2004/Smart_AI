import { useState, useCallback, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { PromotionForm } from '../components/PromotionForm';
import { PromotionList } from '../components/PromotionList';
import { promotionService } from '@/services/promotion.service';
import type { Promotion, CreatePromotionRequest, UpdatePromotionRequest, PromotionStatus } from '@/types/promotion.type';

interface PaginationState {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const DEFAULT_PAGINATION: PaginationState = {
  total: 0,
  page: 1,
  limit: 12,
  totalPages: 1,
};

type StatusFilter = PromotionStatus | 'all';

export function AdminPromotionPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [pagination, setPagination] = useState<PaginationState>(DEFAULT_PAGINATION);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);
  const [deletingPromotion, setDeletingPromotion] = useState<Promotion | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const fetchPromotions = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: { page: number; limit: number; status?: PromotionStatus } = {
        page,
        limit: DEFAULT_PAGINATION.limit,
      };
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }
      const response = await promotionService.getPromotions(params);
      setPromotions(response.data);
      setPagination(response.pagination);
    } catch {
      setNotification({ type: 'error', message: 'Không thể tải danh sách mã khuyến mãi' });
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchPromotions();
  }, [fetchPromotions]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleCreatePromotion = async (data: CreatePromotionRequest | UpdatePromotionRequest) => {
    setIsSubmitting(true);
    try {
      await promotionService.createPromotion(data as CreatePromotionRequest);
      setNotification({ type: 'success', message: 'Tạo mã khuyến mãi thành công' });
      setIsFormOpen(false);
      fetchPromotions();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      const message = err.response?.data?.message || 'Không thể tạo mã khuyến mãi';
      setNotification({ type: 'error', message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdatePromotion = async (data: CreatePromotionRequest | UpdatePromotionRequest) => {
    if (!editingPromotion) return;
    setIsSubmitting(true);
    try {
      await promotionService.updatePromotion(editingPromotion._id, data as UpdatePromotionRequest);
      setNotification({ type: 'success', message: 'Cập nhật mã khuyến mãi thành công' });
      setEditingPromotion(null);
      fetchPromotions();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      const message = err.response?.data?.message || 'Không thể cập nhật mã khuyến mãi';
      setNotification({ type: 'error', message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePromotion = async () => {
    if (!deletingPromotion) return;
    setDeletingId(deletingPromotion._id);
    try {
      await promotionService.deletePromotion(deletingPromotion._id);
      setNotification({ type: 'success', message: 'Xóa mã khuyến mãi thành công' });
      setIsDeleteDialogOpen(false);
      setDeletingPromotion(null);
      fetchPromotions();
    } catch {
      setNotification({ type: 'error', message: 'Không thể xóa mã khuyến mãi' });
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleStatus = async (promotion: Promotion) => {
    setTogglingId(promotion._id);
    try {
      await promotionService.toggleStatus(promotion._id);
      setNotification({
        type: 'success',
        message: promotion.isActive ? 'Đã tạm dừng mã khuyến mãi' : 'Đã kích hoạt mã khuyến mãi',
      });
      fetchPromotions();
    } catch {
      setNotification({ type: 'error', message: 'Không thể thay đổi trạng thái' });
    } finally {
      setTogglingId(null);
    }
  };

  const handleEdit = (promotion: Promotion) => {
    setEditingPromotion(promotion);
  };

  const handleDelete = (promotion: Promotion) => {
    setDeletingPromotion(promotion);
    setIsDeleteDialogOpen(true);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value as StatusFilter);
    setPage(1);
  };

  const renderPaginationItems = () => {
    const items = [];
    const { page: currentPage, totalPages } = pagination;

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
        items.push(
          <PaginationItem key={i}>
            <PaginationLink
              href="#"
              isActive={i === currentPage}
              onClick={(e) => {
                e.preventDefault();
                handlePageChange(i);
              }}
            >
              {i}
            </PaginationLink>
          </PaginationItem>
        );
      }
    }
    return items;
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Quản lý mã khuyến mãi</h1>
        <Button onClick={() => setIsFormOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Tạo mã mới
        </Button>
      </div>

      {notification && (
        <div
          className={`p-4 rounded-md ${
            notification.type === 'success'
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
              : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
          }`}
        >
          {notification.message}
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">Lọc theo trạng thái:</span>
        <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tất cả" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả</SelectItem>
            <SelectItem value="active">Đang hoạt động</SelectItem>
            <SelectItem value="inactive">Tạm dừng</SelectItem>
            <SelectItem value="expired">Hết hạn</SelectItem>
            <SelectItem value="depleted">Hết lượt</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Promotion List */}
      <PromotionList
        promotions={promotions}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onToggle={handleToggleStatus}
        isLoading={isLoading}
        deletingId={deletingId}
        togglingId={togglingId}
      />

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            {pagination.page > 1 && (
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    handlePageChange(pagination.page - 1);
                  }}
                />
              </PaginationItem>
            )}
            {renderPaginationItems()}
            {pagination.page < pagination.totalPages && (
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    handlePageChange(pagination.page + 1);
                  }}
                />
              </PaginationItem>
            )}
          </PaginationContent>
        </Pagination>
      )}

      {/* Create Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tạo mã khuyến mãi mới</DialogTitle>
          </DialogHeader>
          <PromotionForm
            onSubmit={handleCreatePromotion}
            onCancel={() => setIsFormOpen(false)}
            isLoading={isSubmitting}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingPromotion} onOpenChange={(open) => !open && setEditingPromotion(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa mã khuyến mãi</DialogTitle>
          </DialogHeader>
          <PromotionForm
            promotion={editingPromotion}
            onSubmit={handleUpdatePromotion}
            onCancel={() => setEditingPromotion(null)}
            isLoading={isSubmitting}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận xóa</DialogTitle>
            <DialogDescription>
              Bạn có chắc chắn muốn xóa mã khuyến mãi <strong>{deletingPromotion?.code}</strong>?
              Hành động này không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsDeleteDialogOpen(false);
                setDeletingPromotion(null);
              }}
            >
              Hủy
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeletePromotion}
              disabled={!!deletingId}
            >
              {deletingId ? 'Đang xóa...' : 'Xóa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
