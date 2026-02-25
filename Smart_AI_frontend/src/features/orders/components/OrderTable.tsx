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
import { OrderStatusBadge } from "./OrderStatusBadge";
import type { Order } from "@/types/order.type";
import type { Pagination as PaginationType } from "@/types/api.type";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface OrderTableProps {
  orders: Order[];
  pagination: PaginationType;
  onPageChange: (page: number) => void;
  onOrderClick: (order: Order) => void;
  isLoading?: boolean;
}

/**
 * Check if an order is urgent (pending for more than 24 hours)
 * Requirements 6.2: Highlight urgent orders
 */
function isUrgentOrder(order: Order): boolean {
  if (order.status !== "pending") return false;
  
  const createdAt = new Date(order.createdAt);
  const now = new Date();
  const hoursDiff = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
  
  return hoursDiff > 24;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("vi-VN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(amount);
}


export function OrderTable({
  orders,
  pagination,
  onPageChange,
  onOrderClick,
  isLoading,
}: OrderTableProps) {
  const { currentPage, totalPages } = pagination;

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: number[] = [];
    const maxVisible = 5;
    
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    const end = Math.min(totalPages, start + maxVisible - 1);
    
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    
    return pages;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-muted-foreground">Đang tải...</div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-muted-foreground">Không có đơn hàng nào</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mã đơn</TableHead>
            <TableHead>Khách hàng</TableHead>
            <TableHead className="text-right">Tổng tiền</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead>Ngày tạo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => {
            const urgent = isUrgentOrder(order);
            return (
              <TableRow
                key={order.id || order._id}
                className={cn(
                  "cursor-pointer",
                  urgent && "bg-yellow-50 hover:bg-yellow-100"
                )}
                onClick={() => onOrderClick(order)}
              >
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {urgent && (
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    )}
                    {order.orderNumber}
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <div className="font-medium">{order.user?.name ?? "N/A"}</div>
                    <div className="text-sm text-muted-foreground">
                      {order.user?.email ?? ""}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(order.total)}
                </TableCell>
                <TableCell>
                  <OrderStatusBadge status={order.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(order.createdAt)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => currentPage > 1 && onPageChange(currentPage - 1)}
                className={cn(
                  currentPage <= 1 && "pointer-events-none opacity-50"
                )}
              />
            </PaginationItem>
            
            {getPageNumbers().map((pageNum) => (
              <PaginationItem key={pageNum}>
                <PaginationLink
                  isActive={pageNum === currentPage}
                  onClick={() => onPageChange(pageNum)}
                >
                  {pageNum}
                </PaginationLink>
              </PaginationItem>
            ))}
            
            <PaginationItem>
              <PaginationNext
                onClick={() => currentPage < totalPages && onPageChange(currentPage + 1)}
                className={cn(
                  currentPage >= totalPages && "pointer-events-none opacity-50"
                )}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
