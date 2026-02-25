import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Promotion, CreatePromotionRequest, UpdatePromotionRequest, DiscountType } from '@/types/promotion.type';

interface PromotionFormProps {
  promotion?: Promotion | null;
  onSubmit: (data: CreatePromotionRequest | UpdatePromotionRequest) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

interface FormErrors {
  code?: string;
  discountType?: string;
  discountValue?: string;
  usageLimit?: string;
  startDate?: string;
  endDate?: string;
  minOrderValue?: string;
  maxDiscountAmount?: string;
}

interface FormData {
  code: string;
  description: string;
  discountType: DiscountType;
  discountValue: number | '';
  minOrderValue: number | '';
  maxDiscountAmount: number | '' | null;
  usageLimit: number | '';
  startDate: string;
  endDate: string;
}

const formatDateForInput = (dateString: string): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toISOString().slice(0, 16);
};

export function PromotionForm({ promotion, onSubmit, onCancel, isLoading = false }: PromotionFormProps) {
  const isEditMode = !!promotion;

  const [formData, setFormData] = useState<FormData>({
    code: '',
    description: '',
    discountType: 'percentage',
    discountValue: '',
    minOrderValue: 0,
    maxDiscountAmount: null,
    usageLimit: '',
    startDate: '',
    endDate: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    if (promotion) {
      setFormData({
        code: promotion.code,
        description: promotion.description || '',
        discountType: promotion.discountType,
        discountValue: promotion.discountValue,
        minOrderValue: promotion.minOrderValue || 0,
        maxDiscountAmount: promotion.maxDiscountAmount ?? null,
        usageLimit: promotion.usageLimit,
        startDate: formatDateForInput(promotion.startDate),
        endDate: formatDateForInput(promotion.endDate),
      });
    }
  }, [promotion]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Code validation (only for create mode)
    if (!isEditMode) {
      if (!formData.code.trim()) {
        newErrors.code = 'Mã khuyến mãi là bắt buộc';
      } else if (!/^[A-Z0-9]+$/.test(formData.code.toUpperCase())) {
        newErrors.code = 'Mã chỉ chứa chữ cái và số';
      } else if (formData.code.length < 4 || formData.code.length > 20) {
        newErrors.code = 'Mã phải có từ 4-20 ký tự';
      }
    }

    // Discount value validation
    if (!formData.discountValue || Number(formData.discountValue) <= 0) {
      newErrors.discountValue = 'Giá trị giảm giá phải lớn hơn 0';
    } else if (formData.discountType === 'percentage' && Number(formData.discountValue) > 100) {
      newErrors.discountValue = 'Phần trăm giảm giá không được vượt quá 100';
    }

    // Usage limit validation
    if (!formData.usageLimit || Number(formData.usageLimit) < 1) {
      newErrors.usageLimit = 'Giới hạn sử dụng phải ít nhất là 1';
    }

    // Date validation
    if (!formData.startDate) {
      newErrors.startDate = 'Ngày bắt đầu là bắt buộc';
    }
    if (!formData.endDate) {
      newErrors.endDate = 'Ngày kết thúc là bắt buộc';
    }
    if (formData.startDate && formData.endDate) {
      const start = new Date(formData.startDate);
      const end = new Date(formData.endDate);
      if (end <= start) {
        newErrors.endDate = 'Ngày kết thúc phải sau ngày bắt đầu';
      }
    }

    // Min order value validation
    if (formData.minOrderValue !== '' && Number(formData.minOrderValue) < 0) {
      newErrors.minOrderValue = 'Giá trị đơn hàng tối thiểu không được âm';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    if (isEditMode) {
      const updateData: UpdatePromotionRequest = {
        description: formData.description || undefined,
        discountValue: Number(formData.discountValue),
        minOrderValue: Number(formData.minOrderValue) || 0,
        maxDiscountAmount: formData.maxDiscountAmount ? Number(formData.maxDiscountAmount) : null,
        usageLimit: Number(formData.usageLimit),
        endDate: new Date(formData.endDate).toISOString(),
      };
      await onSubmit(updateData);
    } else {
      const createData: CreatePromotionRequest = {
        code: formData.code.toUpperCase(),
        description: formData.description || undefined,
        discountType: formData.discountType,
        discountValue: Number(formData.discountValue),
        minOrderValue: Number(formData.minOrderValue) || 0,
        maxDiscountAmount: formData.maxDiscountAmount ? Number(formData.maxDiscountAmount) : undefined,
        usageLimit: Number(formData.usageLimit),
        startDate: new Date(formData.startDate).toISOString(),
        endDate: new Date(formData.endDate).toISOString(),
      };
      await onSubmit(createData);
    }
  };

  const handleInputChange = (field: keyof FormData, value: string | number | null) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const isFormValid = isEditMode
    ? formData.discountValue && Number(formData.discountValue) > 0 && formData.usageLimit && formData.endDate
    : formData.code.trim() && formData.discountValue && Number(formData.discountValue) > 0 && 
      formData.usageLimit && formData.startDate && formData.endDate;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Code field - only for create mode */}
      {!isEditMode && (
        <div className="space-y-2">
          <label htmlFor="code" className="text-sm font-medium">
            Mã khuyến mãi <span className="text-destructive">*</span>
          </label>
          <Input
            id="code"
            value={formData.code}
            onChange={(e) => handleInputChange('code', e.target.value.toUpperCase())}
            placeholder="VD: SALE20, NEWYEAR2024"
            aria-invalid={!!errors.code}
            disabled={isLoading}
            maxLength={20}
          />
          {errors.code && <p className="text-sm text-destructive">{errors.code}</p>}
          <p className="text-xs text-muted-foreground">Chỉ chứa chữ cái và số, 4-20 ký tự</p>
        </div>
      )}

      {/* Description */}
      <div className="space-y-2">
        <label htmlFor="description" className="text-sm font-medium">
          Mô tả
        </label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => handleInputChange('description', e.target.value)}
          placeholder="Mô tả khuyến mãi"
          disabled={isLoading}
          rows={2}
          maxLength={200}
        />
      </div>

      {/* Discount Type and Value */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label htmlFor="discountType" className="text-sm font-medium">
            Loại giảm giá <span className="text-destructive">*</span>
          </label>
          <Select
            value={formData.discountType}
            onValueChange={(value: DiscountType) => handleInputChange('discountType', value)}
            disabled={isLoading || isEditMode}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Chọn loại" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percentage">Phần trăm (%)</SelectItem>
              <SelectItem value="fixed">Số tiền cố định (VNĐ)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label htmlFor="discountValue" className="text-sm font-medium">
            Giá trị giảm <span className="text-destructive">*</span>
          </label>
          <Input
            id="discountValue"
            type="number"
            value={formData.discountValue}
            onChange={(e) => handleInputChange('discountValue', e.target.value ? Number(e.target.value) : '')}
            placeholder={formData.discountType === 'percentage' ? '1-100' : 'Số tiền'}
            aria-invalid={!!errors.discountValue}
            disabled={isLoading}
            min={1}
            max={formData.discountType === 'percentage' ? 100 : undefined}
          />
          {errors.discountValue && <p className="text-sm text-destructive">{errors.discountValue}</p>}
        </div>
      </div>

      {/* Min Order Value and Max Discount Amount */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label htmlFor="minOrderValue" className="text-sm font-medium">
            Đơn hàng tối thiểu (VNĐ)
          </label>
          <Input
            id="minOrderValue"
            type="number"
            value={formData.minOrderValue}
            onChange={(e) => handleInputChange('minOrderValue', e.target.value ? Number(e.target.value) : '')}
            placeholder="0"
            aria-invalid={!!errors.minOrderValue}
            disabled={isLoading}
            min={0}
          />
          {errors.minOrderValue && <p className="text-sm text-destructive">{errors.minOrderValue}</p>}
        </div>

        <div className="space-y-2">
          <label htmlFor="maxDiscountAmount" className="text-sm font-medium">
            Giảm tối đa (VNĐ)
          </label>
          <Input
            id="maxDiscountAmount"
            type="number"
            value={formData.maxDiscountAmount ?? ''}
            onChange={(e) => handleInputChange('maxDiscountAmount', e.target.value ? Number(e.target.value) : null)}
            placeholder="Không giới hạn"
            disabled={isLoading}
            min={0}
          />
          <p className="text-xs text-muted-foreground">Để trống = không giới hạn</p>
        </div>
      </div>

      {/* Usage Limit */}
      <div className="space-y-2">
        <label htmlFor="usageLimit" className="text-sm font-medium">
          Giới hạn sử dụng <span className="text-destructive">*</span>
        </label>
        <Input
          id="usageLimit"
          type="number"
          value={formData.usageLimit}
          onChange={(e) => handleInputChange('usageLimit', e.target.value ? Number(e.target.value) : '')}
          placeholder="Số lần sử dụng tối đa"
          aria-invalid={!!errors.usageLimit}
          disabled={isLoading}
          min={1}
        />
        {errors.usageLimit && <p className="text-sm text-destructive">{errors.usageLimit}</p>}
      </div>

      {/* Date Range */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label htmlFor="startDate" className="text-sm font-medium">
            Ngày bắt đầu <span className="text-destructive">*</span>
          </label>
          <Input
            id="startDate"
            type="datetime-local"
            value={formData.startDate}
            onChange={(e) => handleInputChange('startDate', e.target.value)}
            aria-invalid={!!errors.startDate}
            disabled={isLoading || isEditMode}
          />
          {errors.startDate && <p className="text-sm text-destructive">{errors.startDate}</p>}
        </div>

        <div className="space-y-2">
          <label htmlFor="endDate" className="text-sm font-medium">
            Ngày kết thúc <span className="text-destructive">*</span>
          </label>
          <Input
            id="endDate"
            type="datetime-local"
            value={formData.endDate}
            onChange={(e) => handleInputChange('endDate', e.target.value)}
            aria-invalid={!!errors.endDate}
            disabled={isLoading}
          />
          {errors.endDate && <p className="text-sm text-destructive">{errors.endDate}</p>}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Hủy
        </Button>
        <Button type="submit" disabled={isLoading || !isFormValid}>
          {isLoading ? 'Đang xử lý...' : isEditMode ? 'Cập nhật' : 'Tạo mã'}
        </Button>
      </div>
    </form>
  );
}
