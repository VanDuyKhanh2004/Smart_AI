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
import { Search, X, Check } from 'lucide-react';

interface ProductFiltersProps {
  draftFilters: ProductFilterState;
  onDraftFilterChange: (filters: ProductFilterState) => void;
  onApplyFilters: () => void;
  onClearFilters: () => void;
  onSearchChange: (search: string) => void;
  currentSearch: string;
  brands: string[];
  isLoading?: boolean;
}

export function ProductFilters({
  draftFilters,
  onDraftFilterChange,
  onApplyFilters,
  onClearFilters,
  onSearchChange,
  currentSearch,
  brands,
  isLoading = false,
}: ProductFiltersProps) {
  const [searchInput, setSearchInput] = useState(currentSearch || '');

  // Debounce search — 300ms delay, directly applies search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== currentSearch) {
        onSearchChange(searchInput.trim());
      }
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // Sync search input when currentSearch changes externally (reset, apply, pagination)
  useEffect(() => {
    if (currentSearch !== searchInput) {
      setSearchInput(currentSearch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSearch]);

  // Non-search handlers — only update draftFilters, NO API call
  const handleBrandChange = (value: string) => {
    onDraftFilterChange({
      ...draftFilters,
      brand: value === 'all' ? undefined : value,
    });
  };

  const handleMinPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const numValue = value === '' ? undefined : Math.max(0, Number(value));
    onDraftFilterChange({ ...draftFilters, minPrice: numValue });
  };

  const handleMaxPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const numValue = value === '' ? undefined : Math.max(0, Number(value));
    onDraftFilterChange({ ...draftFilters, maxPrice: numValue });
  };

  const handleStockChange = (value: string) => {
    onDraftFilterChange({
      ...draftFilters,
      inStock: value as 'all' | 'true' | 'false',
    });
  };

  const handleRatingChange = (value: string) => {
    onDraftFilterChange({
      ...draftFilters,
      minRating: value === 'all' ? undefined : Number(value),
    });
  };

  const handleSortChange = (value: string) => {
    const [sortBy, sortOrder] = value.split('-') as [
      'price' | 'name' | 'createdAt',
      'asc' | 'desc'
    ];
    onDraftFilterChange({ ...draftFilters, sortBy, sortOrder });
  };

  // Check if draft differs from default (show Reset button)
  const isAnyDraftActive =
    draftFilters.brand !== undefined ||
    draftFilters.minPrice !== undefined ||
    draftFilters.maxPrice !== undefined ||
    draftFilters.inStock !== 'all' ||
    (searchInput && searchInput.trim() !== '') ||
    draftFilters.sortBy !== DEFAULT_FILTER_STATE.sortBy ||
    draftFilters.sortOrder !== DEFAULT_FILTER_STATE.sortOrder ||
    draftFilters.minRating !== undefined;

  const currentSortValue = `${draftFilters.sortBy || 'createdAt'}-${draftFilters.sortOrder || 'desc'}`;

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
          />
        </div>
      </div>


      {/* Brand Filter */}
      <div className="flex flex-col gap-1.5 min-w-[150px]">
        <label className="text-sm font-medium text-muted-foreground">
          Thương hiệu
        </label>
        <Select
          value={draftFilters.brand || 'all'}
          onValueChange={handleBrandChange}
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
            value={draftFilters.minPrice ?? ''}
            onChange={handleMinPriceChange}
            className="w-[100px]"
            min={0}
          />
          <span className="text-muted-foreground">-</span>
          <Input
            type="number"
            placeholder="Đến"
            value={draftFilters.maxPrice ?? ''}
            onChange={handleMaxPriceChange}
            className="w-[100px]"
            min={0}
          />
        </div>
      </div>


      {/* Stock Filter */}
      <div className="flex flex-col gap-1.5 min-w-[130px]">
        <label className="text-sm font-medium text-muted-foreground">
          Tình trạng
        </label>
        <Select
          value={draftFilters.inStock || 'all'}
          onValueChange={handleStockChange}
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
          value={draftFilters.minRating?.toString() || 'all'}
          onValueChange={handleRatingChange}
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

      {/* Apply Filters Button */}
      <Button
        variant="default"
        onClick={onApplyFilters}
        disabled={isLoading}
        className="h-9"
      >
        <Check className="h-4 w-4 mr-1" />
        Áp dụng
      </Button>

      {/* Clear Filters Button */}
      {isAnyDraftActive && (
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
