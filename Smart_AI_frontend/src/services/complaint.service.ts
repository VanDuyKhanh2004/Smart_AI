import apiClient from '@/lib/axios';
import type {
  GetComplaintsResponse,
  GetComplaintByIdResponse,
  GetComplaintsParams,
  UpdateComplaintRequest,
  UpdateComplaintResponse,
  GetComplaintStatsResponse,
} from '@/types/complaint.type';

export const complaintService = {
  getComplaints: async (params: GetComplaintsParams = {}): Promise<GetComplaintsResponse> => {
    try {
      const response = await apiClient.get<GetComplaintsResponse>('/complaints', {
        params: {
          page: params.page || 1,
          limit: params.limit || 10,
          ...(params.status && { status: params.status }),
          ...(params.priority && { priority: params.priority }),
          ...(params.search && { search: params.search }),
          ...(params.sortBy && { sortBy: params.sortBy }),
          ...(params.sortOrder && { sortOrder: params.sortOrder }),
        },
      });

      return response.data;
    } catch (error) {
      throw new Error(error as string);
    }
  },

  getComplaintById: async (id: string): Promise<GetComplaintByIdResponse> => {
    try {
      const response = await apiClient.get<GetComplaintByIdResponse>(`/complaints/${id}`);
      return response.data;
    } catch (error) {
      throw new Error(error as string);
    }
  },

  updateComplaint: async (id: string, data: UpdateComplaintRequest): Promise<UpdateComplaintResponse> => {
    try {
      const response = await apiClient.put<UpdateComplaintResponse>(`/complaints/${id}`, data);
      return response.data;
    } catch (error) {
      throw new Error(error as string);
    }
  },

  getComplaintStats: async (): Promise<GetComplaintStatsResponse> => {
    try {
      const response = await apiClient.get<GetComplaintStatsResponse>('/complaints/stats');
      return response.data;
    } catch (error) {
      throw new Error(error as string);
    }
  },
};

// Export individual functions for direct use if needed
export const { getComplaints, getComplaintById, updateComplaint, getComplaintStats } = complaintService;
