import { useState, useCallback, useEffect } from 'react';
import { format, parseISO, addHours } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Calendar, Clock, MapPin, Phone, RefreshCw, CalendarX, Store, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { appointmentService } from '../services/appointmentService';
import type { Appointment, AppointmentStatus, Store as StoreType } from '../types';

// Purpose labels in Vietnamese
const purposeLabels: Record<string, string> = {
  consultation: 'Tư vấn sản phẩm',
  warranty: 'Bảo hành',
  purchase: 'Mua hàng',
  other: 'Khác',
};

// Status labels and colors
const statusConfig: Record<AppointmentStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Chờ xác nhận', variant: 'secondary' },
  confirmed: { label: 'Đã xác nhận', variant: 'default' },
  cancelled: { label: 'Đã hủy', variant: 'destructive' },
  completed: { label: 'Hoàn thành', variant: 'outline' },
};

/**
 * Check if appointment can be cancelled (more than 24 hours before)
 * Requirements 5.4: Cannot cancel within 24 hours
 */
function canCancelAppointment(appointment: Appointment): boolean {
  if (appointment.status !== 'pending' && appointment.status !== 'confirmed') {
    return false;
  }
  
  const appointmentDateTime = parseISO(appointment.date);
  const [hours, minutes] = appointment.timeSlot.start.split(':').map(Number);
  appointmentDateTime.setHours(hours, minutes, 0, 0);
  
  const now = new Date();
  const twentyFourHoursFromNow = addHours(now, 24);
  
  return appointmentDateTime > twentyFourHoursFromNow;
}

