import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AddressList } from "../components/AddressList";
import { AddressForm } from "../components/AddressForm";
import { addressService } from "@/services/address.service";
import type { Address, CreateAddressRequest } from "@/types/address.type";
import { MapPin } from "lucide-react";

/**
 * AddressManagementPage - Page for managing saved addresses
 * Requirements 2.1: Display all saved addresses in a list
 * Requirements 1.2: Save address to user's address list
 * Requirements 3.2: Update address and show success message
 * Requirements 4.2: Remove address from the list
 * Requirements 5.1: Set address as default
 */
export function AddressManagementPage() {
  // State
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Form dialog state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Delete confirmation state
  const [deleteAddress, setDeleteAddress] = useState<Address | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Show toast notification
  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Fetch addresses
  const fetchAddresses = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await addressService.getAddresses();
      setAddresses(response.data || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Không thể tải danh sách địa chỉ";
      setError(errorMessage);
      showToast(errorMessage, "error");
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);


  // Load addresses on mount
  useEffect(() => {
    fetchAddresses();
  }, [fetchAddresses]);

  // Handle add button click
  const handleAdd = () => {
    setEditingAddress(undefined);
    setIsFormOpen(true);
  };

  // Handle edit button click
  const handleEdit = (address: Address) => {
    setEditingAddress(address);
    setIsFormOpen(true);
  };

  // Handle delete button click
  const handleDelete = (address: Address) => {
    setDeleteAddress(address);
  };

  // Handle set default
  const handleSetDefault = async (address: Address) => {
    try {
      await addressService.setDefaultAddress(address.id);
      showToast("Đã đặt địa chỉ mặc định", "success");
      fetchAddresses();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Không thể đặt địa chỉ mặc định";
      showToast(errorMessage, "error");
    }
  };

  // Handle form submit (create or update)
  const handleFormSubmit = async (data: CreateAddressRequest) => {
    try {
      setIsSubmitting(true);
      if (editingAddress) {
        // Update existing address
        await addressService.updateAddress(editingAddress.id, data);
        showToast("Cập nhật địa chỉ thành công", "success");
      } else {
        // Create new address
        await addressService.createAddress(data);
        showToast("Thêm địa chỉ thành công", "success");
      }
      setIsFormOpen(false);
      setEditingAddress(undefined);
      fetchAddresses();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error 
        ? err.message 
        : (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Không thể lưu địa chỉ";
      showToast(errorMessage, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle form cancel
  const handleFormCancel = () => {
    setIsFormOpen(false);
    setEditingAddress(undefined);
  };

  // Confirm delete
  const handleConfirmDelete = async () => {
    if (!deleteAddress) return;
    
    try {
      setIsDeleting(true);
      await addressService.deleteAddress(deleteAddress.id);
      showToast("Xóa địa chỉ thành công", "success");
      setDeleteAddress(null);
      fetchAddresses();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Không thể xóa địa chỉ";
      showToast(errorMessage, "error");
    } finally {
      setIsDeleting(false);
    }
  };

  // Cancel delete
  const handleCancelDelete = () => {
    setDeleteAddress(null);
  };

  return (
    <div className="py-6">
      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-md shadow-lg ${
            toast.type === "success"
              ? "bg-green-100 text-green-800 border border-green-200"
              : "bg-red-100 text-red-800 border border-red-200"
          }`}
        >
          {toast.message}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Địa chỉ đã lưu
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error && !isLoading ? (
            <div className="text-center py-8 text-destructive">
              <p>{error}</p>
              <button
                onClick={fetchAddresses}
                className="mt-2 text-sm underline hover:no-underline"
              >
                Thử lại
              </button>
            </div>
          ) : (
            <AddressList
              addresses={addresses}
              onAdd={handleAdd}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onSetDefault={handleSetDefault}
              isLoading={isLoading}
            />
          )}
        </CardContent>
      </Card>

      {/* Address Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingAddress ? "Chỉnh sửa địa chỉ" : "Thêm địa chỉ mới"}
            </DialogTitle>
          </DialogHeader>
          <AddressForm
            address={editingAddress}
            onSubmit={handleFormSubmit}
            onCancel={handleFormCancel}
            isLoading={isSubmitting}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteAddress} onOpenChange={() => setDeleteAddress(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa địa chỉ</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa địa chỉ này? Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDelete} disabled={isDeleting}>
              Hủy
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Đang xóa..." : "Xóa"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
