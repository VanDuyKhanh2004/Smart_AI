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
import type { ComplaintStatus, ComplaintPriority, ComplaintFilters as FiltersType } from "@/types/complaint.type";
import { X, Search } from "lucide-react";

interface ComplaintFiltersProps {
  filters: FiltersType;
  onFilterChange: (filters: FiltersType) => void;
  onSearch: (query: string) => void;
  onClearFilters: () => void;
}

const statusOptions: { value: ComplaintStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const priorityOptions: { value: ComplaintPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export function ComplaintFilters({
  filters,
  onFilterChange,
  onSearch,
  onClearFilters,
}: ComplaintFiltersProps) {
  const [searchValue, setSearchValue] = useState(filters.search ?? "");

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(searchValue);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchValue, onSearch]);

  const handleStatusChange = useCallback((value: string) => {
    const newStatus = value === "all" ? undefined : (value as ComplaintStatus);
    onFilterChange({ ...filters, status: newStatus });
  }, [filters, onFilterChange]);

  const handlePriorityChange = useCallback((value: string) => {
    const newPriority = value === "all" ? undefined : (value as ComplaintPriority);
    onFilterChange({ ...filters, priority: newPriority });
  }, [filters, onFilterChange]);


  const handleClearFilters = useCallback(() => {
    setSearchValue("");
    onClearFilters();
  }, [onClearFilters]);

  const hasActiveFilters = filters.status || filters.priority || searchValue;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search complaints..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Select
          value={filters.status ?? "all"}
          onValueChange={handleStatusChange}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {statusOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.priority ?? "all"}
          onValueChange={handlePriorityChange}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            {priorityOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            className="h-9 px-2"
          >
            <X className="h-4 w-4" />
            <span className="ml-1">Clear</span>
          </Button>
        )}
      </div>
    </div>
  );
}
