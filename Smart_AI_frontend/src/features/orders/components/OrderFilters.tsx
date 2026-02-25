import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OrderStatus, OrderFilterState } from "@/types/order.type";
import { X, Search, Calendar } from "lucide-react";

interface OrderFiltersProps {
  filters: OrderFilterState;
  onFilterChange: (filters: OrderFilterState) => void;
  onClearFilters: () => void;
}

const statusOptions: { value: OrderStatus; label: string }[] = [
  { value: "pending", label: "Chờ xác nhận" },
  { value: "confirmed", label: "Đã xác nhận" },
  { value: "processing", label: "Đang xử lý" },
  { value: "shipping", label: "Đang giao" },
  { value: "delivered", label: "Đã giao" },
  { value: "cancelled", label: "Đã hủy" },
];

export function OrderFilters({
  filters,
  onFilterChange,
  onClearFilters,
}: OrderFiltersProps) {
  const [searchValue, setSearchValue] = useState(filters.search ?? "");

  // Debounce search input - only trigger when searchValue changes, not filters
  useEffect(() => {
    const timer = setTimeout(() => {
      // Only call onFilterChange if the search value actually differs
      if (searchValue !== (filters.search ?? "")) {
        onFilterChange({ ...filters, search: searchValue || undefined });
      }
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue]); // Only depend on searchValue to prevent infinite loop

  const handleStatusChange = useCallback((value: string) => {
    const newStatus = value === "all" ? undefined : (value as OrderStatus);
    onFilterChange({ ...filters, status: newStatus });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onFilterChange, filters.status, filters.search, filters.startDate, filters.endDate]);

  const handleStartDateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    onFilterChange({ ...filters, startDate: value || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onFilterChange, filters.status, filters.search, filters.startDate, filters.endDate]);

  const handleEndDateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    onFilterChange({ ...filters, endDate: value || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onFilterChange, filters.status, filters.search, filters.startDate, filters.endDate]);


  const handleClearFilters = useCallback(() => {
    setSearchValue("");
    onClearFilters();
  }, [onClearFilters]);

  const hasActiveFilters = filters.status || searchValue || filters.startDate || filters.endDate;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Search input */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Tìm theo mã đơn hoặc tên khách..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status filter */}
          <Select
            value={filters.status ?? "all"}
            onValueChange={handleStatusChange}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả trạng thái</SelectItem>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Clear filters button */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
              className="h-9 px-2"
            >
              <X className="h-4 w-4" />
              <span className="ml-1">Xóa bộ lọc</span>
            </Button>
          )}
        </div>
      </div>

      {/* Date range filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Từ:</span>
          <Input
            type="date"
            value={filters.startDate ?? ""}
            onChange={handleStartDateChange}
            className="w-[160px]"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Đến:</span>
          <Input
            type="date"
            value={filters.endDate ?? ""}
            onChange={handleEndDateChange}
            className="w-[160px]"
          />
        </div>
      </div>
    </div>
  );
}
