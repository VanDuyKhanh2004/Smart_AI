import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { productService } from '@/services/product.service';
import type { Product, ProductFilterState } from '@/types/product.type';
import { DEFAULT_FILTER_STATE } from '@/types/product.type';
import type { Pagination as PaginationType } from '@/types/api.type';
import BannerCarousel from '../components/BannerCarousel';
import { ProductFilters } from '../components/ProductFilters';
import { StarRating } from '@/components/ui/StarRating';
import WishlistButton from '@/components/ui/WishlistButton';
import CompareButton from '@/components/ui/CompareButton';
import { useWishlistStore } from '@/stores/wishlistStore';
import { useAuthStore } from '@/stores/authStore';

const ProductListPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [allBrands, setAllBrands] = useState<string[]>([]);
  const [pagination, setPagination] = useState<PaginationType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState<ProductFilterState>({ ...DEFAULT_FILTER_STATE });

  // Wishlist integration - Requirements: 7.1
  const { isAuthenticated } = useAuthStore();
  const { checkMultipleStatus } = useWishlistStore();

  // Check if any filter is active (for display purposes)
  const isFilterActive = useMemo(() => {
    return (
      filters.brand !== undefined ||
      filters.minPrice !== undefined ||
      filters.maxPrice !== undefined ||
      filters.inStock !== 'all' ||
      (filters.search && filters.search.trim() !== '') ||
      filters.sortBy !== DEFAULT_FILTER_STATE.sortBy ||
      filters.sortOrder !== DEFAULT_FILTER_STATE.sortOrder ||
      filters.minRating !== undefined
    );
  }, [filters]);

  // Fetch brands on initial load
  useEffect(() => {
    const fetchBrands = async () => {
      try {
        // Fetch all products to extract unique brands
        const response = await productService.getAllProducts({ limit: 1000 });
        const uniqueBrands = [...new Set(response.data.products.map((p) => p.brand))].sort();
        setAllBrands(uniqueBrands);
      } catch (err) {
        console.error('Error fetching brands:', err);
      }
    };
    fetchBrands();
  }, []);

  const fetchProducts = async (page: number = 1, currentFilters: ProductFilterState = filters) => {
    try {
      setLoading(true);
      setError(null);

      // Map filter state to API params
      const params = {
        page,
        limit: 10,
        ...(currentFilters.brand && { brand: currentFilters.brand }),
        ...(currentFilters.minPrice !== undefined && { minPrice: currentFilters.minPrice }),
        ...(currentFilters.maxPrice !== undefined && { maxPrice: currentFilters.maxPrice }),
        ...(currentFilters.inStock && currentFilters.inStock !== 'all' && {
          inStock: currentFilters.inStock === 'true',
        }),
        ...(currentFilters.search && currentFilters.search.trim() !== '' && {
          search: currentFilters.search.trim(),
        }),
        ...(currentFilters.sortBy && { sortBy: currentFilters.sortBy }),
        ...(currentFilters.sortOrder && { sortOrder: currentFilters.sortOrder }),
        ...(currentFilters.minRating !== undefined && { minRating: currentFilters.minRating }),
      };

      const response = await productService.getAllProducts(params);

      setProducts(response.data.products);
      setPagination(response.data.pagination);
    } catch (err) {
      setError('Không thể tải danh sách sản phẩm. Vui lòng thử lại sau.');
      console.error('Error fetching products:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts(currentPage, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, filters]);

  // Fetch wishlist status for displayed products when authenticated
  // Requirements: 7.1 - Show filled heart if product is in wishlist
  useEffect(() => {
    if (isAuthenticated && products.length > 0) {
      const productIds = products.map((p) => p._id);
      checkMultipleStatus(productIds);
    }
  }, [isAuthenticated, products, checkMultipleStatus]);

  // Handle filter change - reset page to 1
  const handleFilterChange = (newFilters: ProductFilterState) => {
    setFilters(newFilters);
    setCurrentPage(1);
  };

  // Handle clear filters - reset all filters and page
  const handleClearFilters = () => {
    setFilters({ ...DEFAULT_FILTER_STATE });
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(price);
  };

  const renderPaginationItems = () => {
    if (!pagination) return null;

    const items = [];
    const { currentPage, totalPages } = pagination;
    
    // Show first page
    if (currentPage > 2) {
      items.push(
        <PaginationItem key={1}>
          <PaginationLink
            href="#"
            onClick={(e) => {
              e.preventDefault();
              handlePageChange(1);
            }}
            isActive={currentPage === 1}
          >
            1
          </PaginationLink>
        </PaginationItem>
      );
    }

    // Show ellipsis if needed
    if (currentPage > 3) {
      items.push(
        <PaginationItem key="ellipsis-start">
          <span className="flex size-9 items-center justify-center">...</span>
        </PaginationItem>
      );
    }

    // Show current page and adjacent pages
    for (let i = Math.max(1, currentPage - 1); i <= Math.min(totalPages, currentPage + 1); i++) {
      items.push(
        <PaginationItem key={i}>
          <PaginationLink
            href="#"
            onClick={(e) => {
              e.preventDefault();
              handlePageChange(i);
            }}
            isActive={currentPage === i}
          >
            {i}
          </PaginationLink>
        </PaginationItem>
      );
    }

    // Show ellipsis if needed
    if (currentPage < totalPages - 2) {
      items.push(
        <PaginationItem key="ellipsis-end">
          <span className="flex size-9 items-center justify-center">...</span>
        </PaginationItem>
      );
    }

    // Show last page
    if (currentPage < totalPages - 1) {
      items.push(
        <PaginationItem key={totalPages}>
          <PaginationLink
            href="#"
            onClick={(e) => {
              e.preventDefault();
              handlePageChange(totalPages);
            }}
            isActive={currentPage === totalPages}
          >
            {totalPages}
          </PaginationLink>
        </PaginationItem>
      );
    }

    return items;
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Đang tải danh sách sản phẩm...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <p className="text-red-500 mb-4">{error}</p>
            <button
              onClick={() => fetchProducts(currentPage)}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Thử lại
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Banner Carousel */}
      <BannerCarousel />
      
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Danh sách sản phẩm</h1>
        <p className="text-muted-foreground">
          {pagination && (
            isFilterActive
              ? `Tìm thấy ${pagination.totalCount} sản phẩm phù hợp`
              : `Hiển thị ${products.length} trong tổng số ${pagination.totalCount} sản phẩm`
          )}
        </p>
      </div>

      {/* Product Filters */}
      <ProductFilters
        filters={filters}
        onFilterChange={handleFilterChange}
        onClearFilters={handleClearFilters}
        brands={allBrands}
        isLoading={loading}
      />

      {/* Product Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
        {products.map((product) => (
          <Link
            key={product._id}
            to={`/products/${product._id}`}
            className="block transition-transform hover:scale-105"
          >
            <Card className="h-full cursor-pointer hover:shadow-lg transition-shadow relative">
              {/* WishlistButton - Requirements: 7.1 */}
              <div className="absolute top-2 right-2 z-10 flex gap-1">
                {/* CompareButton - Requirements: 1.1 */}
                <CompareButton
                  productId={product._id}
                  size="icon"
                  variant="ghost"
                  className="bg-white/80 hover:bg-white shadow-sm rounded-full"
                />
                <WishlistButton
                  productId={product._id}
                  size="icon"
                  variant="ghost"
                  className="bg-white/80 hover:bg-white shadow-sm rounded-full"
                />
              </div>
              <CardContent className="p-0">
                <AspectRatio ratio={4 / 3} className="bg-muted">
                  <img
                    src={product.image || '/api/placeholder/400/300'}
                    alt={product.name}
                    className="object-cover w-full h-full rounded-t-xl"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = 'https://via.placeholder.com/400x300/e5e5e5/9ca3af?text=No+Image';
                    }}
                  />
                </AspectRatio>
              </CardContent>
              
              <CardHeader className="pb-2">
                <CardTitle className="text-lg truncate">
                  {product.name}
                </CardTitle>
              </CardHeader>
              
              <CardFooter className="pt-0 flex-col items-start space-y-2">
                <p className="text-sm text-muted-foreground capitalize">
                  {product.brand}
                </p>
                {/* Rating display */}
                <div className="flex items-center gap-1.5">
                  {product.reviewCount && product.reviewCount > 0 ? (
                    <>
                      <StarRating rating={product.averageRating || 0} size="sm" />
                      <span className="text-sm text-muted-foreground">
                        ({product.reviewCount})
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">
                      Chưa có đánh giá
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between w-full">
                  <span className="text-xl font-bold text-primary">
                    {formatPrice(product.price)}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    product.inStock > 0 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {product.inStock > 0 ? 'Còn hàng' : 'Hết hàng'}
                  </span>
                </div>
              </CardFooter>
            </Card>
          </Link>
        ))}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex justify-center">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (pagination.hasPrevPage) {
                      handlePageChange(currentPage - 1);
                    }
                  }}
                  className={!pagination.hasPrevPage ? 'pointer-events-none opacity-50' : ''}
                />
              </PaginationItem>
              
              {renderPaginationItems()}
              
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (pagination.hasNextPage) {
                      handlePageChange(currentPage + 1);
                    }
                  }}
                  className={!pagination.hasNextPage ? 'pointer-events-none opacity-50' : ''}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
};

export default ProductListPage;
