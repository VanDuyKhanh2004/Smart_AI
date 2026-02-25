import { Edit, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Promotion, PromotionStatus } from '@/types/promotion.type';
import { getPromotionStatus, getPromotionStatusLabel, formatDiscount } from '@/types/promotion.type';

interface PromotionCardProps {
  promotion: Promotion;
  onEdit: (promotion: Promotion) => void;
  onDelete: (promotion: Promotion) => void;
  onToggle: (promotion: Promotion) => void;
  isDeleting?: boolean;
  isToggling?: boolean;
}

const statusColors: Record<PromotionStatus, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  inactive: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  expired: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  depleted: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
};

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export function PromotionCard({
  promotion,
  onEdit,
  onDelete,
  onToggle,
  isDeleting = false,
  isToggling = false,
}: PromotionCardProps) {
  const status = getPromotionStatus(promotion);
  const usagePercentage = (promotion.usedCount / promotion.usageLimit) * 100;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-lg font-mono">{promotion.code}</h3>
              <Badge className={statusColors[status]}>
                {getPromotionStatusLabel(status)}
              </Badge>
            </div>
            {promotion.description && (
              <p className="text-sm text-muted-foreground">{promotion.description}</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onToggle(promotion)}
              disabled={isToggling || status === 'expired' || status === 'depleted'}
              title={promotion.isActive ? 'Tạm dừng' : 'Kích hoạt'}
            >
              {promotion.isActive ? (
                <ToggleRight className="h-4 w-4 text-green-600" />
              ) : (
                <ToggleLeft className="h-4 w-4 text-gray-400" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(promotion)}
              title="Chỉnh sửa"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(promotion)}
              disabled={isDeleting}
              title="Xóa"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Discount Info */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Giảm giá:</span>
          <span className="font-semibold text-primary">{formatDiscount(promotion)}</span>
        </div>

        {/* Min Order Value */}
        {promotion.minOrderValue > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Đơn tối thiểu:</span>
            <span>{promotion.minOrderValue.toLocaleString('vi-VN')}đ</span>
          </div>
        )}

        {/* Max Discount Amount */}
        {promotion.maxDiscountAmount && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Giảm tối đa:</span>
            <span>{promotion.maxDiscountAmount.toLocaleString('vi-VN')}đ</span>
          </div>
        )}

        {/* Usage Progress */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Đã sử dụng:</span>
            <span>
              {promotion.usedCount} / {promotion.usageLimit}
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                usagePercentage >= 100
                  ? 'bg-red-500'
                  : usagePercentage >= 80
                  ? 'bg-orange-500'
                  : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(usagePercentage, 100)}%` }}
            />
          </div>
        </div>

        {/* Validity Period */}
        <div className="pt-2 border-t text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Bắt đầu: {formatDate(promotion.startDate)}</span>
          </div>
          <div className="flex justify-between">
            <span>Kết thúc: {formatDate(promotion.endDate)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
