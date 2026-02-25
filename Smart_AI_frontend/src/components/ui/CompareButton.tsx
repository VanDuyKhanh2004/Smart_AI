import React from 'react';
import { GitCompareArrows } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCompareStore, MAX_COMPARE_ITEMS } from '@/stores/compareStore';
import { cn } from '@/lib/utils';

interface CompareButtonProps {
  productId: string;
  size?: 'sm' | 'default' | 'lg' | 'icon';
  variant?: 'default' | 'outline' | 'ghost';
  className?: string;
  showText?: boolean;
}

/**
 * CompareButton Component
 * 
 * Toggle button that adds/removes a product from the comparison list.
 * - Shows active state if product is in comparison list
 * - Disabled when list is full (4 products) and product is not in list
 * 
 * Requirements: 1.1, 2.1
 */
const CompareButton: React.FC<CompareButtonProps> = ({
  productId,
  size = 'icon',
  variant = 'ghost',
  className,
  showText = false,
}) => {
  const { isInCompare, canAddMore, addToCompare, removeFromCompare } = useCompareStore();
  
  const inCompare = isInCompare(productId);
  const isDisabled = !inCompare && !canAddMore();

  const handleClick = (e: React.MouseEvent) => {
    // Prevent event bubbling (e.g., when button is inside a Link)
    e.preventDefault();
    e.stopPropagation();

    if (inCompare) {
      // Requirement 2.1: Remove from comparison list
      removeFromCompare(productId);
    } else {
      // Requirement 1.1: Add to comparison list
      addToCompare(productId);
    }
  };

  const getTooltipText = () => {
    if (inCompare) return 'Xóa khỏi so sánh';
    if (isDisabled) return `Chỉ có thể so sánh tối đa ${MAX_COMPARE_ITEMS} sản phẩm`;
    return 'Thêm vào so sánh';
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={cn(
        'transition-colors',
        inCompare && 'text-blue-500 hover:text-blue-600 bg-blue-50 hover:bg-blue-100',
        className
      )}
      onClick={handleClick}
      disabled={isDisabled}
      aria-label={getTooltipText()}
      title={getTooltipText()}
    >
      <GitCompareArrows
        className={cn(
          size === 'lg' ? 'h-5 w-5' : 'h-4 w-4',
          inCompare && 'fill-current'
        )}
      />
      {showText && (
        <span className="ml-2">
          {inCompare ? 'Đã thêm' : 'So sánh'}
        </span>
      )}
    </Button>
  );
};

export default CompareButton;
