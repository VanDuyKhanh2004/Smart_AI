import apiClient from '@/lib/axios';
import type {
  AddressResponse,
  AddressListResponse,
  CreateAddressRequest,
  UpdateAddressRequest,
} from '@/types/address.type';

export const addressService = {
  /**
   * Get all addresses for current user
   * Requirements: 1.2
   */
  getAddresses: async (): Promise<AddressListResponse> => {
    const response = await apiClient.get<AddressListResponse>('/addresses');
    return response.data;
  },

  /**
   * Create a new address
   * Requirements: 1.2, 1.3
   */
  createAddress: async (data: CreateAddressRequest): Promise<AddressResponse> => {
    const response = await apiClient.post<AddressResponse>('/addresses', data);
    return response.data;
  },

  /**
   * Update an existing address
   * Requirements: 3.2
   */
  updateAddress: async (id: string, data: UpdateAddressRequest): Promise<AddressResponse> => {
    const response = await apiClient.put<AddressResponse>(`/addresses/${id}`, data);
    return response.data;
  },

  /**
   * Delete an address
   * Requirements: 4.2
   */
  deleteAddress: async (id: string): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.delete<{ success: boolean; message: string }>(`/addresses/${id}`);
    return response.data;
  },

  /**
   * Set an address as default
   * Requirements: 5.1
   */
  setDefaultAddress: async (id: string): Promise<AddressResponse> => {
    const response = await apiClient.put<AddressResponse>(`/addresses/${id}/default`);
    return response.data;
  },
};

// Export individual functions for direct use
export const {
  getAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
} = addressService;
