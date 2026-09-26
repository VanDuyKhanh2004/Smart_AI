import { useState, useCallback, useEffect } from 'react';
import { Plus, Pencil, Trash2, Eye, EyeOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { StoreForm } from '../components/StoreForm';
import { storeService } from '@/features/stores/services/storeService';
import type { Store, CreateStoreRequest } from '@/features/stores/types';

export function AdminStoresPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [deleteStore, setDeleteStore] = useState<Store | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  // Mutation errors of the dialogs are rendered inside the dialog itself (H03):
  // a page-level banner sits behind the overlay and cannot be read.
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchStores = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await storeService.getAllStoresAdmin();
      setStores(response.data);
    } catch {
      setNotification({ type: 'error', message: 'Không thể tải danh sách cửa hàng' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  useEffect(() => {
    // Auto-dismiss success only; errors persist until dismissed/replaced (ERR-03)
    if (notification?.type === 'success') {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);


  const handleCreateStore = async (data: CreateStoreRequest) => {
    setIsSubmitting(true);
    setFormError(null);
    try {
      await storeService.createStore(data);
      setNotification({ type: 'success', message: 'Thêm cửa hàng thành công' });
      closeForm();
      fetchStores();
    } catch {
      setFormError('Không thể thêm cửa hàng');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStore = async (data: CreateStoreRequest) => {
    if (!editingStore) return;
    setIsSubmitting(true);
    setFormError(null);
    try {
      await storeService.updateStore(editingStore.id, data);
      setNotification({ type: 'success', message: 'Cập nhật cửa hàng thành công' });
      closeForm();
      fetchStores();
    } catch {
      setFormError('Không thể cập nhật cửa hàng');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteStore = async () => {
    if (!deleteStore || isDeleting) return;
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await storeService.deleteStore(deleteStore.id);
      setNotification({ type: 'success', message: 'Xóa cửa hàng thành công' });
      setDeleteStore(null);
      fetchStores();
    } catch {
      setDeleteError('Không thể xóa cửa hàng');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleStatus = async (store: Store) => {
    try {
      await storeService.toggleStoreStatus(store.id);
      setNotification({
        type: 'success',
        message: store.isActive ? 'Đã ẩn cửa hàng' : 'Đã kích hoạt cửa hàng',
      });
      fetchStores();
    } catch {
      setNotification({ type: 'error', message: 'Không thể thay đổi trạng thái' });
    }
  };

  const openEditForm = (store: Store) => {
    setFormError(null);
    setEditingStore(store);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingStore(null);
    setFormError(null);
  };

  const handleFormOpenChange = (open: boolean) => {
    if (open) {
      setFormError(null);
      setIsFormOpen(true);
    } else {
      closeForm();
    }
  };

  const openDeleteDialog = (store: Store) => {
    setDeleteError(null);
    setDeleteStore(store);
  };

  const closeDeleteDialog = () => {
    setDeleteStore(null);
    setDeleteError(null);
  };


  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Quản lý cửa hàng</h1>
        <Button onClick={() => setIsFormOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Thêm cửa hàng
        </Button>
      </div>

      {notification && (
        <Alert
          variant={notification.type === 'success' ? 'success' : 'destructive'}
          className="relative"
        >
          <AlertDescription className="pr-8">{notification.message}</AlertDescription>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="absolute right-2 top-2 rounded-md p-1 text-current/70 hover:text-current"
            aria-label="Đóng thông báo"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </Alert>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên cửa hàng</TableHead>
              <TableHead>Địa chỉ</TableHead>
              <TableHead>Điện thoại</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">
                  Đang tải...
                </TableCell>
              </TableRow>
            ) : stores.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">
                  Chưa có cửa hàng nào
                </TableCell>
              </TableRow>
            ) : (
              stores.map((store) => (
                <TableRow key={store.id}>
                  <TableCell
                    className="font-medium align-top whitespace-normal break-words leading-relaxed"
                    title={store.name}
                  >
                    {store.name}
                  </TableCell>
                  <TableCell
                    className="max-w-sm align-top whitespace-normal break-words leading-relaxed line-clamp-3"
                    title={store.address.fullAddress}
                  >
                    {store.address.fullAddress}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{store.phone}</TableCell>
                  <TableCell>
                    <Badge variant={store.isActive ? 'default' : 'secondary'}>
                      {store.isActive ? 'Hoạt động' : 'Đã ẩn'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggleStatus(store)}
                        title={store.isActive ? 'Ẩn cửa hàng' : 'Hiện cửa hàng'}
                      >
                        {store.isActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditForm(store)}
                        title="Chỉnh sửa"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openDeleteDialog(store)}
                        title="Xóa"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>


      {/* Create Store Dialog */}
      <Dialog open={isFormOpen} onOpenChange={handleFormOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Thêm cửa hàng mới</DialogTitle>
          </DialogHeader>
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          <StoreForm
            onSubmit={handleCreateStore}
            onCancel={closeForm}
            isLoading={isSubmitting}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Store Dialog */}
      <Dialog
        open={!!editingStore}
        onOpenChange={(open) => {
          if (!open) closeForm();
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa cửa hàng</DialogTitle>
          </DialogHeader>
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          <StoreForm
            store={editingStore}
            onSubmit={handleUpdateStore}
            onCancel={closeForm}
            isLoading={isSubmitting}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleteStore}
        onOpenChange={(open) => {
          if (!open) closeDeleteDialog();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa cửa hàng</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa cửa hàng "{deleteStore?.name}"? Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <Alert variant="destructive">
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Hủy</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleDeleteStore}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Đang xóa...' : 'Xóa'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
