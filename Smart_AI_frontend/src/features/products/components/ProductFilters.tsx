import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ProductFilterState } from '@/types/product.type';
import { DEFAULT_FILTER_STATE, SORT_OPTIONS } from '@/types/product.type';
import { Search, X } from 'lucide-react';

interface ProductFiltersProps {
  filters: ProductFilterState;
  onFilterChange: (filters: ProductFilterState) => void;
  onClearFilters: () => void;
  brands: string[];
  isLoading?: boolean;
}

export function ProductFilters({
  filters,
  onFilterChange,
  onClearFilters,
  brands,
  isLoading = false,
}: ProductFiltersProps) {
  const [searchInput, setSearchInput] = useState(filters.search || '');

  // Debounce search input - 300ms delay
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.search) {
        onFilterChange({ ...filters, search: searchInput.trim() });
      }
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // Sync searchInput with filters.search when filters change externally
  useEffect(() => {
    if (filters.search !== undefined && filters.search !== searchInput) {
      setSearchInput(filters.search);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search]);

  const handleBrandChange = (value: string) => {
    onFilterChange({
      ...filters,
      brand: value === 'all' ? undefined : value,
    });
  };


  const handleMinPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const numValue = value === '' ? undefined : Math.max(0, Number(value));
    onFilterChange({ ...filters, minPrice: numValue });
  };

  const handleMaxPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const numValue = value === '' ? undefined : Math.max(0, Number(value));
    onFilterChange({ ...filters, maxPrice: numValue });
  };

  const handleStockChange = (value: string) => {
    onFilterChange({
      ...filters,
      inStock: value as 'all' | 'true' | 'false',
    });
  };

  const handleRatingChange = (value: string) => {
    onFilterChange({
      ...filters,
      minRating: value === 'all' ? undefined : Number(value),
    });
  };

  const handleSortChange = (value: string) => {
    const [sortBy, sortOrder] = value.split('-') as [
      'price' | 'name' | 'createdAt',
      'asc' | 'desc'
    ];
    onFilterChange({ ...filters, sortBy, sortOrder });
  };

  // Check if any filter is active (different from default)
  const isAnyFilterActive =
    filters.brand !== undefined ||
    filters.minPrice !== undefined ||
    filters.maxPrice !== undefined ||
    filters.inStock !== 'all' ||
    (filters.search && filters.search.trim() !== '') ||
    filters.sortBy !== DEFAULT_FILTER_STATE.sortBy ||
    filters.sortOrder !== DEFAULT_FILTER_STATE.sortOrder ||
    filters.minRating !== undefined;

  const currentSortValue = `${filters.sortBy || 'createdAt'}-${filters.sortOrder || 'desc'}`;

  return (
    <div className="flex flex-wrap items-end gap-4 p-4 bg-card rounded-lg border mb-6">
      {/* Search Input */}
      <div className="flex flex-col gap-1.5 min-w-[200px] flex-1">
        <label className="text-sm font-medium text-muted-foreground">
          Tìm kiếm
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Tìm kiếm sản phẩm..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
            disabled={isLoading}
          />
        </div>
      </div>


      {/* Brand Filter */}
      <div className="flex flex-col gap-1.5 min-w-[150px]">
        <label className="text-sm font-medium text-muted-foreground">
          Thương hiệu
        </label>
        <Select
          value={filters.brand || 'all'}
          onValueChange={handleBrandChange}
          disabled={isLoading}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Tất cả" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả</SelectItem>
            {brands.map((brand) => (
              <SelectItem key={brand} value={brand}>
                {brand}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Price Range */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-muted-foreground">
          Khoảng giá
        </label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            placeholder="Từ"
            value={filters.minPrice ?? ''}
            onChange={handleMinPriceChange}
            className="w-[100px]"
            min={0}
            disabled={isLoading}
          />
          <span className="text-muted-foreground">-</span>
          <Input
            type="number"
            placeholder="Đến"
            value={filters.maxPrice ?? ''}
            onChange={handleMaxPriceChange}
            className="w-[100px]"
            min={0}
            disabled={isLoading}
          />
        </div>
      </div>


      {/* Stock Filter */}
      <div className="flex flex-col gap-1.5 min-w-[130px]">
        <label className="text-sm font-medium text-muted-foreground">
          Tình trạng
        </label>
        <Select
          value={filters.inStock || 'all'}
          onValueChange={handleStockChange}
          disabled={isLoading}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Tất cả" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả</SelectItem>
            <SelectItem value="true">Còn hàng</SelectItem>
            <SelectItem value="false">Hết hàng</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Rating Filter */}
      <div className="flex flex-col gap-1.5 min-w-[130px]">
        <label className="text-sm font-medium text-muted-foreground">
          Đánh giá
        </label>
        <Select
          value={filters.minRating?.toString() || 'all'}
          onValueChange={handleRatingChange}
          disabled={isLoading}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Tất cả" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả</SelectItem>
            <SelectItem value="4">4+ sao</SelectItem>
            <SelectItem value="3">3+ sao</SelectItem>
            <SelectItem value="2">2+ sao</SelectItem>
            <SelectItem value="1">1+ sao</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Sort Options */}
      <div className="flex flex-col gap-1.5 min-w-[180px]">
        <label className="text-sm font-medium text-muted-foreground">
          Sắp xếp
        </label>
        <Select
          value={currentSortValue}
          onValueChange={handleSortChange}
          disabled={isLoading}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Mới nhất" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Clear Filters Button */}
      {isAnyFilterActive && (
        <Button
          variant="outline"
          onClick={onClearFilters}
          disabled={isLoading}
          className="h-9"
        >
          <X className="h-4 w-4 mr-1" />
          Xóa bộ lọc
        </Button>
      )}
    </div>
  );
}
