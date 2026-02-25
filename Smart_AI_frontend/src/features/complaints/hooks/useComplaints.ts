import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { complaintService } from '@/services/complaint.service';
import type {
  GetComplaintsParams,
  UpdateComplaintRequest,
} from '@/types/complaint.type';

// Query keys for cache management
export const complaintKeys = {
  all: ['complaints'] as const,
  lists: () => [...complaintKeys.all, 'list'] as const,
  list: (params: GetComplaintsParams) => [...complaintKeys.lists(), params] as const,
  details: () => [...complaintKeys.all, 'detail'] as const,
  detail: (id: string) => [...complaintKeys.details(), id] as const,
  stats: () => [...complaintKeys.all, 'stats'] as const,
};

/**
 * Hook for fetching paginated complaints list with filters
 * Requirements: 1.1, 1.4, 1.5
 */
export function useComplaints(params: GetComplaintsParams = {}) {
  return useQuery({
    queryKey: complaintKeys.list(params),
    queryFn: () => complaintService.getComplaints(params),
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook for fetching complaint statistics
 * Requirements: 6.1
 */
export function useComplaintStats() {
  return useQuery({
    queryKey: complaintKeys.stats(),
    queryFn: () => complaintService.getComplaintStats(),
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook for fetching a single complaint by ID
 */
export function useComplaint(id: string) {
  return useQuery({
    queryKey: complaintKeys.detail(id),
    queryFn: () => complaintService.getComplaintById(id),
    enabled: !!id,
  });
}

/**
 * Hook for updating a complaint
 * Requirements: 5.1, 5.3
 */
export function useUpdateComplaint() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateComplaintRequest }) =>
      complaintService.updateComplaint(id, data),
    onSuccess: (response, { id }) => {
      // Update the specific complaint in cache
      queryClient.setQueryData(complaintKeys.detail(id), response);
      
      // Invalidate lists to refetch with updated data
      queryClient.invalidateQueries({ queryKey: complaintKeys.lists() });
      
      // Invalidate stats as status changes affect statistics
      queryClient.invalidateQueries({ queryKey: complaintKeys.stats() });
    },
    onError: (error) => {
      console.error('Failed to update complaint:', error);
    },
  });
}

// Type exports for consumers
export type UseComplaintsReturn = ReturnType<typeof useComplaints>;
export type UseComplaintStatsReturn = ReturnType<typeof useComplaintStats>;
export type UseComplaintReturn = ReturnType<typeof useComplaint>;
export type UseUpdateComplaintReturn = ReturnType<typeof useUpdateComplaint>;
