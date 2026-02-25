import { useState, useCallback, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import type { Product, CreateProductRequest } from '@/types/product.type';
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
  const [isFormOpen, setIsFormOpen] = useState(false);
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
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleCreateProduct = async (data: CreateProductRequest) => {
    setIsSubmitting(true);
    try {
      await productService.createProduct(data);
      setNotification({ type: 'success', message: 'Thêm sản phẩm thành công' });
      setIsFormOpen(false);
      fetchProducts();
    } catch {
      setNotification({ type: 'error', message: 'Không thể thêm sản phẩm' });
    } finally {
      setIsSubmitting(false);
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
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Quản lý sản phẩm</h1>
        <Button onClick={() => setIsFormOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Thêm sản phẩm
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

      <AdminProductTable
        products={products}
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

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Thêm sản phẩm mới</DialogTitle>
          </DialogHeader>
          <ProductForm
            onSubmit={handleCreateProduct}
            onCancel={() => setIsFormOpen(false)}
            isLoading={isSubmitting}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
