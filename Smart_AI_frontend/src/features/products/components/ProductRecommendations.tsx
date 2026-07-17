import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardFooter, CardTitle } from '@/components/ui/card';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { productService } from '@/services/product.service';
import type { Product } from '@/types/product.type';

interface ProductRecommendationsProps {
  productId: string;
}

const MAX_RECOMMENDATIONS = 5;

const formatPrice = (price: number) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(price);
};

const ProductRecommendations: React.FC<ProductRecommendationsProps> = ({ productId }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRecommendations = useCallback(async () => {
    if (!productId) return;

    try {
      setLoading(true);
      setError(null);
      const response = await productService.getProductRecommendations(productId, MAX_RECOMMENDATIONS);
      setProducts(response.data.products);
    } catch (err) {
      console.error('[Recommendations] Failed to fetch:', err);
      setError('error');
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  if (!loading && (!products || products.length === 0 || error)) {
    return null;
  }

  return (
    <section className="mt-12">
      <h2 className="text-2xl font-bold mb-6">Sản phẩm tương tự</h2>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: MAX_RECOMMENDATIONS }).map((_, i) => (
            <RecommendationSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {products.map((product) => (
            <Link
              key={product._id}
              to={`/products/${product._id}`}
              className="block transition-transform hover:scale-105"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              <Card className="h-full cursor-pointer hover:shadow-lg transition-shadow">
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
                <CardHeader className="px-4 pt-4 pb-2">
                  <CardTitle className="text-sm truncate">{product.name}</CardTitle>
                  <p className="text-xs text-muted-foreground capitalize">{product.brand}</p>
                </CardHeader>
                <CardFooter className="px-4 pb-4 pt-0 flex items-center justify-between">
                  <span className="text-base font-bold text-primary">{formatPrice(product.price)}</span>
                  <Badge variant={product.inStock > 0 ? 'default' : 'destructive'} className="text-[10px] px-1.5 py-0">
                    {product.inStock > 0 ? 'Còn hàng' : 'Hết hàng'}
                  </Badge>
                </CardFooter>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
};

const RecommendationSkeleton: React.FC = () => (
  <Card className="h-full">
    <CardContent className="p-0">
      <AspectRatio ratio={4 / 3}>
        <Skeleton className="w-full h-full rounded-t-xl" />
      </AspectRatio>
    </CardContent>
    <CardHeader className="px-4 pt-4 pb-2 space-y-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-3 w-1/2" />
    </CardHeader>
    <CardFooter className="px-4 pb-4 pt-0">
      <Skeleton className="h-5 w-20" />
    </CardFooter>
  </Card>
);

export default ProductRecommendations;
