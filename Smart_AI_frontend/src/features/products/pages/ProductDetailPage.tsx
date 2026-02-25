import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, ShoppingCart, Loader2, Check } from 'lucide-react';
import { productService } from '@/services/product.service';
import { reviewService } from '@/services/review.service';
import { useCartStore } from '@/stores/cartStore';
import { useAuthStore } from '@/stores/authStore';
import type { Product } from '@/types/product.type';
import type { Review, ProductReviewStats } from '@/types/review.type';
import { ReviewList } from '../components/ReviewList';
import { ReviewForm } from '../components/ReviewForm';
import { QASection } from '../components/QASection';
import WishlistButton from '@/components/ui/WishlistButton';
import CompareButton from '@/components/ui/CompareButton';

const ProductDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [quantity, setQuantity] = useState(1);
  const [addingToCart, setAddingToCart] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const [cartError, setCartError] = useState<string | null>(null);

  // Review states
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewStats, setReviewStats] = useState<ProductReviewStats>({ averageRating: 0, totalCount: 0 });
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [canReview, setCanReview] = useState(false);
  const [canReviewReason, setCanReviewReason] = useState<string | undefined>();
  const [submittingReview, setSubmittingReview] = useState(false);

  const { addItem } = useCartStore();
  const { isAuthenticated } = useAuthStore();

  const fetchProduct = useCallback(async () => {
    if (!id) {
      setError('ID sản phẩm không hợp lệ');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const response = await productService.getProductById(id);
      setProduct(response.data);
      
      // Set default selected color
      if (response.data.colors && response.data.colors.length > 0) {
        setSelectedColor(response.data.colors[0]);
      }
    } catch (err) {
      setError('Không thể tải thông tin sản phẩm. Vui lòng thử lại sau.');
      console.error('Error fetching product:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProduct();
  }, [fetchProduct]);

  // Fetch reviews for the product
  const fetchReviews = useCallback(async () => {
    if (!id) return;

    try {
      setReviewsLoading(true);
      const response = await reviewService.getProductReviews(id);
      setReviews(response.data.reviews);
      setReviewStats(response.data.stats);
    } catch (err) {
      console.error('Error fetching reviews:', err);
    } finally {
      setReviewsLoading(false);
    }
  }, [id]);

  // Check if user can review the product
  const checkCanReview = useCallback(async () => {
    if (!id || !isAuthenticated) {
      setCanReview(false);
      setCanReviewReason('Bạn cần đăng nhập để đánh giá sản phẩm');
      return;
    }

    try {
      const response = await reviewService.canReviewProduct(id);
      setCanReview(response.data.canReview);
      setCanReviewReason(response.data.reason);
    } catch (err) {
      console.error('Error checking can review:', err);
      setCanReview(false);
    }
  }, [id, isAuthenticated]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  useEffect(() => {
    checkCanReview();
  }, [checkCanReview]);

  // Handle review submission
  const handleSubmitReview = async (rating: number, comment?: string) => {
    if (!id) return;

    setSubmittingReview(true);
    try {
      await reviewService.createReview({
        productId: id,
        rating,
        comment,
      });
      // Refresh reviews and can-review status after successful submission
      await fetchReviews();
      await checkCanReview();
    } catch (err) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      throw new Error(axiosError.response?.data?.message || 'Không thể gửi đánh giá');
    } finally {
      setSubmittingReview(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(price);
  };

  const handleAddToCart = async () => {
    if (!product) return;
    
    // Check if color is required but not selected
    const hasColors = product.colors && product.colors.length > 0;
    if (hasColors && !selectedColor) return;

    // Use selected color or default to 'default' for products without colors
    const colorToUse = selectedColor || 'default';

    // Check stock before adding
    if (quantity > product.inStock) {
      setCartError(`Chỉ còn ${product.inStock} sản phẩm trong kho`);
      return;
    }

    setAddingToCart(true);
    setCartError(null);
    setAddedToCart(false);

    try {
      if (isAuthenticated) {
        // For authenticated users, call API
        await addItem(product._id, quantity, colorToUse);
      } else {
        // For guest users, update store state directly and save to localStorage
        const currentItems = useCartStore.getState().items;
        const existingIndex = currentItems.findIndex(
          (item) => {
            const itemProductId = item.product?._id || (item as unknown as { productId: string }).productId;
            return itemProductId === product._id && item.color === colorToUse;
          }
        );

        let newItems;
        if (existingIndex >= 0) {
          // Update existing item quantity
          newItems = currentItems.map((item, index) => 
            index === existingIndex 
              ? { ...item, quantity: item.quantity + quantity }
              : item
          );
        } else {
          // Add new item with product info for badge display
          newItems = [...currentItems, {
            _id: `local-${Date.now()}`,
            product: product,
            quantity,
            color: colorToUse,
            addedAt: new Date().toISOString(),
          }];
        }

        // Update store state
        useCartStore.getState().setItems(newItems);
        
        // Save to localStorage
        const localCartItems = newItems.map((item) => ({
          productId: item.product?._id || (item as unknown as { productId: string }).productId,
          quantity: item.quantity,
          color: item.color,
        }));
        localStorage.setItem('guestCart', JSON.stringify(localCartItems));
      }

      setAddedToCart(true);
      // Reset success state after 2 seconds
      setTimeout(() => setAddedToCart(false), 2000);
    } catch (err) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setCartError(axiosError.response?.data?.message || 'Không thể thêm vào giỏ hàng');
    } finally {
      setAddingToCart(false);
    }
  };

  const renderSpecsTable = () => {
    if (!product?.specs) return null;

    const specsData = [];

    // Screen specs
    if (product.specs.screen) {
      if (product.specs.screen.size) specsData.push(['Kích thước màn hình', product.specs.screen.size]);
      if (product.specs.screen.technology) specsData.push(['Công nghệ màn hình', product.specs.screen.technology]);
      if (product.specs.screen.resolution) specsData.push(['Độ phân giải', product.specs.screen.resolution]);
    }

    // Processor specs
    if (product.specs.processor) {
      if (product.specs.processor.chipset) specsData.push(['Chipset', product.specs.processor.chipset]);
      if (product.specs.processor.cpu) specsData.push(['CPU', product.specs.processor.cpu]);
      if (product.specs.processor.gpu) specsData.push(['GPU', product.specs.processor.gpu]);
    }

    // Memory specs
    if (product.specs.memory) {
      if (product.specs.memory.ram) specsData.push(['RAM', product.specs.memory.ram]);
      if (product.specs.memory.storage) specsData.push(['Bộ nhớ trong', product.specs.memory.storage]);
    }

    // Camera specs
    if (product.specs.camera) {
      if (product.specs.camera.rear?.primary) specsData.push(['Camera chính', product.specs.camera.rear.primary]);
      if (product.specs.camera.rear?.secondary) specsData.push(['Camera phụ', product.specs.camera.rear.secondary]);
      if (product.specs.camera.front) specsData.push(['Camera selfie', product.specs.camera.front]);
    }

    // Battery specs
    if (product.specs.battery) {
      if (product.specs.battery.capacity) specsData.push(['Dung lượng pin', product.specs.battery.capacity]);
      if (product.specs.battery.charging?.wired) specsData.push(['Sạc có dây', product.specs.battery.charging.wired]);
      if (product.specs.battery.charging?.wireless) specsData.push(['Sạc không dây', product.specs.battery.charging.wireless]);
    }

    // Other specs
    if (product.specs.os) specsData.push(['Hệ điều hành', product.specs.os]);
    if (product.specs.dimensions) specsData.push(['Kích thước', product.specs.dimensions]);
    if (product.specs.weight) specsData.push(['Trọng lượng', product.specs.weight]);

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Thông số</TableHead>
            <TableHead>Chi tiết</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {specsData.map(([key, value], index) => (
            <TableRow key={index}>
              <TableCell className="font-medium">{key}</TableCell>
              <TableCell>{value}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Đang tải thông tin sản phẩm...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <p className="text-red-500 mb-4">{error || 'Không tìm thấy sản phẩm'}</p>
            <div className="space-x-4">
              <Button onClick={() => fetchProduct()} variant="outline">
                Thử lại
              </Button>
              <Button onClick={() => navigate('/products')}>
                Quay về danh sách
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/products')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Quay lại danh sách
        </Button>
        <span className="text-muted-foreground">|</span>
        <Link to="/products" className="text-muted-foreground hover:text-foreground">
          Sản phẩm
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">{product.name}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Product Image */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <AspectRatio ratio={4 / 3} className="bg-muted">
                <img
                  src={product.image || 'https://via.placeholder.com/600x450/e5e5e5/9ca3af?text=No+Image'}
                  alt={product.name}
                  className="object-cover w-full h-full rounded-lg"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = 'https://via.placeholder.com/600x450/e5e5e5/9ca3af?text=No+Image';
                  }}
                />
              </AspectRatio>
            </CardContent>
          </Card>
        </div>

        {/* Product Info */}
        <div className="space-y-6">
          <div>
            <Badge variant="outline" className="mb-2">
              {product.brand.toUpperCase()}
            </Badge>
            <h1 className="text-3xl font-bold mb-4">{product.name}</h1>
            <div className="flex items-center gap-4 mb-4">
              <span className="text-4xl font-bold text-primary">
                {formatPrice(product.price)}
              </span>
              <Badge variant={product.inStock > 0 ? "default" : "destructive"}>
                {product.inStock > 0 ? `Còn ${product.inStock} sản phẩm` : 'Hết hàng'}
              </Badge>
            </div>
          </div>

          {/* Color Selection */}
          {product.colors && product.colors.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-3">Màu sắc:</h3>
              <div className="flex flex-wrap gap-2">
                {product.colors.map((color) => (
                  <button
                    key={color}
                    onClick={() => setSelectedColor(color)}
                    className={`px-3 py-2 rounded-md border text-sm font-medium transition-colors ${
                      selectedColor === color
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background hover:bg-accent'
                    }`}
                  >
                    {color}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quantity */}
          <div>
            <h3 className="text-sm font-medium mb-3">Số lượng:</h3>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
              >
                -
              </Button>
              <span className="w-12 text-center font-medium">{quantity}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setQuantity(Math.min(product.inStock, quantity + 1))}
                disabled={quantity >= product.inStock}
              >
                +
              </Button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            {cartError && (
              <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                {cartError}
              </div>
            )}
            <Button 
              className="w-full" 
              size="lg"
              disabled={product.inStock === 0 || addingToCart || (product.colors && product.colors.length > 0 && !selectedColor)}
              onClick={handleAddToCart}
            >
              {addingToCart ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Đang thêm...
                </>
              ) : addedToCart ? (
                <>
                  <Check className="h-5 w-5 mr-2" />
                  Đã thêm vào giỏ hàng
                </>
              ) : (
                <>
                  <ShoppingCart className="h-5 w-5 mr-2" />
                  Thêm vào giỏ hàng
                </>
              )}
            </Button>
            <div className="flex gap-2">
              {/* CompareButton - Requirements: 1.1 */}
              <CompareButton
                productId={product._id}
                size="lg"
                variant="outline"
                className="flex-1"
                showText={true}
              />
              {/* WishlistButton - Requirements: 7.2 */}
              <WishlistButton
                productId={product._id}
                size="lg"
                variant="outline"
                className="flex-1"
                showText={true}
              />
            </div>
          </div>

          {/* Tags */}
          {product.tags && product.tags.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-3">Tags:</h3>
              <div className="flex flex-wrap gap-2">
                {product.tags.map((tag, index) => (
                  <Badge key={index} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Product Details Tabs */}
      <Card>
        <CardContent className="p-6">
          <Tabs defaultValue="description" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="description">Mô tả</TabsTrigger>
              <TabsTrigger value="specs">Thông số kỹ thuật</TabsTrigger>
              <TabsTrigger value="reviews">
                Đánh giá {reviewStats.totalCount > 0 && `(${reviewStats.totalCount})`}
              </TabsTrigger>
              <TabsTrigger value="qa">Hỏi đáp</TabsTrigger>
            </TabsList>
            
            <TabsContent value="description" className="mt-6">
              <div className="prose max-w-none">
                <p className="text-muted-foreground leading-relaxed">
                  {product.description}
                </p>
              </div>
            </TabsContent>
            
            <TabsContent value="specs" className="mt-6">
              {renderSpecsTable()}
            </TabsContent>

            <TabsContent value="reviews" className="mt-6 space-y-6">
              {/* Review Form - only show if user can review */}
              <ReviewForm
                canReview={canReview}
                canReviewReason={canReviewReason}
                onSubmit={handleSubmitReview}
                isSubmitting={submittingReview}
              />
              
              {/* Review List */}
              <ReviewList
                reviews={reviews}
                stats={reviewStats}
                isLoading={reviewsLoading}
              />
            </TabsContent>

            <TabsContent value="qa" className="mt-6">
              {/* Q&A Section - Requirements: 2.1 */}
              <QASection productId={id!} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProductDetailPage;
