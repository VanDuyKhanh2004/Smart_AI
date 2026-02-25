import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { ComplaintStatusBadge } from "./ComplaintStatusBadge";
import type { Complaint } from "@/types/complaint.type";
import { getComplaintId } from "@/types/complaint.type";
import type { Pagination as PaginationType } from "@/types/api.type";

interface ComplaintTableProps {
  complaints: Complaint[];
  isLoading: boolean;
  pagination: PaginationType;
  onPageChange: (page: number) => void;
  onRowClick: (complaint: Complaint) => void;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getContactDisplay(complaint: Complaint): string {
  if (complaint.customerContact?.email) {
    return complaint.customerContact.email;
  }
  if (complaint.customerContact?.phone) {
    return complaint.customerContact.phone;
  }
  return "-";
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, index) => (
        <TableRow key={index}>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-48" /></TableCell>
          <TableCell><Skeleton className="h-6 w-20" /></TableCell>
          <TableCell><Skeleton className="h-6 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}


function generatePageNumbers(currentPage: number, totalPages: number): number[] {
  const pages: number[] = [];
  const maxVisiblePages = 5;
  
  if (totalPages <= maxVisiblePages) {
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
  } else {
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
  }
  
  return pages;
}

export function ComplaintTable({
  complaints,
  isLoading,
  pagination,
  onPageChange,
  onRowClick,
}: ComplaintTableProps) {
  const pageNumbers = generatePageNumbers(pagination.currentPage, pagination.totalPages);

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Summary</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Created Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableSkeleton />
          ) : complaints.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                No complaints found
              </TableCell>
            </TableRow>
          ) : (
            complaints.map((complaint) => (
              <TableRow
                key={getComplaintId(complaint)}
                className="cursor-pointer"
                onClick={() => onRowClick(complaint)}
              >
                <TableCell className="font-mono text-xs">
                  {getComplaintId(complaint).slice(0, 8)}...
                </TableCell>
                <TableCell className="max-w-xs truncate">
                  {complaint.complaintSummary || "-"}
                </TableCell>
                <TableCell>
                  <ComplaintStatusBadge type="status" value={complaint.status} />
                </TableCell>
                <TableCell>
                  <ComplaintStatusBadge type="priority" value={complaint.priority} />
                </TableCell>
                <TableCell>{getContactDisplay(complaint)}</TableCell>
                <TableCell>{formatDate(complaint.createdAt)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {!isLoading && pagination.totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => pagination.hasPrevPage && onPageChange(pagination.currentPage - 1)}
                className={!pagination.hasPrevPage ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
            
            {pageNumbers.map((page) => (
              <PaginationItem key={page}>
                <PaginationLink
                  isActive={page === pagination.currentPage}
                  onClick={() => onPageChange(page)}
                  className="cursor-pointer"
                >
                  {page}
                </PaginationLink>
              </PaginationItem>
            ))}
            
            <PaginationItem>
              <PaginationNext
                onClick={() => pagination.hasNextPage && onPageChange(pagination.currentPage + 1)}
                className={!pagination.hasNextPage ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      {!isLoading && (
        <div className="text-sm text-muted-foreground text-center">
          Page {pagination.currentPage} of {pagination.totalPages} ({pagination.totalCount} total complaints)
        </div>
      )}
    </div>
  );
}
