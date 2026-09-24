import { useState, useCallback, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { ProductForm } from '../components/ProductForm';
import { AdminProductTable } from '../components/AdminProductTable';
import { productService } from '@/services/product.service';
import type { Product, ProductFormPayload } from '@/types/product.type';
import type { Pagination as PaginationType } from '@/types/api.type';

const DEFAULT_PAGINATION: PaginationType = {
  currentPage: 1,
  totalPages: 1,
  totalCount: 0,
  limit: 10,
  hasNextPage: false,
  hasPrevPage: false,
  nextPage: null,
  prevPage: null,
};

export function AdminProductPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [pagination, setPagination] = useState<PaginationType>(DEFAULT_PAGINATION);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [page, setPage] = useState(1);


  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await productService.getAllProducts({ page, limit: 10 });
      setProducts(response.data.products);
      setPagination(response.data.pagination);
    } catch {
      setNotification({ type: 'error', message: 'Không thể tải danh sách sản phẩm' });
    } finally {
      setIsLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    // Auto-dismiss success only; errors persist until dismissed/replaced (ERR-03)
    if (notification?.type === 'success') {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleCreateProduct = async (data: ProductFormPayload) => {
    setIsSubmitting(true);
    setUploadProgress(0);
    try {
      await productService.createProduct(data, {
        onUploadProgress: (event) => {
          if (event.total) {
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
          }
        },
      });
      setNotification({ type: 'success', message: 'Thêm sản phẩm thành công' });
      setIsFormOpen(false);
      fetchProducts();
    } catch {
      setNotification({ type: 'error', message: 'Không thể thêm sản phẩm' });
    } finally {
      setIsSubmitting(false);
      setUploadProgress(null);
    }
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setIsFormOpen(true);
  };

  const handleUpdateProduct = async (data: ProductFormPayload) => {
    if (!editingProduct) return;
    setIsSubmitting(true);
    setUploadProgress(0);
    try {
      await productService.updateProduct(editingProduct._id, data, {
        onUploadProgress: (event) => {
          if (event.total) {
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
          }
        },
      });
      setNotification({ type: 'success', message: 'Cập nhật sản phẩm thành công' });
      setIsFormOpen(false);
      setEditingProduct(null);
      fetchProducts();
    } catch {
      setNotification({ type: 'error', message: 'Không thể cập nhật sản phẩm' });
    } finally {
      setIsSubmitting(false);
      setUploadProgress(null);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    setIsDeleting(true);
    try {
      await productService.deleteProduct(productId);
      setNotification({ type: 'success', message: 'Xóa sản phẩm thành công' });
      fetchProducts();
    } catch {
      setNotification({ type: 'error', message: 'Không thể xóa sản phẩm' });
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const renderPaginationItems = () => {
    const items = [];
    const { currentPage, totalPages } = pagination;

    for (let i = 1; i <= totalPages; i++) {
      if (
        i === 1 ||
        i === totalPages ||
        (i >= currentPage - 1 && i <= currentPage + 1)
      ) {
        items.push(
          <PaginationItem key={i}>
            <PaginationLink
              href="#"
              isActive={i === currentPage}
              onClick={(e) => {
                e.preventDefault();
                handlePageChange(i);
              }}
            >
              {i}
            </PaginationLink>
          </PaginationItem>
        );
      }
    }
    return items;
  };


  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Quản lý sản phẩm</h1>
        <Button onClick={() => setIsFormOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Thêm sản phẩm
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

      <AdminProductTable
        products={products}
        onEdit={handleEditProduct}
        onDelete={handleDeleteProduct}
        isLoading={isLoading}
        isDeleting={isDeleting}
      />

      {pagination.totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            {pagination.hasPrevPage && (
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    handlePageChange(pagination.currentPage - 1);
                  }}
                />
              </PaginationItem>
            )}
            {renderPaginationItems()}
            {pagination.hasNextPage && (
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    handlePageChange(pagination.currentPage + 1);
                  }}
                />
              </PaginationItem>
            )}
          </PaginationContent>
        </Pagination>
      )}

      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!open) { setEditingProduct(null); setIsFormOpen(false); } }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'Chỉnh sửa sản phẩm' : 'Thêm sản phẩm mới'}</DialogTitle>
          </DialogHeader>
          <ProductForm
            key={editingProduct?._id || 'create'}
            onSubmit={editingProduct ? handleUpdateProduct : handleCreateProduct}
            onCancel={() => { setEditingProduct(null); setIsFormOpen(false); }}
            isLoading={isSubmitting}
            uploadProgress={uploadProgress}
            initialData={editingProduct || undefined}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
