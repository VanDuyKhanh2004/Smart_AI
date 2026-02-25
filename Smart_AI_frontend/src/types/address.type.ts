export interface Address {
  id: string;
  label: string;
  fullName: string;
  phone: string;
  address: string;
  ward: string;
  district: string;
  city: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAddressRequest {
  label: string;
  fullName: string;
  phone: string;
  address: string;
  ward: string;
  district: string;
  city: string;
}

export interface UpdateAddressRequest extends CreateAddressRequest {}

export interface AddressResponse {
  success: boolean;
  message: string;
  data: Address;
}

export interface AddressListResponse {
  success: boolean;
  data: Address[];
}

export const ADDRESS_LABELS = [
  { value: 'home', label: 'Nhà riêng' },
  { value: 'office', label: 'Văn phòng' },
  { value: 'other', label: 'Khác' },
] as const;

export type AddressLabelValue = typeof ADDRESS_LABELS[number]['value'];

export const MAX_ADDRESSES = 5;
