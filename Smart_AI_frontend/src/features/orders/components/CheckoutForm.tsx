import React, { useState, useRef, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ShippingAddress } from '@/types/order.type';

interface FormErrors {
  fullName?: string;
  phone?: string;
  address?: string;
  ward?: string;
  district?: string;
  city?: string;
}

interface CheckoutFormProps {
  onSubmit: (shippingAddress: ShippingAddress) => void;
  isLoading?: boolean;
  onAddressChange?: (address: ShippingAddress) => void;
}

const CheckoutForm: React.FC<CheckoutFormProps> = ({ onSubmit, isLoading = false, onAddressChange }) => {
  const [formData, setFormData] = useState<ShippingAddress>({
    fullName: '',
    phone: '',
    address: '',
    ward: '',
    district: '',
    city: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  // W3-09: focus the first invalid field after a failed validation attempt.
  const formRef = useRef<HTMLFormElement>(null);
  const shouldFocusInvalidRef = useRef(false);

  useEffect(() => {
    if (shouldFocusInvalidRef.current) {
      shouldFocusInvalidRef.current = false;
      formRef.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus();
    }
  }, [errors]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Họ tên là bắt buộc';
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Số điện thoại là bắt buộc';
    } else if (!/^[0-9]{10,11}$/.test(formData.phone.trim())) {
      newErrors.phone = 'Số điện thoại phải có 10-11 chữ số';
    }

    if (!formData.address.trim()) {
      newErrors.address = 'Địa chỉ là bắt buộc';
    }

    if (!formData.ward.trim()) {
      newErrors.ward = 'Phường/Xã là bắt buộc';
    }

    if (!formData.district.trim()) {
      newErrors.district = 'Quận/Huyện là bắt buộc';
    }

    if (!formData.city.trim()) {
      newErrors.city = 'Tỉnh/Thành phố là bắt buộc';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (field: keyof ShippingAddress) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      onAddressChange?.(next);
      return next;
    });
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSubmit(formData);
    } else {
      shouldFocusInvalidRef.current = true;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Thông tin giao hàng</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" ref={formRef}>
          <div className="space-y-2">
            <label htmlFor="fullName" className="text-sm font-medium">
              Họ và tên <span className="text-destructive">*</span>
            </label>
            <Input
              id="fullName"
              type="text"
              placeholder="Nguyễn Văn A"
              value={formData.fullName}
              onChange={handleChange('fullName')}
              aria-invalid={!!errors.fullName}
              disabled={isLoading}
            />
            {errors.fullName && (
              <p role="alert" className="text-sm text-destructive">{errors.fullName}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="phone" className="text-sm font-medium">
              Số điện thoại <span className="text-destructive">*</span>
            </label>
            <Input
              id="phone"
              type="tel"
              placeholder="0901234567"
              value={formData.phone}
              onChange={handleChange('phone')}
              aria-invalid={!!errors.phone}
              disabled={isLoading}
            />
            {errors.phone && (
              <p role="alert" className="text-sm text-destructive">{errors.phone}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="address" className="text-sm font-medium">
              Địa chỉ <span className="text-destructive">*</span>
            </label>
            <Input
              id="address"
              type="text"
              placeholder="Số nhà, tên đường"
              value={formData.address}
              onChange={handleChange('address')}
              aria-invalid={!!errors.address}
              disabled={isLoading}
            />
            {errors.address && (
              <p role="alert" className="text-sm text-destructive">{errors.address}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label htmlFor="ward" className="text-sm font-medium">
                Phường/Xã <span className="text-destructive">*</span>
              </label>
              <Input
                id="ward"
                type="text"
                placeholder="Phường 1"
                value={formData.ward}
                onChange={handleChange('ward')}
                aria-invalid={!!errors.ward}
                disabled={isLoading}
              />
              {errors.ward && (
                <p role="alert" className="text-sm text-destructive">{errors.ward}</p>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="district" className="text-sm font-medium">
                Quận/Huyện <span className="text-destructive">*</span>
              </label>
              <Input
                id="district"
                type="text"
                placeholder="Quận 1"
                value={formData.district}
                onChange={handleChange('district')}
                aria-invalid={!!errors.district}
                disabled={isLoading}
              />
              {errors.district && (
                <p role="alert" className="text-sm text-destructive">{errors.district}</p>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="city" className="text-sm font-medium">
                Tỉnh/Thành phố <span className="text-destructive">*</span>
              </label>
              <Input
                id="city"
                type="text"
                placeholder="TP. Hồ Chí Minh"
                value={formData.city}
                onChange={handleChange('city')}
                aria-invalid={!!errors.city}
                disabled={isLoading}
              />
              {errors.city && (
                <p role="alert" className="text-sm text-destructive">{errors.city}</p>
              )}
            </div>
          </div>

          {/* W4-S41: submit busy state exposed while the order is pending */}
          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={isLoading}
            aria-busy={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                Đang xử lý...
              </>
            ) : (
              'Đặt hàng'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default CheckoutForm;
