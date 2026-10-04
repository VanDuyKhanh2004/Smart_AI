import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Trash2, ShoppingCart, Loader2, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useWishlistStore } from '@/stores/wishlistStore';
import { useAuthStore } from '@/stores/authStore';
import type { WishlistItem } from '@/types/wishlist.type';

/**
 * WishlistPage Component
 * 
 * Displays all wishlisted products in a grid layout.
 * Features:
 * - Grid display of wishlisted products
 * - Show: image, name, brand, price, stock status, addedAt
 * - Actions: Remove, Add to cart with color selector
 * - Empty state with link to products
 * - Indicate unavailable products (isActive = false)
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 5.1, 5.2
 */
const WishlistPage: React.FC = () => {
  const { isAuthenticated } = useAuthStore();
  // W4-S47: polite live region text for wishlist mutations (set only on
  // events, never derived during render)
  const [announcement, setAnnouncement] = useState('');
  const {
    items,
    isLoading,
    error,
    fetchWishlist,
    removeItem,
    moveToCart,
    clearError,
  } = useWishlistStore();

  useEffect(() => {
    if (isAuthenticated) {
      fetchWishlist();
    }
  }, [isAuthenticated, fetchWishlist]);

  // W3-11: manual retry — the load failure no longer auto-dismisses.
  const handleRetry = () => {
    if (isAuthenticated) {
      fetchWishlist();
    } else {
      clearError();
    }
  };

  const isEmpty = items.length === 0;

  return (
    <div className="py-8">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Heart className="h-6 w-6" />
        Sản phẩm yêu thích
        {items.length > 0 && (
          <Badge variant="secondary" className="ml-2">
            {items.length} sản phẩm
          </Badge>
        )}
      </h1>

      {/* W4-S47: persistent polite live region — announces remove/move
          outcomes; failures are only surfaced through the alert below */}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {/* Error Message — only shown while items are present (an empty list
          with an error renders the dedicated error state below).
          W4-S50: announced assertively; mutation failures are not repeated
          in the polite region above. */}
      {error && !isEmpty && (
        <div
          role="alert"
          className="mb-4 p-4 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm"
        >
          {error}
        </div>
      )}

      {isEmpty && !isLoading ? (
        error ? (
          /* Load failed — keep the failure visible until retried */
          <div role="alert" className="flex flex-col items-center justify-center py-16">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={handleRetry}>Thử lại</Button>
          </div>
        ) : (
          /* Empty Wishlist State - Requirement 3.3 */
          <div className="flex flex-col items-center justify-center py-16">
            <Heart className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Chưa có sản phẩm yêu thích</h2>
            <p className="text-muted-foreground mb-6">
              Hãy thêm sản phẩm vào danh sách yêu thích để xem lại sau.
            </p>
            <Button asChild>
              <Link to="/products">Khám phá sản phẩm</Link>
            </Button>
          </div>
        )
      ) : isLoading && items.length === 0 ? (
        /* Loading State — announced politely (initial load only) */
        <div className="flex items-center justify-center py-16">
          <div className="text-center" role="status">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Đang tải danh sách yêu thích...</p>
          </div>
        </div>
      ) : (
        /* Wishlist Grid - Requirement 3.1 */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {items.map((item) => (
            <WishlistItemCard
              key={item._id}
              item={item}
              onRemove={removeItem}
              onMoveToCart={moveToCart}
              isLoading={isLoading}
              onAnnounce={setAnnouncement}
            />
          ))}
        </div>
      )}
    </div>
  );
};


interface WishlistItemCardProps {
  item: WishlistItem;
  onRemove: (productId: string) => Promise<void>;
  onMoveToCart: (productId: string, color: string, removeAfterAdd?: boolean) => Promise<void>;
  isLoading: boolean;
  onAnnounce: (message: string) => void;
}

/**
 * WishlistItemCard Component
 *
 * Individual wishlist item card with product details and actions.
 */
