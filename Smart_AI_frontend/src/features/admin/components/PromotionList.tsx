import { PromotionCard } from './PromotionCard';
import type { Promotion, PromotionStatus } from '@/types/promotion.type';

interface PromotionListProps {
  promotions: Promotion[];
  onEdit: (promotion: Promotion) => void;
  onDelete: (promotion: Promotion) => void;
  onToggle: (promotion: Promotion) => void;
  isLoading?: boolean;
  deletingId?: string | null;
  togglingId?: string | null;
  statusFilter?: PromotionStatus | 'all';
}

export function PromotionList({
  promotions,
  onEdit,
  onDelete,
  onToggle,
  isLoading = false,
  deletingId = null,
  togglingId = null,
}: PromotionListProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="h-64 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (promotions.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg">Không có mã khuyến mãi nào</p>
        <p className="text-sm mt-1">Nhấn "Tạo mã mới" để thêm mã khuyến mãi</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {promotions.map((promotion) => (
        <PromotionCard
          key={promotion._id}
          promotion={promotion}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggle={onToggle}
          isDeleting={deletingId === promotion._id}
          isToggling={togglingId === promotion._id}
        />
      ))}
    </div>
  );
}
