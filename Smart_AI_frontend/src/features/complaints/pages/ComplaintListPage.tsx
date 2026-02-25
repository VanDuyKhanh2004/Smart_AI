import { useState, useCallback } from "react";
import { ComplaintStats } from "../components/ComplaintStats";
import { ComplaintFilters } from "../components/ComplaintFilters";
import { ComplaintTable } from "../components/ComplaintTable";
import { ComplaintDetailDialog } from "../components/ComplaintDetailDialog";
import {
  useComplaints,
  useComplaintStats,
  useUpdateComplaint,
} from "../hooks/useComplaints";
import type {
  Complaint,
  ComplaintFilters as FiltersType,
  ComplaintStatus,
} from "@/types/complaint.type";
import type { Pagination } from "@/types/api.type";

const DEFAULT_PAGINATION: Pagination = {
  currentPage: 1,
  totalPages: 1,
  totalCount: 0,
  limit: 10,
  hasNextPage: false,
  hasPrevPage: false,
  nextPage: null,
  prevPage: null,
};

export function ComplaintListPage() {
  // Filter state
  const [filters, setFilters] = useState<FiltersType>({});
  const [page, setPage] = useState(1);

  // Selected complaint for detail dialog
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Fetch complaints with filters and pagination
  const {
    data: complaintsData,
    isLoading: isLoadingComplaints,
    isError: isComplaintsError,
  } = useComplaints({
    page,
    limit: 10,
    status: filters.status,
    priority: filters.priority,
    search: filters.search,
  });

  // Fetch complaint statistics
  const { data: statsData, isLoading: isLoadingStats } = useComplaintStats();


  // Mutation for updating complaints
  const updateComplaint = useUpdateComplaint();

  // Handle filter changes
  const handleFilterChange = useCallback((newFilters: FiltersType) => {
    setFilters(newFilters);
    setPage(1); // Reset to first page when filters change
  }, []);

  // Handle search
  const handleSearch = useCallback((query: string) => {
    setFilters((prev) => ({ ...prev, search: query || undefined }));
    setPage(1); // Reset to first page when search changes
  }, []);

  // Handle clear filters
  const handleClearFilters = useCallback(() => {
    setFilters({});
    setPage(1);
  }, []);

  // Handle page change
  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  // Handle row click to open detail dialog
  const handleRowClick = useCallback((complaint: Complaint) => {
    setSelectedComplaint(complaint);
    setIsDialogOpen(true);
  }, []);

  // Handle dialog close
  const handleDialogClose = useCallback(() => {
    setIsDialogOpen(false);
    setSelectedComplaint(null);
  }, []);

  // Handle status update
  const handleUpdateStatus = useCallback(
    (id: string, status: ComplaintStatus) => {
      updateComplaint.mutate(
        { id, data: { status } },
        {
          onSuccess: () => {
            // Close dialog after successful update
            setIsDialogOpen(false);
            setSelectedComplaint(null);
          },
        }
      );
    },
    [updateComplaint]
  );

  // Handle resolution notes update
  const handleUpdateNotes = useCallback(
    (id: string, resolutionNotes: string) => {
      updateComplaint.mutate(
        { id, data: { resolutionNotes } },
        {
          onSuccess: () => {
            // Close dialog after successful update
            setIsDialogOpen(false);
            setSelectedComplaint(null);
          },
        }
      );
    },
    [updateComplaint]
  );

  // Extract data from responses
  const complaints = complaintsData?.data?.complaints ?? [];
  const pagination = complaintsData?.data?.pagination ?? DEFAULT_PAGINATION;
  const stats = statsData?.data ?? null;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Complaint Management</h1>
      </div>

      {/* Statistics Cards */}
      <ComplaintStats stats={stats} isLoading={isLoadingStats} />

      {/* Filters */}
      <ComplaintFilters
        filters={filters}
        onFilterChange={handleFilterChange}
        onSearch={handleSearch}
        onClearFilters={handleClearFilters}
      />

      {/* Error State */}
      {isComplaintsError && (
        <div className="text-center py-8 text-destructive">
          Failed to load complaints. Please try again.
        </div>
      )}

      {/* Complaints Table */}
      <ComplaintTable
        complaints={complaints}
        isLoading={isLoadingComplaints}
        pagination={pagination}
        onPageChange={handlePageChange}
        onRowClick={handleRowClick}
      />

      {/* Detail Dialog */}
      <ComplaintDetailDialog
        complaint={selectedComplaint}
        isOpen={isDialogOpen}
        onClose={handleDialogClose}
        onUpdateStatus={handleUpdateStatus}
        onUpdateNotes={handleUpdateNotes}
      />
    </div>
  );
}
