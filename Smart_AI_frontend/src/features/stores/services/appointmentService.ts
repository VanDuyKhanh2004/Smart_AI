import apiClient from '@/lib/axios';
import type {
  GetAvailableSlotsResponse,
  CreateAppointmentRequest,
  AppointmentResponse,
  AppointmentPurpose,
  GetAppointmentsResponse,
  GetAppointmentsParams,
  UpdateAppointmentStatusRequest,
} from '../types';

export const appointmentService = {
  /**
   * Get available time slots for a store on a specific date
   * @param purpose Optional appointment purpose; slots are generated with the
   * matching duration (backend is the source of truth).
   */
  getAvailableSlots: async (storeId: string, date: string, purpose?: AppointmentPurpose): Promise<GetAvailableSlotsResponse> => {
    const response = await apiClient.get<GetAvailableSlotsResponse>(
      `/appointments/available-slots/${storeId}/${date}`,
      { params: purpose ? { purpose } : {} }
    );
    return response.data;
  },

  /**
   * Create new appointment (guest or logged-in user)
   */
  createAppointment: async (data: CreateAppointmentRequest): Promise<AppointmentResponse> => {
    const response = await apiClient.post<AppointmentResponse>('/appointments', data);
    return response.data;
  },

  /**
   * Get current user's appointments
   */
  getMyAppointments: async (): Promise<GetAppointmentsResponse> => {
    const response = await apiClient.get<GetAppointmentsResponse>('/appointments/my');
    return response.data;
  },

  /**
   * Cancel user's appointment
   */
  cancelAppointment: async (id: string): Promise<AppointmentResponse> => {
    const response = await apiClient.patch<AppointmentResponse>(`/appointments/${id}/cancel`);
    return response.data;
  },

  // Admin methods

  /**
   * Get all appointments with filters (Admin only)
   */
  getAllAppointments: async (params?: GetAppointmentsParams): Promise<GetAppointmentsResponse> => {
    const response = await apiClient.get<GetAppointmentsResponse>('/appointments/admin/all', {
      params: {
        ...(params?.store && { store: params.store }),
        ...(params?.status && { status: params.status }),
        ...(params?.startDate && { startDate: params.startDate }),
        ...(params?.endDate && { endDate: params.endDate }),
      },
    });
    return response.data;
  },

  /**
   * Get appointments by store (Admin only)
   */
  getAppointmentsByStore: async (storeId: string): Promise<GetAppointmentsResponse> => {
    const response = await apiClient.get<GetAppointmentsResponse>(`/appointments/admin/store/${storeId}`);
    return response.data;
  },

  /**
   * Update appointment status (Admin only)
   */
  updateAppointmentStatus: async (
    id: string,
    data: UpdateAppointmentStatusRequest
  ): Promise<AppointmentResponse> => {
    const response = await apiClient.patch<AppointmentResponse>(`/appointments/admin/${id}/status`, data);
    return response.data;
  },
};

export const {
  getAvailableSlots,
  createAppointment,
  getMyAppointments,
  cancelAppointment,
  getAllAppointments,
  getAppointmentsByStore,
  updateAppointmentStatus,
} = appointmentService;
