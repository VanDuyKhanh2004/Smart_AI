import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { PackageSearch } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  const [draftFilters, setDraftFilters] = useState<ProductFilterState>({ ...DEFAULT_FILTER_STATE });
  const [currentFilters, setCurrentFilters] = useState<ProductFilterState>({ ...DEFAULT_FILTER_STATE });
  // W4-S10: polite announcement for page changes (the result-count text alone
  // can be identical across pages, so it must not be the only signal).
  const [pageAnnouncement, setPageAnnouncement] = useState('');

  // Wishlist integration - Requirements: 7.1
  const { isAuthenticated } = useAuthStore();
  const { checkMultipleStatus } = useWishlistStore();

  // Check if any filter is active (for display purposes) — based on currentFilters only
  const isFilterActive = useMemo(() => {
    return (
      currentFilters.brand !== undefined ||
      currentFilters.minPrice !== undefined ||
      currentFilters.maxPrice !== undefined ||
      currentFilters.inStock !== 'all' ||
      (currentFilters.search && currentFilters.search.trim() !== '') ||
      currentFilters.sortBy !== DEFAULT_FILTER_STATE.sortBy ||
      currentFilters.sortOrder !== DEFAULT_FILTER_STATE.sortOrder ||
      currentFilters.minRating !== undefined
    );
  }, [currentFilters]);

  // Fetch brands on initial load from the lightweight metadata endpoint
  useEffect(() => {
    const controller = new AbortController();
    const fetchBrands = async () => {
      try {
        const data = await productService.getProductMeta({ signal: controller.signal });
        if (!controller.signal.aborted) {
          setAllBrands(data.brands);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error('Error fetching brands:', err);
        }
      }
    };
    fetchBrands();
    return () => controller.abort();
  }, []);

  // Abort controller for the product-list request so a stale request can never
  // overwrite newer results and cancelled requests produce no error.
  const productsAbortRef = useRef<AbortController | null>(null);

  const productListRef = useRef<HTMLDivElement>(null);
  const pendingPageScrollRef = useRef<number | null>(null);

  const fetchProducts = async (page: number = 1, filters: ProductFilterState = currentFilters) => {
    productsAbortRef.current?.abort();
    const controller = new AbortController();
    productsAbortRef.current = controller;
    try {
      setLoading(true);
      setError(null);

      // Map filter state to API params
      const params = {
        page,
        limit: 10,
        ...(filters.brand && { brand: filters.brand }),
        ...(filters.minPrice !== undefined && { minPrice: filters.minPrice }),
        ...(filters.maxPrice !== undefined && { maxPrice: filters.maxPrice }),
        ...(filters.inStock && filters.inStock !== 'all' && {
          inStock: filters.inStock === 'true',
        }),
        ...(filters.search && filters.search.trim() !== '' && {
          search: filters.search.trim(),
        }),
        ...(filters.sortBy && { sortBy: filters.sortBy }),
        ...(filters.sortOrder && { sortOrder: filters.sortOrder }),
        ...(filters.minRating !== undefined && { minRating: filters.minRating }),
      };

      const response = await productService.getAllProducts(params, { signal: controller.signal });

      if (controller.signal.aborted) return;
      setProducts(response.data.products);
      setPagination(response.data.pagination);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError('Không thể tải danh sách sản phẩm. Vui lòng thử lại sau.');
      console.error('Error fetching products:', err);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  };

  // Fetch whenever currentPage or currentFilters changes
  useEffect(() => {
    fetchProducts(currentPage, currentFilters);
    return () => productsAbortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, currentFilters]);

  // Fetch wishlist status for displayed products when authenticated
  // Requirements: 7.1 - Show filled heart if product is in wishlist
  useEffect(() => {
    if (isAuthenticated && products.length > 0) {
      const productIds = products.map((p) => p._id);
      checkMultipleStatus(productIds);
    }
  }, [isAuthenticated, products, checkMultipleStatus]);

  // Draft filter change — updates inputs immediately, NO API call, NO page reset
  const handleDraftFilterChange = (newFilters: ProductFilterState) => {
    setDraftFilters(newFilters);
  };

  // Apply draft filters — copies to currentFilters, resets page, triggers fetch
  const handleApplyFilters = () => {
    setCurrentFilters(draftFilters);
    setCurrentPage(1);
  };

  // Search change — directly updates both currentFilters and draftFilters, resets page
  const handleSearchChange = (search: string) => {
    setCurrentFilters(prev => ({ ...prev, search }));
    setDraftFilters(prev => ({ ...prev, search }));
    setCurrentPage(1);
  };

  // Clear all filters — resets both draft and current, resets page, triggers fetch
  const handleClearFilters = () => {
    const defaults = { ...DEFAULT_FILTER_STATE };
    setDraftFilters(defaults);
    setCurrentFilters(defaults);
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    if (page === currentPage) return;
    setPageAnnouncement(`Đang chuyển đến trang ${page}`);
    pendingPageScrollRef.current = page;
    setCurrentPage(page);
  };

  const scrollToProductList = () => {
    productListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    if (pendingPageScrollRef.current === null) return;
    const requestedPage = pendingPageScrollRef.current;
    if (pagination?.currentPage !== requestedPage) return;
    if (loading) return;
    pendingPageScrollRef.current = null;
    scrollToProductList();
    // W4-S10: move focus to the results heading so keyboard / screen-reader
    // users land on the new page's content.
    productListRef.current
      ?.querySelector<HTMLElement>('h1[data-results-heading]')
      ?.focus();
  }, [pagination, loading]);

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

  return (
    <div className="py-8">
      {/* Banner Carousel */}
      <BannerCarousel />
      
      <div ref={productListRef} className="mb-8 scroll-mt-16">
        <h1
          data-results-heading
          tabIndex={-1}
          className="text-3xl font-bold mb-2 outline-none"
        >
          Danh sách sản phẩm
        </h1>
        {/* W4-S05: result count announced politely when it changes */}
        <p className="text-muted-foreground" role="status">
          {pagination && (
            isFilterActive
              ? `Tìm thấy ${pagination.totalCount} sản phẩm phù hợp`
              : `Hiển thị ${products.length} trong tổng số ${pagination.totalCount} sản phẩm`
          )}
        </p>
        {/* W4-S10: page-change announcement */}
        <div role="status" aria-live="polite" className="sr-only">
          {pageAnnouncement}
        </div>
        {/* W4-S03: refetch/busy announcement — only while re-fetching over
            existing results; the initial load uses the loader status below */}
        <div role="status" aria-live="polite" className="sr-only">
          {loading && products.length > 0 ? 'Đang cập nhật kết quả...' : ''}
        </div>
      </div>

      {/* Product Filters */}
      <ProductFilters
        draftFilters={draftFilters}
        onDraftFilterChange={handleDraftFilterChange}
        onApplyFilters={handleApplyFilters}
        onClearFilters={handleClearFilters}
        onSearchChange={handleSearchChange}
        currentSearch={currentFilters.search || ''}
        brands={allBrands}
        isLoading={loading}
      />

      {loading && products.length === 0 ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            {/* W4-S01: loading announced politely */}
            <p className="text-muted-foreground" role="status">
              Đang tải danh sách sản phẩm...
            </p>
          </div>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            {/* W4-S02: load failure announced assertively once */}
            <p className="text-red-500 mb-4" role="alert">
              {error}
            </p>
            <button
              onClick={() => fetchProducts(currentPage)}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Thử lại
            </button>
          </div>
        </div>
      ) : products.length === 0 ? (
        /* Explicit empty/no-results state (EMPTY-01) */
        <div
          className="flex items-center justify-center min-h-[400px]"
          data-testid="product-empty-state"
        >
          <div className="text-center max-w-md">
            <PackageSearch
              className="h-16 w-16 mx-auto text-muted-foreground mb-4"
              aria-hidden="true"
            />
            <h2 className="text-xl font-semibold mb-2">
              Không tìm thấy sản phẩm nào
            </h2>
            <p className="text-muted-foreground mb-6">
              Hãy thử thay đổi từ khóa hoặc bộ lọc để tìm được sản phẩm phù hợp
              hơn.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {isFilterActive && (
                <Button variant="outline" onClick={handleClearFilters}>
                  Xóa bộ lọc
                </Button>
              )}
              <Button asChild>
                <Link to="/products">Xem tất cả sản phẩm</Link>
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Product Grid — W4-S03: marks displayed results as stale during a refetch */}
          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8"
            aria-busy={loading}
          >
            {products.map((product) => (
              <Card
                key={product._id}
                className="h-full relative cursor-pointer hover:shadow-lg transition-[transform,box-shadow] hover:scale-105"
              >
                {/* Action buttons are siblings of the product link — never
                    nested inside it (W3-07) */}
                <div className="absolute top-2 right-2 z-10 flex gap-1">
                  {/* CompareButton - Requirements: 1.1 */}
                  <CompareButton
                    productId={product._id}
                    size="icon"
                    variant="ghost"
                    className="bg-white/80 hover:bg-white shadow-sm rounded-full"
                  />
                  {/* WishlistButton - Requirements: 7.1 */}
                  <WishlistButton
                    productId={product._id}
                    size="icon"
                    variant="ghost"
                    className="bg-white/80 hover:bg-white shadow-sm rounded-full"
                  />
                </div>
                <Link
                  to={`/products/${product._id}`}
                  className="block"
                >
                  <CardContent className="p-0">
                    <AspectRatio ratio={4 / 3} className="bg-muted">
                      <img
                        src={product.image || '/images/product-placeholder.svg'}
                        alt={product.name}
                        className="object-cover w-full h-full rounded-t-xl"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = '/images/product-placeholder.svg';
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
                </Link>
              </Card>
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
                      disabled={!pagination.hasPrevPage}
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
                      disabled={!pagination.hasNextPage}
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
        </>
      )}
    </div>
  );
};

export default ProductListPage;
