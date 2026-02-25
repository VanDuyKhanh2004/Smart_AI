import { useState, useEffect } from "react";
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
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Label Select */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Nhãn địa chỉ</label>
        <Select
          value={formData.label}
          onValueChange={(value) => handleChange("label", value)}
        >
          <SelectTrigger className="w-full">
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
          <p className="text-sm text-destructive">{errors.label}</p>
        )}
      </div>

      {/* Full Name */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Họ và tên</label>
        <Input
          value={formData.fullName}
          onChange={(e) => handleChange("fullName", e.target.value)}
          placeholder="Nhập họ và tên người nhận"
          aria-invalid={!!errors.fullName}
        />
        {errors.fullName && (
          <p className="text-sm text-destructive">{errors.fullName}</p>
        )}
      </div>

      {/* Phone */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Số điện thoại</label>
        <Input
          value={formData.phone}
          onChange={(e) => handleChange("phone", e.target.value)}
          placeholder="Nhập số điện thoại"
          aria-invalid={!!errors.phone}
        />
        {errors.phone && (
          <p className="text-sm text-destructive">{errors.phone}</p>
        )}
      </div>

      {/* Address */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Địa chỉ</label>
        <Input
          value={formData.address}
          onChange={(e) => handleChange("address", e.target.value)}
          placeholder="Số nhà, tên đường"
          aria-invalid={!!errors.address}
        />
        {errors.address && (
          <p className="text-sm text-destructive">{errors.address}</p>
        )}
      </div>

      {/* Ward */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Phường/Xã</label>
        <Input
          value={formData.ward}
          onChange={(e) => handleChange("ward", e.target.value)}
          placeholder="Nhập phường/xã"
          aria-invalid={!!errors.ward}
        />
        {errors.ward && (
          <p className="text-sm text-destructive">{errors.ward}</p>
        )}
      </div>

      {/* District */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Quận/Huyện</label>
        <Input
          value={formData.district}
          onChange={(e) => handleChange("district", e.target.value)}
          placeholder="Nhập quận/huyện"
          aria-invalid={!!errors.district}
        />
        {errors.district && (
          <p className="text-sm text-destructive">{errors.district}</p>
        )}
      </div>

      {/* City */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Tỉnh/Thành phố</label>
        <Input
          value={formData.city}
          onChange={(e) => handleChange("city", e.target.value)}
          placeholder="Nhập tỉnh/thành phố"
          aria-invalid={!!errors.city}
        />
        {errors.city && (
          <p className="text-sm text-destructive">{errors.city}</p>
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
