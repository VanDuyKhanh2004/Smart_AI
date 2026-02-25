import { Phone, Mail, MapPin, Clock, Navigation, Calendar } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDistance } from '../utils/distance';
import type { StoreWithDistance, BusinessHours } from '../types';

interface StoreDetailModalProps {
  store: StoreWithDistance | null;
  isOpen: boolean;
  onClose: () => void;
  onBookAppointment: (store: StoreWithDistance) => void;
}

const DAY_NAMES: Record<keyof BusinessHours, string> = {
  monday: 'Thứ Hai',
  tuesday: 'Thứ Ba',
  wednesday: 'Thứ Tư',
  thursday: 'Thứ Năm',
  friday: 'Thứ Sáu',
  saturday: 'Thứ Bảy',
  sunday: 'Chủ Nhật',
};

const DAY_ORDER: (keyof BusinessHours)[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

function getCurrentDayKey(): keyof BusinessHours {
  const days: (keyof BusinessHours)[] = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ];
  return days[new Date().getDay()];
}

export function StoreDetailModal({
  store,
  isOpen,
  onClose,
  onBookAppointment,
}: StoreDetailModalProps) {
  if (!store) return null;

  const currentDay = getCurrentDayKey();

  // Generate Google Maps directions URL
  const getDirectionsUrl = () => {
    const [lng, lat] = store.location.coordinates;
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">{store.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status and Distance */}
          <div className="flex items-center gap-3 flex-wrap">
            <Badge
              variant={store.isOpen ? 'default' : 'destructive'}
              className={store.isOpen ? 'bg-green-600 hover:bg-green-600' : ''}
            >
              <Clock className="h-3 w-3 mr-1" />
              {store.isOpen ? 'Đang mở cửa' : 'Đã đóng cửa'}
            </Badge>
            {store.distance !== undefined && (
              <Badge variant="secondary">
                <Navigation className="h-3 w-3 mr-1" />
                {formatDistance(store.distance)}
              </Badge>
            )}
          </div>

          {/* Address */}
          <div className="flex items-start gap-3">
            <MapPin className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Địa chỉ</p>
              <p className="text-muted-foreground">{store.address.fullAddress}</p>
            </div>
          </div>

          {/* Phone */}
          <div className="flex items-start gap-3">
            <Phone className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Số điện thoại</p>
              <a
                href={`tel:${store.phone}`}
                className="text-primary hover:underline"
              >
                {store.phone}
              </a>
            </div>
          </div>

          {/* Email */}
          {store.email && (
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Email</p>
                <a
                  href={`mailto:${store.email}`}
                  className="text-primary hover:underline"
                >
                  {store.email}
                </a>
              </div>
            </div>
          )}

          {/* Business Hours */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <p className="font-medium">Giờ mở cửa</p>
            </div>
            <div className="bg-muted/50 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {DAY_ORDER.map((day) => {
                    const hours = store.businessHours[day];
                    const isToday = day === currentDay;
                    return (
                      <tr
                        key={day}
                        className={`border-b last:border-b-0 ${
                          isToday ? 'bg-primary/10 font-medium' : ''
                        }`}
                      >
                        <td className="px-4 py-2">
                          {DAY_NAMES[day]}
                          {isToday && (
                            <span className="ml-2 text-xs text-primary">(Hôm nay)</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {hours.isClosed ? (
                            <span className="text-destructive">Đóng cửa</span>
                          ) : (
                            <span>
                              {hours.open} - {hours.close}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Description */}
          {store.description && (
            <div>
              <p className="font-medium mb-2">Mô tả</p>
              <p className="text-muted-foreground text-sm">{store.description}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
            <Button
              variant="outline"
              className="flex-1"
              asChild
            >
              <a href={`tel:${store.phone}`}>
                <Phone className="h-4 w-4 mr-2" />
                Gọi ngay
              </a>
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              asChild
            >
              <a href={getDirectionsUrl()} target="_blank" rel="noopener noreferrer">
                <Navigation className="h-4 w-4 mr-2" />
                Chỉ đường
              </a>
            </Button>
            <Button
              className="flex-1"
              onClick={() => onBookAppointment(store)}
            >
              <Calendar className="h-4 w-4 mr-2" />
              Đặt lịch hẹn
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default StoreDetailModal;
