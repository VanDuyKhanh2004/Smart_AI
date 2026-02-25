import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Calendar, Clock, User, Phone, Mail, FileText, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuthStore } from '@/stores/authStore';
import { appointmentService } from '../services/appointmentService';
import type { Store, TimeSlot, AppointmentPurpose, GuestInfo } from '../types';

interface AppointmentFormProps {
  store: Store | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const PURPOSE_OPTIONS: { value: AppointmentPurpose; label: string }[] = [
  { value: 'consultation', label: 'Tư vấn sản phẩm' },
  { value: 'warranty', label: 'Bảo hành' },
  { value: 'purchase', label: 'Mua hàng' },
  { value: 'other', label: 'Khác' },
];

// Get tomorrow's date as minimum date
function getMinDate(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().split('T')[0];
}

// Get max date (30 days from now)
function getMaxDate(): string {
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 30);
  return maxDate.toISOString().split('T')[0];
}


interface FormErrors {
  date?: string;
  timeSlot?: string;
  purpose?: string;
  name?: string;
  phone?: string;
  email?: string;
}

export function AppointmentForm({
  store,
  isOpen,
  onClose,
  onSuccess,
}: AppointmentFormProps) {
  const { user, isAuthenticated } = useAuthStore();
  
  // Form state
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<TimeSlot | null>(null);
  const [purpose, setPurpose] = useState<AppointmentPurpose | ''>('');
  const [notes, setNotes] = useState('');
  const [guestInfo, setGuestInfo] = useState<GuestInfo>({
    name: '',
    phone: '',
    email: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});

  // Pre-fill user info when logged in
  useEffect(() => {
    if (isAuthenticated && user) {
      setGuestInfo({
        name: user.name || '',
        phone: user.phone || '',
        email: user.email || '',
      });
    }
  }, [isAuthenticated, user]);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedDate('');
      setSelectedTimeSlot(null);
      setPurpose('');
      setNotes('');
      setErrors({});
      if (!isAuthenticated) {
        setGuestInfo({ name: '', phone: '', email: '' });
      }
    }
  }, [isOpen, isAuthenticated]);

  // Fetch available time slots when date changes
  const {
    data: slotsResponse,
    isLoading: isLoadingSlots,
    error: slotsError,
  } = useQuery({
    queryKey: ['availableSlots', store?.id, selectedDate],
    queryFn: () => appointmentService.getAvailableSlots(store!.id, selectedDate),
    enabled: !!store?.id && !!selectedDate,
  });

  const availableSlots = slotsResponse?.data?.slots || [];

  // Create appointment mutation
  const createMutation = useMutation({
    mutationFn: appointmentService.createAppointment,
    onSuccess: () => {
      onSuccess();
      onClose();
    },
  });

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!selectedDate) {
      newErrors.date = 'Vui lòng chọn ngày';
    }

    if (!selectedTimeSlot) {
      newErrors.timeSlot = 'Vui lòng chọn khung giờ';
    }

    if (!purpose) {
      newErrors.purpose = 'Vui lòng chọn mục đích';
    }

    // Validate guest info if not logged in
    if (!isAuthenticated) {
      if (!guestInfo.name.trim()) {
        newErrors.name = 'Vui lòng nhập họ tên';
      }

      if (!guestInfo.phone.trim()) {
        newErrors.phone = 'Vui lòng nhập số điện thoại';
      } else if (!/^[0-9]{10,11}$/.test(guestInfo.phone.trim())) {
        newErrors.phone = 'Số điện thoại không hợp lệ (10-11 số)';
      }

      if (!guestInfo.email.trim()) {
        newErrors.email = 'Vui lòng nhập email';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestInfo.email.trim())) {
        newErrors.email = 'Email không hợp lệ';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = () => {
    if (!validateForm() || !store || !selectedTimeSlot || !purpose) return;

    createMutation.mutate({
      store: store.id,
      date: selectedDate,
      timeSlot: selectedTimeSlot,
      purpose: purpose as AppointmentPurpose,
      notes: notes.trim() || undefined,
      guestInfo: isAuthenticated ? undefined : {
        name: guestInfo.name.trim(),
        phone: guestInfo.phone.trim(),
        email: guestInfo.email.trim(),
      },
    });
  };

  if (!store) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Đặt lịch hẹn tại {store.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Date picker */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Ngày hẹn <span className="text-destructive">*</span>
            </label>
            <Input
              type="date"
              min={getMinDate()}
              max={getMaxDate()}
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setSelectedTimeSlot(null);
                setErrors((prev) => ({ ...prev, date: undefined }));
              }}
              className={errors.date ? 'border-destructive' : ''}
            />
            {errors.date && (
              <p className="text-sm text-destructive">{errors.date}</p>
            )}
          </div>

          {/* Time slot selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Khung giờ <span className="text-destructive">*</span>
            </label>
            {!selectedDate ? (
              <p className="text-sm text-muted-foreground">
                Vui lòng chọn ngày trước
              </p>
            ) : isLoadingSlots ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang tải khung giờ...
              </div>
            ) : slotsError ? (
              <p className="text-sm text-destructive">
                Không thể tải khung giờ. Vui lòng thử lại.
              </p>
            ) : availableSlots.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Không có khung giờ trống trong ngày này
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {availableSlots.map((slot: TimeSlot) => (
                  <Button
                    key={`${slot.start}-${slot.end}`}
                    type="button"
                    variant={
                      selectedTimeSlot?.start === slot.start
                        ? 'default'
                        : 'outline'
                    }
                    size="sm"
                    onClick={() => {
                      setSelectedTimeSlot(slot);
                      setErrors((prev) => ({ ...prev, timeSlot: undefined }));
                    }}
                  >
                    {slot.start}
                  </Button>
                ))}
              </div>
            )}
            {errors.timeSlot && (
              <p className="text-sm text-destructive">{errors.timeSlot}</p>
            )}
          </div>

          {/* Purpose dropdown */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Mục đích <span className="text-destructive">*</span>
            </label>
            <Select
              value={purpose}
              onValueChange={(value) => {
                setPurpose(value as AppointmentPurpose);
                setErrors((prev) => ({ ...prev, purpose: undefined }));
              }}
            >
              <SelectTrigger className={`w-full ${errors.purpose ? 'border-destructive' : ''}`}>
                <SelectValue placeholder="Chọn mục đích" />
              </SelectTrigger>
              <SelectContent>
                {PURPOSE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.purpose && (
              <p className="text-sm text-destructive">{errors.purpose}</p>
            )}
          </div>

          {/* Guest info fields (only show when not logged in) */}
          {!isAuthenticated && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Họ tên <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder="Nhập họ tên"
                  value={guestInfo.name}
                  onChange={(e) => {
                    setGuestInfo((prev) => ({ ...prev, name: e.target.value }));
                    setErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                  className={errors.name ? 'border-destructive' : ''}
                />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Số điện thoại <span className="text-destructive">*</span>
                </label>
                <Input
                  type="tel"
                  placeholder="Nhập số điện thoại"
                  value={guestInfo.phone}
                  onChange={(e) => {
                    setGuestInfo((prev) => ({ ...prev, phone: e.target.value }));
                    setErrors((prev) => ({ ...prev, phone: undefined }));
                  }}
                  className={errors.phone ? 'border-destructive' : ''}
                />
                {errors.phone && (
                  <p className="text-sm text-destructive">{errors.phone}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email <span className="text-destructive">*</span>
                </label>
                <Input
                  type="email"
                  placeholder="Nhập email"
                  value={guestInfo.email}
                  onChange={(e) => {
                    setGuestInfo((prev) => ({ ...prev, email: e.target.value }));
                    setErrors((prev) => ({ ...prev, email: undefined }));
                  }}
                  className={errors.email ? 'border-destructive' : ''}
                />
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email}</p>
                )}
              </div>
            </>
          )}

          {/* Pre-filled user info display (when logged in) */}
          {isAuthenticated && user && (
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium">Thông tin liên hệ</p>
              <div className="text-sm text-muted-foreground space-y-1">
                <p className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  {user.name}
                </p>
                {user.phone && (
                  <p className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    {user.phone}
                  </p>
                )}
                <p className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  {user.email}
                </p>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Ghi chú (tùy chọn)</label>
            <Textarea
              placeholder="Nhập ghi chú nếu có..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Error message from API */}
          {createMutation.error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm text-destructive">
                {(createMutation.error as Error).message || 'Đã xảy ra lỗi. Vui lòng thử lại.'}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Đang đặt lịch...
              </>
            ) : (
              'Xác nhận đặt lịch'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AppointmentForm;