/**
 * MyAppointmentsPage - Display and manage user's appointments
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */
export function MyAppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // Cancel dialog state
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [appointmentToCancel, setAppointmentToCancel] = useState<Appointment | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);


  // Fetch appointments
  const fetchAppointments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await appointmentService.getMyAppointments();
      if (response.success) {
        setAppointments(response.data);
      } else {
        setError('Không thể tải danh sách lịch hẹn');
      }
    } catch {
      setError('Đã xảy ra lỗi khi tải danh sách lịch hẹn');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  // Filter appointments by status
  const filteredAppointments = statusFilter === 'all'
    ? appointments
    : appointments.filter(apt => apt.status === statusFilter);

  // Handle cancel click
  const handleCancelClick = useCallback((appointment: Appointment) => {
    setAppointmentToCancel(appointment);
    setCancelDialogOpen(true);
  }, []);

  // Handle cancel confirm
  const handleCancelConfirm = useCallback(async () => {
    if (!appointmentToCancel) return;
    
    setIsCancelling(true);
    try {
      const response = await appointmentService.cancelAppointment(appointmentToCancel.id);
      if (response.success) {
        // Update the appointment in the list
        setAppointments(prev =>
          prev.map(apt =>
            apt.id === appointmentToCancel.id
              ? { ...apt, status: 'cancelled' as AppointmentStatus }
              : apt
          )
        );
        setCancelDialogOpen(false);
        setAppointmentToCancel(null);
      }
    } catch {
      setError('Không thể hủy lịch hẹn. Vui lòng thử lại.');
    } finally {
      setIsCancelling(false);
    }
  }, [appointmentToCancel]);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  // Format date for display
  const formatAppointmentDate = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      return format(date, "EEEE, dd/MM/yyyy", { locale: vi });
    } catch {
      return dateStr;
    }
  };

  // Get store info from appointment
  const getStoreInfo = (store: StoreType | string): { name: string; address: string; phone: string } => {
    if (typeof store === 'string') {
      return { name: 'Cửa hàng', address: '', phone: '' };
    }
    return {
      name: store.name,
      address: store.address?.fullAddress || '',
      phone: store.phone || '',
    };
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6" />
            Lịch hẹn của tôi
          </h1>
          <p className="text-muted-foreground mt-1">
            Quản lý các lịch hẹn tại cửa hàng
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Status filter - Requirements 5.2 */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Lọc theo trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              <SelectItem value="pending">Chờ xác nhận</SelectItem>
              <SelectItem value="confirmed">Đã xác nhận</SelectItem>
              <SelectItem value="completed">Hoàn thành</SelectItem>
              <SelectItem value="cancelled">Đã hủy</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Làm mới
          </Button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={handleRefresh} className="ml-auto">
            Thử lại
          </Button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && !error && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index}>
              <CardHeader className="pb-3">
                <Skeleton className="h-5 w-3/4" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-8 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && filteredAppointments.length === 0 && (
        <div className="text-center py-16">
          <CalendarX className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">
            {statusFilter === 'all' ? 'Chưa có lịch hẹn nào' : 'Không có lịch hẹn nào'}
          </h2>
          <p className="text-muted-foreground mb-4">
            {statusFilter === 'all'
              ? 'Bạn chưa đặt lịch hẹn nào. Hãy tìm cửa hàng và đặt lịch ngay!'
              : 'Không có lịch hẹn nào với trạng thái này.'}
          </p>
          {statusFilter === 'all' && (
            <Button asChild>
              <a href="/stores">Tìm cửa hàng</a>
            </Button>
          )}
        </div>
      )}


      {/* Appointments List - Requirements 5.1, 5.2 */}
      {!isLoading && !error && filteredAppointments.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredAppointments.map((appointment) => {
            const storeInfo = getStoreInfo(appointment.store);
            const canCancel = canCancelAppointment(appointment);
            const statusInfo = statusConfig[appointment.status];

            return (
              <Card key={appointment.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base font-semibold line-clamp-1">
                      {storeInfo.name}
                    </CardTitle>
                    <Badge variant={statusInfo.variant} className="shrink-0">
                      {statusInfo.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Date and Time */}
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>{formatAppointmentDate(appointment.date)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>{appointment.timeSlot.start} - {appointment.timeSlot.end}</span>
                  </div>

                  {/* Store Address */}
                  {storeInfo.address && (
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{storeInfo.address}</span>
                    </div>
                  )}

                  {/* Store Phone */}
                  {storeInfo.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                      <a href={`tel:${storeInfo.phone}`} className="text-primary hover:underline">
                        {storeInfo.phone}
                      </a>
                    </div>
                  )}

                  {/* Purpose */}
                  <div className="flex items-center gap-2 text-sm">
                    <Store className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>{purposeLabels[appointment.purpose] || appointment.purpose}</span>
                  </div>

                  {/* Notes */}
                  {appointment.notes && (
                    <p className="text-sm text-muted-foreground italic line-clamp-2">
                      "{appointment.notes}"
                    </p>
                  )}

                  {/* Cancel Button - Requirements 5.3, 5.4 */}
                  {(appointment.status === 'pending' || appointment.status === 'confirmed') && (
                    <div className="pt-2">
                      {canCancel ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleCancelClick(appointment)}
                        >
                          Hủy lịch hẹn
                        </Button>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Không thể hủy lịch hẹn trong vòng 24 giờ
                        </p>
                      )}
                    </div>
                  )}

                  {/* Cancel Reason */}
                  {appointment.status === 'cancelled' && appointment.cancelReason && (
                    <p className="text-sm text-muted-foreground">
                      Lý do hủy: {appointment.cancelReason}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Appointment count info */}
      {!isLoading && !error && appointments.length > 0 && (
        <p className="text-center text-sm text-muted-foreground">
          Hiển thị {filteredAppointments.length} / {appointments.length} lịch hẹn
        </p>
      )}

      {/* Cancel Confirmation Dialog - Requirements 5.3 */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận hủy lịch hẹn</DialogTitle>
            <DialogDescription>
              Bạn có chắc chắn muốn hủy lịch hẹn này không? Hành động này không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          {appointmentToCancel && (
            <div className="py-4 space-y-2 text-sm">
              <p><strong>Cửa hàng:</strong> {getStoreInfo(appointmentToCancel.store).name}</p>
              <p><strong>Ngày:</strong> {formatAppointmentDate(appointmentToCancel.date)}</p>
              <p><strong>Giờ:</strong> {appointmentToCancel.timeSlot.start} - {appointmentToCancel.timeSlot.end}</p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelDialogOpen(false)}
              disabled={isCancelling}
            >
              Không, giữ lại
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelConfirm}
              disabled={isCancelling}
            >
              {isCancelling ? 'Đang hủy...' : 'Xác nhận hủy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default MyAppointmentsPage;
