import { useState, useMemo } from 'react';
import { Search, Navigation, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { StoreCard } from './StoreCard';
import type { StoreWithDistance } from '../types';

interface StoreListProps {
  stores: StoreWithDistance[];
  selectedStore: StoreWithDistance | null;
  onStoreSelect: (store: StoreWithDistance) => void;
  onViewDetails: (store: StoreWithDistance) => void;
  onFindNearest: () => void;
  isLoadingLocation?: boolean;
  hasUserLocation?: boolean;
}

export function StoreList({
  stores,
  selectedStore,
  onStoreSelect,
  onViewDetails,
  onFindNearest,
  isLoadingLocation = false,
  hasUserLocation = false,
}: StoreListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter stores by search query
  const filteredStores = useMemo(() => {
    if (!searchQuery.trim()) {
      return stores;
    }
    
    const query = searchQuery.toLowerCase().trim();
    return stores.filter(
      (store) =>
        store.name.toLowerCase().includes(query) ||
        store.address.fullAddress.toLowerCase().includes(query) ||
        store.address.district.toLowerCase().includes(query) ||
        store.address.city.toLowerCase().includes(query)
    );
  }, [stores, searchQuery]);

  return (
    <div className="flex flex-col h-full">
      {/* Header with search and find nearest button */}
      <div className="p-4 border-b space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Tìm kiếm cửa hàng..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <Button
          variant="outline"
          className="w-full"
          onClick={onFindNearest}
          disabled={isLoadingLocation}
        >
          {isLoadingLocation ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang xác định vị trí...
            </>
          ) : (
            <>
              <Navigation className="h-4 w-4" />
              Tìm cửa hàng gần nhất
            </>
          )}
        </Button>
        
        {hasUserLocation && (
          <p className="text-xs text-muted-foreground text-center">
            Danh sách đã được sắp xếp theo khoảng cách
          </p>
        )}
      </div>

      {/* Store list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredStores.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {searchQuery ? (
              <>
                <p>Không tìm thấy cửa hàng nào</p>
                <p className="text-sm mt-1">Thử tìm kiếm với từ khóa khác</p>
              </>
            ) : (
              <p>Chưa có cửa hàng nào</p>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-2">
              {filteredStores.length} cửa hàng
              {searchQuery && ` phù hợp với "${searchQuery}"`}
            </p>
            {filteredStores.map((store) => (
              <StoreCard
                key={store.id}
                store={store}
                isSelected={selectedStore?.id === store.id}
                onSelect={onStoreSelect}
                onViewDetails={onViewDetails}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export default StoreList;
