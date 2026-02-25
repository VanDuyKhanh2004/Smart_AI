import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import {
  ArrowLeft,
  Share2,
  ShoppingCart,
  ExternalLink,
  Loader2,
  Check,
  X,
  Copy,
} from 'lucide-react';
import { compareService } from '@/services/compare.service';
import { useCompareStore } from '@/stores/compareStore';
import { useCartStore } from '@/stores/cartStore';
import { useAuthStore } from '@/stores/authStore';
import { StarRating } from '@/components/ui/StarRating';
import CompareTable from '../components/CompareTable';
import type { Product } from '@/types/product.type';
import { cn } from '@/lib/utils';

/**
 * ComparePage Component
 *
 * Main comparison page displaying:
 * - Header with product cards (image, name, price, rating)
 * - Toggle "Chỉ hiện khác biệt" to filter rows
 * - CompareTable component for detailed specs comparison
 * - Quick actions (Thêm vào giỏ, Xem chi tiết)
 * - Share functionality
 *
 * Requirements: 3.1, 3.2, 4.1, 6.1, 6.2, 6.3, 7.1, 7.2, 7.3
 */
const ComparePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // State
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showOnlyDifferences, setShowOnlyDifferences] = useState(false);
  const [addingToCart, setAddingToCart] = useState<Record<string, boolean>>({});
  const [addedToCart, setAddedToCart] = useState<Record<string, boolean>>({});
  const [shareUrlCopied, setShareUrlCopied] = useState(false);

  // Stores
  const { items: compareItems, removeFromCompare } = useCompareStore();
  const { addItem } = useCartStore();
  const { isAuthenticated } = useAuthStore();

  // Ref to track if history has been saved
  const historySavedRef = useRef(false);

  // Get product IDs from URL params or compare store
  const getProductIds = useCallback((): string[] => {
    const urlProducts = searchParams.get('products');
    if (urlProducts) {
      return urlProducts.split(',').filter(Boolean);
    }
    return compareItems;
  }, [searchParams, compareItems]);

  // Fetch products for comparison
  const fetchProducts = useCallback(async () => {
    const productIds = getProductIds();

    if (productIds.length < 2) {
      setError('Cần ít nhất 2 sản phẩm để so sánh');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await compareService.getCompareProducts(productIds);
      if (response.success) {
        // Normalize products to ensure _id is set (API may return 'id' instead of '_id')
        const normalizedProducts = response.data.map((p) => ({
          ...p,
          _id: p._id || p.id || '',
        }));

        // Maintain order based on productIds array
        const orderedProducts = productIds
          .map((id) => normalizedProducts.find((p) => p._id === id || p.id === id))
          .filter((p): p is Product => p !== undefined);

        if (orderedProducts.length < 2) {
          setError('Không tìm thấy đủ sản phẩm để so sánh');
        } else {
          setProducts(orderedProducts);
        }
      } else {
        setError('Không thể tải thông tin sản phẩm');
      }
    } catch (err) {
      console.error('Failed to fetch compare products:', err);
      setError('Không thể tải thông tin sản phẩm. Vui lòng thử lại sau.');
    } finally {
      setLoading(false);
    }
  }, [getProductIds]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);


  // Auto-save to history for authenticated users (Requirement 5.1)
  useEffect(() => {
    const saveToHistory = async () => {
      if (
        isAuthenticated &&
        products.length >= 2 &&
        !historySavedRef.current
      ) {
        try {
          const productIds = products.map((p) => p._id);
          await compareService.saveToHistory(productIds);
          historySavedRef.current = true;
        } catch (err) {
          // Silently fail - history save is not critical
          console.error('Failed to save comparison to history:', err);
        }
      }
    };

    saveToHistory();
  }, [isAuthenticated, products]);

  // Format price in VND
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(price);
  };

  // Handle add to cart (Requirement 7.1, 7.3)
  const handleAddToCart = async (product: Product) => {
    setAddingToCart((prev) => ({ ...prev, [product._id]: true }));

    try {
      // Use first color or 'default'
      const color =
        product.colors && product.colors.length > 0
          ? product.colors[0]
          : 'default';

      if (isAuthenticated) {
        await addItem(product._id, 1, color);
      } else {
        // For guest users, update store state directly
        const currentItems = useCartStore.getState().items;
        const existingIndex = currentItems.findIndex((item) => {
          const itemProductId =
            item.product?._id ||
            (item as unknown as { productId: string }).productId;
          return itemProductId === product._id && item.color === color;
        });

        let newItems;
        if (existingIndex >= 0) {
          newItems = currentItems.map((item, index) =>
            index === existingIndex
              ? { ...item, quantity: item.quantity + 1 }
              : item
          );
        } else {
          newItems = [
            ...currentItems,
            {
              _id: `local-${Date.now()}`,
              product: product,
              quantity: 1,
              color: color,
              addedAt: new Date().toISOString(),
            },
          ];
        }

        useCartStore.getState().setItems(newItems);

        // Save to localStorage
        const localCartItems = newItems.map((item) => ({
          productId:
            item.product?._id ||
            (item as unknown as { productId: string }).productId,
          quantity: item.quantity,
          color: item.color,
        }));
        localStorage.setItem('guestCart', JSON.stringify(localCartItems));
      }

      setAddedToCart((prev) => ({ ...prev, [product._id]: true }));
      setTimeout(() => {
        setAddedToCart((prev) => ({ ...prev, [product._id]: false }));
      }, 2000);
    } catch (err) {
      console.error('Failed to add to cart:', err);
    } finally {
      setAddingToCart((prev) => ({ ...prev, [product._id]: false }));
    }
  };

  // Handle share (Requirement 6.1, 6.2)
  const handleShare = async () => {
    const productIds = products.map((p) => p._id).join(',');
    const shareUrl = `${window.location.origin}/compare?products=${productIds}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareUrlCopied(true);
      setTimeout(() => setShareUrlCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy share URL:', err);
    }
  };

  // Handle remove product from comparison
  const handleRemoveProduct = (productId: string) => {
    removeFromCompare(productId);
    setProducts((prev) => prev.filter((p) => p._id !== productId));

    // Update URL if using URL params
    const urlProducts = searchParams.get('products');
    if (urlProducts) {
      const newIds = products
        .filter((p) => p._id !== productId)
        .map((p) => p._id);
      if (newIds.length >= 2) {
        navigate(`/compare?products=${newIds.join(',')}`, { replace: true });
      } else {
        navigate('/products');
      }
    } else if (products.length <= 2) {
      navigate('/products');
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Đang tải so sánh sản phẩm...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || products.length < 2) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <p className="text-red-500 mb-4">{error || 'Không đủ sản phẩm để so sánh'}</p>
            <Button onClick={() => navigate('/products')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Quay về danh sách sản phẩm
            </Button>
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumb and actions */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate('/products')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Quay lại
          </Button>
          <span className="text-muted-foreground">|</span>
          <h1 className="text-xl font-semibold">So sánh sản phẩm</h1>
        </div>

        {/* Share button - Requirement 6.1 */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleShare}
          className="gap-2"
        >
          {shareUrlCopied ? (
            <>
              <Check className="h-4 w-4 text-green-500" />
              Đã sao chép link
            </>
          ) : (
            <>
              <Share2 className="h-4 w-4" />
              Chia sẻ
              <Copy className="h-3 w-3" />
            </>
          )}
        </Button>
      </div>

      {/* Product header cards - Requirement 3.2 */}
      <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: `repeat(${products.length}, minmax(200px, 1fr))` }}>
        {products.map((product) => (
          <Card key={product._id} className="relative">
            {/* Remove button */}
            <button
              onClick={() => handleRemoveProduct(product._id)}
              className={cn(
                'absolute top-2 right-2 z-10 w-6 h-6 rounded-full',
                'bg-gray-100 hover:bg-red-100 text-gray-500 hover:text-red-500',
                'flex items-center justify-center transition-colors'
              )}
              aria-label={`Xóa ${product.name} khỏi so sánh`}
            >
              <X className="h-4 w-4" />
            </button>

            <CardContent className="p-4">
              {/* Product image */}
              <AspectRatio ratio={1} className="bg-muted rounded-lg mb-3 overflow-hidden">
                <img
                  src={product.image || 'https://via.placeholder.com/200x200/e5e5e5/9ca3af?text=No+Image'}
                  alt={product.name}
                  className="object-cover w-full h-full"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = 'https://via.placeholder.com/200x200/e5e5e5/9ca3af?text=No+Image';
                  }}
                />
              </AspectRatio>

              {/* Product info */}
              <div className="space-y-2">
                <Badge variant="outline" className="text-xs">
                  {product.brand.toUpperCase()}
                </Badge>
                <h3 className="font-semibold text-sm line-clamp-2 min-h-[40px]">
                  {product.name}
                </h3>

                {/* Rating */}
                <div className="flex items-center gap-1">
                  <StarRating
                    rating={product.averageRating || 0}
                    size="sm"
                  />
                  <span className="text-xs text-muted-foreground">
                    ({product.reviewCount || 0})
                  </span>
                </div>

                {/* Price */}
                <p className="text-lg font-bold text-primary">
                  {formatPrice(product.price)}
                </p>

                {/* Stock status */}
                <Badge variant={product.inStock > 0 ? 'default' : 'destructive'} className="text-xs">
                  {product.inStock > 0 ? 'Còn hàng' : 'Hết hàng'}
                </Badge>

                {/* Quick actions - Requirement 7.1, 7.2 */}
                <div className="flex flex-col gap-2 pt-2">
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={product.inStock === 0 || addingToCart[product._id]}
                    onClick={() => handleAddToCart(product)}
                  >
                    {addingToCart[product._id] ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        Đang thêm...
                      </>
                    ) : addedToCart[product._id] ? (
                      <>
                        <Check className="h-4 w-4 mr-1" />
                        Đã thêm
                      </>
                    ) : (
                      <>
                        <ShoppingCart className="h-4 w-4 mr-1" />
                        Thêm vào giỏ
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    asChild
                  >
                    <Link to={`/products/${product._id}`}>
                      <ExternalLink className="h-4 w-4 mr-1" />
                      Xem chi tiết
                    </Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Toggle differences - Requirement 4.1 */}
      <div className="flex items-center justify-between mb-4 p-4 bg-gray-50 rounded-lg">
        <span className="text-sm font-medium">Bộ lọc hiển thị</span>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showOnlyDifferences}
            onChange={(e) => setShowOnlyDifferences(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <span className="text-sm">Chỉ hiện khác biệt</span>
        </label>
      </div>

      {/* Comparison table - Requirement 3.3, 3.4, 3.5 */}
      <CompareTable
        products={products}
        showOnlyDifferences={showOnlyDifferences}
      />
    </div>
  );
};

export default ComparePage;
