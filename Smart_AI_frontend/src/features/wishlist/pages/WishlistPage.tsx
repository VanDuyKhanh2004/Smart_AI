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

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => clearError(), 5000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  const isEmpty = items.length === 0;

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Heart className="h-6 w-6" />
        Sản phẩm yêu thích
        {items.length > 0 && (
          <Badge variant="secondary" className="ml-2">
            {items.length} sản phẩm
          </Badge>
        )}
      </h1>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-4 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
          {error}
        </div>
      )}

      {isEmpty && !isLoading ? (
        /* Empty Wishlist State - Requirement 3.3 */
        <div className="flex flex-col items-center justify-center py-16">
          <Heart className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Chưa có sản phẩm yêu thích</h2>
          <p className="text-muted-foreground mb-6">
            Hãy thêm sản phẩm vào danh sách yêu thích để xem lại sau.
          </p>
          <Link to="/products">
            <Button>Khám phá sản phẩm</Button>
          </Link>
        </div>
      ) : isLoading && items.length === 0 ? (
        /* Loading State */
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
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
    } catch {
      // Error handled by store
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
    } catch {
      // Error handled by store
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
              src="https://via.placeholder.com/400x300/e5e5e5/9ca3af?text=Deleted"
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
                if (productId) {
                  onRemove(productId);
                }
              }}
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
        {/* Product Image */}
        <Link to={`/products/${productId}`}>
          <div className="relative aspect-[4/3] bg-muted overflow-hidden rounded-t-lg">
            <img
              src={productData.image || 'https://via.placeholder.com/400x300/e5e5e5/9ca3af?text=No+Image'}
              alt={productData.name}
              className="w-full h-full object-cover transition-transform hover:scale-105"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = 'https://via.placeholder.com/400x300/e5e5e5/9ca3af?text=No+Image';
              }}
            />
            {/* Remove Button */}
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute top-2 right-2 bg-white/80 hover:bg-white text-muted-foreground hover:text-destructive z-10"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleRemove();
              }}
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
        </Link>

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

          {/* Color Selector - Requirement 5.2 */}
          {productData.colors && productData.colors.length > 0 && (
            <Select value={selectedColor} onValueChange={setSelectedColor}>
              <SelectTrigger className="w-full h-8 text-xs">
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
