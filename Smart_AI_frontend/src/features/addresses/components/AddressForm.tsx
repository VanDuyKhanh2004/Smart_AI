import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Address, CreateAddressRequest } from "@/types/address.type";
import { ADDRESS_LABELS } from "@/types/address.type";

interface AddressFormProps {
  /** Address to edit (undefined for create mode) */
  address?: Address;
  /** Callback when form is submitted */
  onSubmit: (data: CreateAddressRequest) => void;
  /** Callback when form is cancelled */
  onCancel: () => void;
  /** Whether form is submitting */
  isLoading?: boolean;
}

interface FormErrors {
  label?: string;
  fullName?: string;
  phone?: string;
  address?: string;
  ward?: string;
  district?: string;
  city?: string;
}

/**
 * AddressForm component for creating/editing addresses
 * Requirements 1.1: Form fields for label, fullName, phone, address, ward, district, city
 * Requirements 1.4: Phone validation with 10-11 digits
 * Requirements 3.1: Pre-fill form with current data for edit mode
 */
export function AddressForm({
  address,
  onSubmit,
  onCancel,
  isLoading = false,
}: AddressFormProps) {
  const isEditMode = !!address;

  const [formData, setFormData] = useState<CreateAddressRequest>({
    label: address?.label || "home",
    fullName: address?.fullName || "",
    phone: address?.phone || "",
    address: address?.address || "",
    ward: address?.ward || "",
    district: address?.district || "",
    city: address?.city || "",
  });

  const [errors, setErrors] = useState<FormErrors>({});

  // W4-A41 (from W3-09): focus the first invalid field after a failed attempt.
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

  // Update form when address prop changes (for edit mode)
  useEffect(() => {
    if (address) {
      setFormData({
        label: address.label,
        fullName: address.fullName,
        phone: address.phone,
        address: address.address,
        ward: address.ward,
        district: address.district,
        city: address.city,
      });
    }
  }, [address]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.label) {
      newErrors.label = "Vui lòng chọn nhãn địa chỉ";
    }

    if (!formData.fullName || formData.fullName.trim().length < 2) {
      newErrors.fullName = "Họ tên phải có ít nhất 2 ký tự";
    }

    // Phone validation: 10-11 digits
    const phoneRegex = /^[0-9]{10,11}$/;
    if (!formData.phone || !phoneRegex.test(formData.phone)) {
      newErrors.phone = "Số điện thoại phải có 10-11 chữ số";
    }

    if (!formData.address || formData.address.trim() === "") {
      newErrors.address = "Địa chỉ là bắt buộc";
    }

    if (!formData.ward || formData.ward.trim() === "") {
      newErrors.ward = "Phường/Xã là bắt buộc";
    }

    if (!formData.district || formData.district.trim() === "") {
      newErrors.district = "Quận/Huyện là bắt buộc";
    }

    if (!formData.city || formData.city.trim() === "") {
      newErrors.city = "Tỉnh/Thành phố là bắt buộc";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSubmit(formData);
    } else {
      shouldFocusInvalidRef.current = true;
    }
  };

  const handleChange = (field: keyof CreateAddressRequest, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-4">
      {/* Label Select */}
      <div className="space-y-2">
        <label htmlFor="address-label" className="text-sm font-medium">
          Nhãn địa chỉ
        </label>
        <Select
          value={formData.label}
          onValueChange={(value) => handleChange("label", value)}
        >
          <SelectTrigger
            id="address-label"
            aria-required="true"
            aria-invalid={!!errors.label}
            aria-describedby={errors.label ? "address-label-error" : undefined}
          >
            <SelectValue placeholder="Chọn nhãn" />
          </SelectTrigger>
          <SelectContent>
            {ADDRESS_LABELS.map((label) => (
              <SelectItem key={label.value} value={label.value}>
                {label.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.label && (
          <p id="address-label-error" role="alert" className="text-sm text-destructive">
            {errors.label}
          </p>
        )}
      </div>

      {/* Full Name */}
      <div className="space-y-2">
        <label htmlFor="address-fullName" className="text-sm font-medium">
          Họ và tên
        </label>
        <Input
          id="address-fullName"
          value={formData.fullName}
          onChange={(e) => handleChange("fullName", e.target.value)}
          placeholder="Nhập họ và tên người nhận"
          required
          aria-invalid={!!errors.fullName}
          aria-describedby={errors.fullName ? "address-fullname-error" : undefined}
        />
        {errors.fullName && (
          <p id="address-fullname-error" role="alert" className="text-sm text-destructive">
            {errors.fullName}
          </p>
        )}
      </div>

      {/* Phone */}
      <div className="space-y-2">
        <label htmlFor="address-phone" className="text-sm font-medium">
          Số điện thoại
        </label>
        <Input
          id="address-phone"
          value={formData.phone}
          onChange={(e) => handleChange("phone", e.target.value)}
          placeholder="Nhập số điện thoại"
          required
          aria-invalid={!!errors.phone}
          aria-describedby={errors.phone ? "address-phone-error" : undefined}
        />
        {errors.phone && (
          <p id="address-phone-error" role="alert" className="text-sm text-destructive">
            {errors.phone}
          </p>
        )}
      </div>

      {/* Address */}
      <div className="space-y-2">
        <label htmlFor="address-street" className="text-sm font-medium">
          Địa chỉ
        </label>
        <Input
          id="address-street"
          value={formData.address}
          onChange={(e) => handleChange("address", e.target.value)}
          placeholder="Số nhà, tên đường"
          required
          aria-invalid={!!errors.address}
          aria-describedby={errors.address ? "address-street-error" : undefined}
        />
        {errors.address && (
          <p id="address-street-error" role="alert" className="text-sm text-destructive">
            {errors.address}
          </p>
        )}
      </div>

      {/* Ward */}
      <div className="space-y-2">
        <label htmlFor="address-ward" className="text-sm font-medium">
          Phường/Xã
        </label>
        <Input
          id="address-ward"
          value={formData.ward}
          onChange={(e) => handleChange("ward", e.target.value)}
          placeholder="Nhập phường/xã"
          required
          aria-invalid={!!errors.ward}
          aria-describedby={errors.ward ? "address-ward-error" : undefined}
        />
        {errors.ward && (
          <p id="address-ward-error" role="alert" className="text-sm text-destructive">
            {errors.ward}
          </p>
        )}
      </div>

      {/* District */}
      <div className="space-y-2">
        <label htmlFor="address-district" className="text-sm font-medium">
          Quận/Huyện
        </label>
        <Input
          id="address-district"
          value={formData.district}
          onChange={(e) => handleChange("district", e.target.value)}
          placeholder="Nhập quận/huyện"
          required
          aria-invalid={!!errors.district}
          aria-describedby={errors.district ? "address-district-error" : undefined}
        />
        {errors.district && (
          <p id="address-district-error" role="alert" className="text-sm text-destructive">
            {errors.district}
          </p>
        )}
      </div>

      {/* City */}
      <div className="space-y-2">
        <label htmlFor="address-city" className="text-sm font-medium">
          Tỉnh/Thành phố
        </label>
        <Input
          id="address-city"
          value={formData.city}
          onChange={(e) => handleChange("city", e.target.value)}
          placeholder="Nhập tỉnh/thành phố"
          required
          aria-invalid={!!errors.city}
          aria-describedby={errors.city ? "address-city-error" : undefined}
        />
        {errors.city && (
          <p id="address-city-error" role="alert" className="text-sm text-destructive">
            {errors.city}
          </p>
        )}
      </div>

      {/* Form Actions */}
      <div className="flex gap-3 pt-4">
        <Button type="submit" disabled={isLoading} className="flex-1">
          {isLoading ? "Đang lưu..." : isEditMode ? "Cập nhật" : "Thêm địa chỉ"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isLoading}
        >
          Hủy
        </Button>
      </div>
    </form>
  );
}
