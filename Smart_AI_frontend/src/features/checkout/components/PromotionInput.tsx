import React, { useState } from 'react';
import { Tag, X, Loader2, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { promotionService } from '@/services/promotion.service';
import type { Promotion } from '@/types/promotion.type';

interface AppliedPromotion {
  promotion: Promotion;
  discountAmount: number;
}

interface PromotionInputProps {
  orderTotal: number;
  appliedPromotion: AppliedPromotion | null;
  onApplyPromotion: (promotion: AppliedPromotion) => void;
  onRemovePromotion: () => void;
  disabled?: boolean;
}

const PromotionInput: React.FC<PromotionInputProps> = ({
  orderTotal,
  appliedPromotion,
  onApplyPromotion,
  onRemovePromotion,
  disabled = false,
}) => {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(price);
  };

  const handleApply = async () => {
    if (!code.trim()) {
      setError('Vui lòng nhập mã khuyến mãi');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await promotionService.validatePromotion({
        code: code.trim().toUpperCase(),
        orderTotal,
      });

      if (response.success && response.data) {
        onApplyPromotion({
          promotion: response.data.promotion,
          discountAmount: response.data.discountAmount,
        });
        setCode('');
      }
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setError(
        axiosError.response?.data?.message || 'Mã khuyến mãi không hợp lệ'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = () => {
    onRemovePromotion();
    setError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isLoading && !disabled) {
      e.preventDefault();
      handleApply();
    }
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCode(e.target.value.toUpperCase());
    if (error) setError(null);
  };

  // If promotion is applied, show applied state
  if (appliedPromotion) {
    const { promotion, discountAmount } = appliedPromotion;
    const discountDisplay = promotion.discountType === 'percentage'
      ? `${promotion.discountValue}%`
      : formatPrice(promotion.discountValue);

    return (
      <div className="space-y-2">
        <label className="text-sm font-medium flex items-center gap-2">
          <Tag className="h-4 w-4" />
          Mã khuyến mãi
        </label>
        <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-md">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <div>
              <div className="font-medium text-green-800">
                {promotion.code}
              </div>
              <div className="text-sm text-green-600">
                Giảm {discountDisplay}
                {promotion.description && ` - ${promotion.description}`}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-semibold text-green-700">
              -{formatPrice(discountAmount)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              disabled={disabled}
              className="h-8 w-8 p-0 text-green-700 hover:text-red-600 hover:bg-red-50"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Show input form
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium flex items-center gap-2">
        <Tag className="h-4 w-4" />
        Mã khuyến mãi
      </label>
      <div className="flex gap-2">
        <Input
          type="text"
          placeholder="Nhập mã khuyến mãi"
          value={code}
          onChange={handleCodeChange}
          onKeyDown={handleKeyDown}
          disabled={isLoading || disabled}
          className={error ? 'border-destructive' : ''}
        />
        <Button
          onClick={handleApply}
          disabled={isLoading || disabled || !code.trim()}
          className="shrink-0"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Đang kiểm tra...
            </>
          ) : (
            'Áp dụng'
          )}
        </Button>
      </div>
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
};

export default PromotionInput;
