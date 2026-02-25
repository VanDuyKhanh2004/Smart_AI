import { useState, useCallback, useEffect } from 'react';
import { Check, X, CheckCircle, Calendar, Filter, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { appointmentService } from '@/features/stores/services/appointmentService';
import { storeService } from '@/features/stores/services/storeService';
import type { Appointment, AppointmentStatus, Store } from '@/features/stores/types';

const STATUS_OPTIONS: { value: AppointmentStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'pending', label: 'Chờ xác nhận' },
  { value: 'confirmed', label: 'Đã xác nhận' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'cancelled', label: 'Đã hủy' },
];

const PURPOSE_LABELS: Record<string, string> = {
  consultation: 'Tư vấn sản phẩm',
  warranty: 'Bảo hành',
  purchase: 'Mua hàng',
  other: 'Khác',
};

const STATUS_BADGE_VARIANTS: Record<AppointmentStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  confirmed: 'default',
  completed: 'outline',
  cancelled: 'destructive',
};

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
};

interface AppointmentFilters {
  store: string;
  status: AppointmentStatus | 'all';
  startDate: string;
  endDate: string;
}

export function AdminAppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  // Filters
  const [filters, setFilters] = useState<AppointmentFilters>({
    store: 'all',
    status: 'all',
    startDate: '',
    endDate: '',
  });

  // Action dialogs
  const [confirmDialog, setConfirmDialog] = useState<{ appointment: Appointment; action: 'confirm' | 'complete' } | null>(null);
  const [cancelDialog, setCancelDialog] = useState<Appointment | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Fetch stores for filter dropdown
  const fetchStores = useCallback(async () => {
    try {
      const response = await storeService.getAllStoresAdmin();
      setStores(response.data);
    } catch {
      console.error('Failed to fetch stores');
    }
  }, []);

  // Fetch appointments with filters
  const fetchAppointments = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = {};
      
      if (filters.store !== 'all') {
        params.store = filters.store;
      }
      if (filters.status !== 'all') {
        params.status = filters.status;
      }
      if (filters.startDate) {
        params.startDate = filters.startDate;
      }
      if (filters.endDate) {
        params.endDate = filters.endDate;
      }

      const response = await appointmentService.getAllAppointments(params);
      setAppointments(response.data);
    } catch {
      setNotification({ type: 'error', message: 'Không thể tải danh sách lịch hẹn' });
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Handle status update (confirm/complete)
  const handleStatusUpdate = async () => {
    if (!confirmDialog) return;
    
    const { appointment, action } = confirmDialog;
    const newStatus: AppointmentStatus = action === 'confirm' ? 'confirmed' : 'completed';
    
    try {
      await appointmentService.updateAppointmentStatus(appointment.id, { status: newStatus });
      setNotification({
        type: 'success',
        message: action === 'confirm' ? 'Đã xác nhận lịch hẹn' : 'Đã hoàn thành lịch hẹn',
      });
      setConfirmDialog(null);
      fetchAppointments();
    } catch {
      setNotification({ type: 'error', message: 'Không thể cập nhật trạng thái' });
    }
  };

  // Handle cancel appointment
  const handleCancelAppointment = async () => {
    if (!cancelDialog) return;
    
    try {
      await appointmentService.updateAppointmentStatus(cancelDialog.id, {
        status: 'cancelled',
        cancelReason: cancelReason || undefined,
      });
      setNotification({ type: 'success', message: 'Đã hủy lịch hẹn' });
      setCancelDialog(null);
      setCancelReason('');
      fetchAppointments();
    } catch {
      setNotification({ type: 'error', message: 'Không thể hủy lịch hẹn' });
    }
  };

  // Reset filters
  const handleResetFilters = () => {
    setFilters({
      store: 'all',
      status: 'all',
      startDate: '',
      endDate: '',
    });
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('vi-VN', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  // Get contact info from appointment
  const getContactInfo = (appointment: Appointment) => {
    if (appointment.guestInfo) {
      return {
        name: appointment.guestInfo.name,
        phone: appointment.guestInfo.phone,
        email: appointment.guestInfo.email,
        isGuest: true,
      };
    }
    // User info would be populated from backend
    const user = appointment.user as unknown as { name?: string; phone?: string; email?: string } | undefined;
    if (user && typeof user === 'object') {
      return {
        name: user.name || 'N/A',
        phone: user.phone || 'N/A',
        email: user.email || 'N/A',
        isGuest: false,
      };
    }
    return { name: 'N/A', phone: 'N/A', email: 'N/A', isGuest: false };
  };

  // Get store name from appointment
  const getStoreName = (appointment: Appointment) => {
    if (typeof appointment.store === 'object' && appointment.store !== null) {
      return appointment.store.name;
    }
    return 'N/A';
  };

  // Check if action buttons should be shown
  const canConfirm = (status: AppointmentStatus) => status === 'pending';
  const canComplete = (status: AppointmentStatus) => status === 'confirmed';
  const canCancel = (status: AppointmentStatus) => status === 'pending' || status === 'confirmed';

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Quản lý lịch hẹn</h1>
        <Button variant="outline" onClick={fetchAppointments}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Làm mới
        </Button>
      </div>

      {notification && (
        <div
          className={`p-4 rounded-md ${
            notification.type === 'success'
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
              : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
          }`}
        >
          {notification.message}
        </div>
      )}

      {/* Filters */}
      <div className="bg-muted/50 p-4 rounded-lg space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Filter className="h-4 w-4" />
          Bộ lọc
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Store filter */}
          <Select
            value={filters.store}
            onValueChange={(value) => setFilters((prev) => ({ ...prev, store: value }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Chọn cửa hàng" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả cửa hàng</SelectItem>
              {stores.map((store) => (
                <SelectItem key={store.id} value={store.id}>
                  {store.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status filter */}
          <Select
            value={filters.status}
            onValueChange={(value) => setFilters((prev) => ({ ...prev, status: value as AppointmentStatus | 'all' }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Start date filter */}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters((prev) => ({ ...prev, startDate: e.target.value }))}
              placeholder="Từ ngày"
            />
          </div>

          {/* End date filter */}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters((prev) => ({ ...prev, endDate: e.target.value }))}
              placeholder="Đến ngày"
            />
          </div>

          {/* Reset button */}
          <Button variant="outline" onClick={handleResetFilters}>
            Xóa bộ lọc
          </Button>
        </div>
      </div>

      {/* Appointments Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ngày</TableHead>
              <TableHead>Giờ</TableHead>
              <TableHead>Cửa hàng</TableHead>
              <TableHead>Khách hàng</TableHead>
              <TableHead>Liên hệ</TableHead>
              <TableHead>Mục đích</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  Đang tải...
                </TableCell>
              </TableRow>
            ) : appointments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  Không có lịch hẹn nào
                </TableCell>
              </TableRow>
            ) : (
              appointments.map((appointment) => {
                const contact = getContactInfo(appointment);
                return (
                  <TableRow key={appointment.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(appointment.date)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {appointment.timeSlot.start} - {appointment.timeSlot.end}
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate">
                      {getStoreName(appointment)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{contact.name}</span>
                        {contact.isGuest && (
                          <Badge variant="outline" className="w-fit text-xs mt-1">
                            Khách
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col text-sm">
                        <span>{contact.phone}</span>
                        <span className="text-muted-foreground truncate max-w-[150px]">
                          {contact.email}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {PURPOSE_LABELS[appointment.purpose] || appointment.purpose}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE_VARIANTS[appointment.status]}>
                        {STATUS_LABELS[appointment.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canConfirm(appointment.status) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setConfirmDialog({ appointment, action: 'confirm' })}
                            title="Xác nhận"
                            className="text-green-600 hover:text-green-700 hover:bg-green-100"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                        {canComplete(appointment.status) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setConfirmDialog({ appointment, action: 'complete' })}
                            title="Hoàn thành"
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-100"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        )}
                        {canCancel(appointment.status) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setCancelDialog(appointment)}
                            title="Hủy"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Confirm/Complete Dialog */}
      <AlertDialog open={!!confirmDialog} onOpenChange={() => setConfirmDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog?.action === 'confirm' ? 'Xác nhận lịch hẹn' : 'Hoàn thành lịch hẹn'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog?.action === 'confirm'
                ? 'Bạn có chắc chắn muốn xác nhận lịch hẹn này?'
                : 'Bạn có chắc chắn muốn đánh dấu lịch hẹn này là hoàn thành?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleStatusUpdate}>
              {confirmDialog?.action === 'confirm' ? 'Xác nhận' : 'Hoàn thành'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Dialog with reason */}
      <Dialog open={!!cancelDialog} onOpenChange={() => { setCancelDialog(null); setCancelReason(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hủy lịch hẹn</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Bạn có chắc chắn muốn hủy lịch hẹn này? Hành động này không thể hoàn tác.
            </p>
            <div className="space-y-2">
              <label htmlFor="cancelReason" className="text-sm font-medium">
                Lý do hủy (tùy chọn)
              </label>
              <Textarea
                id="cancelReason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Nhập lý do hủy lịch hẹn..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCancelDialog(null); setCancelReason(''); }}>
              Đóng
            </Button>
            <Button variant="destructive" onClick={handleCancelAppointment}>
              Hủy lịch hẹn
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