const WishlistItemCard: React.FC<WishlistItemCardProps> = ({
  item,
  onRemove,
  onMoveToCart,
  isLoading,
  onAnnounce,
}) => {
  const { product, addedAt } = item;
  
  // Handle case where product might be null (deleted from database)
  // Also handle case where product might be a string (not populated) or object
  // Backend transforms _id to id, so we need to check both
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const productObj = product as any;
  const productId: string | undefined = typeof product === 'string' 
    ? product 
    : (productObj?._id || productObj?.id);
  const productData = typeof product === 'string' ? null : product;
  
  const [selectedColor, setSelectedColor] = useState<string>(
    productData?.colors && productData.colors.length > 0 ? productData.colors[0] : 'default'
  );
  const [isRemoving, setIsRemoving] = useState(false);
  const [isAddingToCart, setIsAddingToCart] = useState(false);

  const isOutOfStock = !productData || productData.inStock === 0;
  const isUnavailable = !productData || !productData.isActive;

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(price);
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(dateString));
  };

  const handleRemove = async () => {
    if (!productId) return;
    setIsRemoving(true);
    try {
      await onRemove(productId);
      // W4-S47: the removal outcome is announced politely
      onAnnounce(
        productData
          ? `Đã xóa ${productData.name} khỏi danh sách yêu thích.`
          : 'Đã xóa khỏi danh sách yêu thích.',
      );
    } catch {
      // W4-S50: a store failure is rendered in the visible role="alert"
      // region — only fall back to this polite region when the store has no
      // error to surface, so one failure is never announced twice.
      onAnnounce(
        useWishlistStore.getState().error
          ? ''
          : 'Không thể xóa sản phẩm khỏi danh sách yêu thích.',
      );
    } finally {
      setIsRemoving(false);
    }
  };

  // Requirement 5.1, 5.2: Add to cart with color selection
  const handleAddToCart = async () => {
    if (!productId) return;
    setIsAddingToCart(true);
    try {
      await onMoveToCart(productId, selectedColor, false);
      // W4-S47: the move-to-cart outcome is announced politely
      onAnnounce(`Đã thêm ${productData?.name ?? 'sản phẩm'} vào giỏ hàng.`);
    } catch {
      // W4-S47/S50: same dedupe rule — the store error alert is the single
      // failure channel when it is visible.
      onAnnounce(
        useWishlistStore.getState().error
          ? ''
          : 'Không thể thêm sản phẩm vào giỏ hàng.',
      );
    } finally {
      setIsAddingToCart(false);
    }
  };

  // Handle deleted products or unpopulated products
  if (!productData) {
    return (
      <Card className="h-full opacity-60">
        <CardContent className="p-0">
          <div className="relative aspect-[4/3] bg-muted overflow-hidden rounded-t-lg">
            <img
              src="/images/product-placeholder.svg"
              alt="Sản phẩm đã bị xóa"
              className="w-full h-full object-cover"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute top-2 right-2 bg-white/80 hover:bg-white text-muted-foreground hover:text-destructive z-10"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleRemove();
              }}
              // W4-S46: named icon-only remove button (the deleted product
              // has no name left to interpolate)
              aria-label="Xóa khỏi danh sách yêu thích"
              disabled={isRemoving || !productId}
            >
              {isRemoving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
            <Badge variant="destructive" className="absolute top-2 left-2 text-xs">
              Sản phẩm đã bị xóa
            </Badge>
          </div>
          <div className="p-4">
            <p className="text-sm text-muted-foreground">Sản phẩm này không còn tồn tại</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`h-full ${isUnavailable ? 'opacity-60' : ''}`}>
      <CardContent className="p-0">
        {/* Product Image — the link wraps only the image; the remove button
            stays a sibling, never nested inside the link (W3-07) */}
        <div className="relative aspect-[4/3] bg-muted overflow-hidden rounded-t-lg">
          <Link to={`/products/${productId}`} className="block h-full">
            <img
              src={productData.image || '/images/product-placeholder.svg'}
              alt={productData.name}
              className="w-full h-full object-cover transition-transform hover:scale-105"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = '/images/product-placeholder.svg';
              }}
            />
          </Link>
          {/* Remove Button — W4-S45: named icon-only remove button */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute top-2 right-2 bg-white/80 hover:bg-white text-muted-foreground hover:text-destructive z-10"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleRemove();
            }}
            aria-label={`Xóa ${productData.name} khỏi danh sách yêu thích`}
            disabled={isRemoving}
          >
            {isRemoving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
          {/* Status Badges */}
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            {isUnavailable && (
              <Badge variant="destructive" className="text-xs">
                Không còn khả dụng
              </Badge>
            )}
            {isOutOfStock && !isUnavailable && (
              <Badge variant="secondary" className="text-xs">
                Hết hàng
              </Badge>
            )}
          </div>
        </div>

        {/* Product Info */}
        <div className="p-4 space-y-3">
          <div>
            <Link to={`/products/${productId}`}>
              <h3 className="font-medium text-sm truncate hover:text-primary transition-colors">
                {productData.name}
              </h3>
            </Link>
            <p className="text-sm text-muted-foreground capitalize">{productData.brand}</p>
          </div>

          {/* Price */}
          <div className="text-lg font-bold text-primary">
            {formatPrice(productData.price)}
          </div>

          {/* Added Date - Requirement 3.2 */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>Đã thêm: {formatDate(addedAt)}</span>
          </div>

          {/* Color Selector - Requirement 5.2 — W4-S48: named trigger */}
          {productData.colors && productData.colors.length > 0 && (
            <Select value={selectedColor} onValueChange={setSelectedColor}>
              <SelectTrigger className="w-full h-8 text-xs" aria-label="Chọn màu">
                <SelectValue placeholder="Chọn màu" />
              </SelectTrigger>
              <SelectContent>
                {productData.colors.map((color) => (
                  <SelectItem key={color} value={color} className="text-xs">
                    {color}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Add to Cart Button - Requirement 5.1, 5.3 */}
          <Button
            className="w-full"
            size="sm"
            onClick={handleAddToCart}
            disabled={isOutOfStock || isUnavailable || isAddingToCart || isLoading}
          >
            {isAddingToCart ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Đang thêm...
              </>
            ) : (
              <>
                <ShoppingCart className="h-4 w-4 mr-2" />
                Thêm vào giỏ hàng
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default WishlistPage;
