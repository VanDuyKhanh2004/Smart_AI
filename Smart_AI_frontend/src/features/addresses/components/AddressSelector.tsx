import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MapPin, Plus } from 'lucide-react';
import { AddressCard } from './AddressCard';
import type { Address, CreateAddressRequest } from '@/types/address.type';
import type { ShippingAddress } from '@/types/order.type';
import { ADDRESS_LABELS, MAX_ADDRESSES } from '@/types/address.type';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface AddressSelectorProps {
  /** List of saved addresses */
  addresses: Address[];
  /** Currently selected address */
  selectedAddress: Address | null;
  /** Callback when an address is selected */
  onSelectAddress: (address: Address | null) => void;
  /** Callback when user wants to use a new address (manual entry) */
  onUseNewAddress: (shippingAddress: ShippingAddress, saveAddress: boolean, addressData?: CreateAddressRequest) => void;
  /** Whether the component is in loading state */
  isLoading?: boolean;
  /** Whether to show the save address option */
  canSaveAddress?: boolean;
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
 * AddressSelector component for checkout page
 * Requirements 6.1: Display saved addresses for selection
 * Requirements 6.2: Pre-select default address
 * Requirements 6.4: Allow entering new address manually
 * Requirements 6.5: Offer option to save new address
 */
export function AddressSelector({
  addresses,
  selectedAddress,
  onSelectAddress,
  onUseNewAddress,
  isLoading = false,
  canSaveAddress = true,
}: AddressSelectorProps) {
  const [useNewAddress, setUseNewAddress] = useState(false);
  const [saveNewAddress, setSaveNewAddress] = useState(false);
  const [newAddressLabel, setNewAddressLabel] = useState<string>('home');
  const [formData, setFormData] = useState<ShippingAddress>({
    fullName: '',
    phone: '',
    address: '',
    ward: '',
    district: '',
    city: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});


  // Pre-select default address on mount (Requirements 6.2)
  useEffect(() => {
    if (addresses.length > 0 && !selectedAddress && !useNewAddress) {
      const defaultAddress = addresses.find(addr => addr.isDefault);
      if (defaultAddress) {
        onSelectAddress(defaultAddress);
      } else {
        // If no default, select the first address
        onSelectAddress(addresses[0]);
      }
    }
  }, [addresses, selectedAddress, useNewAddress, onSelectAddress]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (saveNewAddress && !newAddressLabel) {
      newErrors.label = 'Nhãn địa chỉ là bắt buộc';
    }

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
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleSelectSavedAddress = (address: Address) => {
    setUseNewAddress(false);
    onSelectAddress(address);
  };

  const handleUseNewAddressClick = () => {
    setUseNewAddress(true);
    onSelectAddress(null);
  };

  const handleUseSavedAddressesClick = () => {
    setUseNewAddress(false);
    // Re-select default or first address
    if (addresses.length > 0) {
      const defaultAddress = addresses.find(addr => addr.isDefault);
      onSelectAddress(defaultAddress || addresses[0]);
    }
  };

  const handleSubmitNewAddress = () => {
    if (!validateForm()) return;

    const addressData: CreateAddressRequest | undefined = saveNewAddress
      ? {
          label: newAddressLabel,
          fullName: formData.fullName,
          phone: formData.phone,
          address: formData.address,
          ward: formData.ward,
          district: formData.district,
          city: formData.city,
        }
      : undefined;

    onUseNewAddress(formData, saveNewAddress, addressData);
  };

  const isFormValid = () => {
    return (
      formData.fullName.trim() &&
      /^[0-9]{10,11}$/.test(formData.phone.trim()) &&
      formData.address.trim() &&
      formData.ward.trim() &&
      formData.district.trim() &&
      formData.city.trim() &&
      (!saveNewAddress || newAddressLabel)
    );
  };

  // Check if user can save more addresses
  const canSaveMoreAddresses = canSaveAddress && addresses.length < MAX_ADDRESSES;


  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Địa chỉ giao hàng
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Saved addresses list */}
        {!useNewAddress && addresses.length > 0 && (
          <>
            <div className="space-y-3">
              {addresses.map((address) => (
                <AddressCard
                  key={address.id}
                  address={address}
                  selectable
                  selected={selectedAddress?.id === address.id}
                  onSelect={handleSelectSavedAddress}
                />
              ))}
            </div>

            {/* Use new address button */}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleUseNewAddressClick}
              disabled={isLoading}
            >
              <Plus className="h-4 w-4 mr-2" />
              Sử dụng địa chỉ khác
            </Button>
          </>
        )}

        {/* New address form */}
        {(useNewAddress || addresses.length === 0) && (
          <div className="space-y-4">
            {addresses.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleUseSavedAddressesClick}
                disabled={isLoading}
              >
                ← Quay lại địa chỉ đã lưu
              </Button>
            )}

            {/* Save address checkbox and label */}
            {canSaveMoreAddresses && (
              <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveNewAddress}
                    onChange={(e) => setSaveNewAddress(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                    disabled={isLoading}
                  />
                  <span className="text-sm">Lưu địa chỉ này cho lần sau</span>
                </label>

                {saveNewAddress && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Nhãn địa chỉ <span className="text-destructive">*</span>
                    </label>
                    <Select
                      value={newAddressLabel}
                      onValueChange={setNewAddressLabel}
                      disabled={isLoading}
                    >
                      <SelectTrigger>
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
                )}
              </div>
            )}

            {/* Address form fields */}
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="selector-fullName" className="text-sm font-medium">
                  Họ và tên <span className="text-destructive">*</span>
                </label>
                <Input
                  id="selector-fullName"
                  type="text"
                  placeholder="Nguyễn Văn A"
                  value={formData.fullName}
                  onChange={handleChange('fullName')}
                  aria-invalid={!!errors.fullName}
                  disabled={isLoading}
                />
                {errors.fullName && (
                  <p className="text-sm text-destructive">{errors.fullName}</p>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="selector-phone" className="text-sm font-medium">
                  Số điện thoại <span className="text-destructive">*</span>
                </label>
                <Input
                  id="selector-phone"
                  type="tel"
                  placeholder="0901234567"
                  value={formData.phone}
                  onChange={handleChange('phone')}
                  aria-invalid={!!errors.phone}
                  disabled={isLoading}
                />
                {errors.phone && (
                  <p className="text-sm text-destructive">{errors.phone}</p>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="selector-address" className="text-sm font-medium">
                  Địa chỉ <span className="text-destructive">*</span>
                </label>
                <Input
                  id="selector-address"
                  type="text"
                  placeholder="Số nhà, tên đường"
                  value={formData.address}
                  onChange={handleChange('address')}
                  aria-invalid={!!errors.address}
                  disabled={isLoading}
                />
                {errors.address && (
                  <p className="text-sm text-destructive">{errors.address}</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label htmlFor="selector-ward" className="text-sm font-medium">
                    Phường/Xã <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="selector-ward"
                    type="text"
                    placeholder="Phường 1"
                    value={formData.ward}
                    onChange={handleChange('ward')}
                    aria-invalid={!!errors.ward}
                    disabled={isLoading}
                  />
                  {errors.ward && (
                    <p className="text-sm text-destructive">{errors.ward}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="selector-district" className="text-sm font-medium">
                    Quận/Huyện <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="selector-district"
                    type="text"
                    placeholder="Quận 1"
                    value={formData.district}
                    onChange={handleChange('district')}
                    aria-invalid={!!errors.district}
                    disabled={isLoading}
                  />
                  {errors.district && (
                    <p className="text-sm text-destructive">{errors.district}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="selector-city" className="text-sm font-medium">
                    Tỉnh/Thành phố <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="selector-city"
                    type="text"
                    placeholder="TP. Hồ Chí Minh"
                    value={formData.city}
                    onChange={handleChange('city')}
                    aria-invalid={!!errors.city}
                    disabled={isLoading}
                  />
                  {errors.city && (
                    <p className="text-sm text-destructive">{errors.city}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Submit button for new address */}
            <Button
              type="button"
              className="w-full"
              onClick={handleSubmitNewAddress}
              disabled={isLoading || !isFormValid()}
            >
              {isLoading ? 'Đang xử lý...' : 'Sử dụng địa chỉ này'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default AddressSelector;
