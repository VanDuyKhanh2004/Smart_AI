import { MapPin, Clock, Phone } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDistance } from '../utils/distance';
import type { StoreWithDistance } from '../types';

interface StoreCardProps {
  store: StoreWithDistance;
  isSelected?: boolean;
  onSelect: (store: StoreWithDistance) => void;
  onViewDetails: (store: StoreWithDistance) => void;
}

export function StoreCard({
  store,
  isSelected = false,
  onSelect,
  onViewDetails,
}: StoreCardProps) {
  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md ${
        isSelected ? 'ring-2 ring-primary border-primary' : ''
      }`}
      onClick={() => onSelect(store)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Store name */}
            <h3 className="font-semibold text-base truncate">{store.name}</h3>
            
            {/* Address */}
            <div className="flex items-start gap-1.5 mt-2 text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
              <p className="text-sm line-clamp-2">{store.address.fullAddress}</p>
            </div>
            
            {/* Phone */}
            <div className="flex items-center gap-1.5 mt-1.5 text-muted-foreground">
              <Phone className="h-4 w-4 shrink-0" />
              <p className="text-sm">{store.phone}</p>
            </div>
          </div>
          
          {/* Distance badge */}
          {store.distance !== undefined && (
            <Badge variant="secondary" className="shrink-0">
              {formatDistance(store.distance)}
            </Badge>
          )}
        </div>
        
        {/* Status and action */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <Badge
              variant={store.isOpen ? 'default' : 'destructive'}
              className={store.isOpen ? 'bg-green-600 hover:bg-green-600' : ''}
            >
              {store.isOpen ? 'Đang mở cửa' : 'Đã đóng cửa'}
            </Badge>
          </div>
          
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails(store);
            }}
          >
            Xem chi tiết
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default StoreCard;
