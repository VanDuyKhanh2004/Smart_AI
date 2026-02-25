import apiClient from '@/lib/axios';
import type {
  Store,
  GetStoresResponse,
  GetStoreByIdResponse,
  CreateStoreRequest,
  UpdateStoreRequest,
  StoreResponse,
  DeleteStoreResponse,
} from '../types';

export const storeService = {
  /**
   * Get all active stores
   */
  getAllStores: async (): Promise<GetStoresResponse> => {
    const response = await apiClient.get<GetStoresResponse>('/stores');
    return response.data;
  },

  /**
   * Get all stores including inactive (Admin only)
   */
  getAllStoresAdmin: async (): Promise<GetStoresResponse> => {
    const response = await apiClient.get<GetStoresResponse>('/stores/admin/all');
    return response.data;
  },

  /**
   * Get store by ID
   */
  getStoreById: async (id: string): Promise<GetStoreByIdResponse> => {
    const response = await apiClient.get<GetStoreByIdResponse>(`/stores/${id}`);
    return response.data;
  },

  /**
   * Create new store (Admin only)
   */
  createStore: async (data: CreateStoreRequest): Promise<StoreResponse> => {
    const response = await apiClient.post<StoreResponse>('/stores', data);
    return response.data;
  },

  /**
   * Update store (Admin only)
   */
  updateStore: async (id: string, data: UpdateStoreRequest): Promise<StoreResponse> => {
    const response = await apiClient.put<StoreResponse>(`/stores/${id}`, data);
    return response.data;
  },

  /**
   * Delete store (Admin only)
   */
  deleteStore: async (id: string): Promise<DeleteStoreResponse> => {
    const response = await apiClient.delete<DeleteStoreResponse>(`/stores/${id}`);
    return response.data;
  },

  /**
   * Toggle store active status (Admin only)
   */
  toggleStoreStatus: async (id: string): Promise<StoreResponse> => {
    const response = await apiClient.patch<StoreResponse>(`/stores/${id}/toggle`);
    return response.data;
  },
};

export const {
  getAllStores,
  getAllStoresAdmin,
  getStoreById,
  createStore,
  updateStore,
  deleteStore,
  toggleStoreStatus,
} = storeService;
