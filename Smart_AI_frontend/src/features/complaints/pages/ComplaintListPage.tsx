import { useState, useCallback } from "react";
import { ComplaintStats } from "../components/ComplaintStats";
import { ComplaintFilters } from "../components/ComplaintFilters";
import { ComplaintTable } from "../components/ComplaintTable";
import { ComplaintDetailDialog } from "../components/ComplaintDetailDialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
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
    refetch: refetchComplaints,
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

  // Surface mutation failure (ERR-04): API message when safe, else VI fallback
  const mutationErrorMessage =
    updateComplaint.isError && updateComplaint.error
      ? ((updateComplaint.error as { response?: { data?: { message?: string } } })
          .response?.data?.message ??
        (updateComplaint.error instanceof Error && updateComplaint.error.message) ??
        "Không thể cập nhật khiếu nại. Vui lòng thử lại.")
      : null;

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
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Complaint Management</h1>
      </div>

      {/* Statistics Cards */}
      <ComplaintStats stats={stats} isLoading={isLoadingStats} />

      {/* Mutation error (ERR-04) — page-level copy, also passed to the dialog so
          the message is readable above the overlay while it is open (H03) */}
      {updateComplaint.isError && mutationErrorMessage && (
        <Alert variant="destructive" role="alert">
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertTitle>Không thể cập nhật khiếu nại</AlertTitle>
          <AlertDescription>{mutationErrorMessage}</AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <ComplaintFilters
        filters={filters}
        onFilterChange={handleFilterChange}
        onSearch={handleSearch}
        onClearFilters={handleClearFilters}
      />

      {/* Error State — query failure, kept separate from the mutation Alert
          above and from the table's "no data" state (H15) */}
      {isComplaintsError && (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-destructive">
            Failed to load complaints. Please try again.
          </p>
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => refetchComplaints()}
            >
              Thử lại
            </Button>
          </div>
        </div>
      )}

      {/* Complaints Table */}
      <ComplaintTable
        complaints={complaints}
        isLoading={isLoadingComplaints}
        isError={isComplaintsError}
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
        saveError={
          updateComplaint.isError && mutationErrorMessage ? mutationErrorMessage : null
        }
        isSaving={updateComplaint.isPending}
      />
    </div>
  );
}
