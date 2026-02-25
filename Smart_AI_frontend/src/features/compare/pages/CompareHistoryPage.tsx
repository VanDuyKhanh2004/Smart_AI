import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { History, Trash2, Loader2, Calendar, ArrowRight, GitCompare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { compareService } from '@/services/compare.service';
import { useAuthStore } from '@/stores/authStore';
import type { CompareHistory } from '@/types/compare.type';

/**
 * CompareHistoryPage Component
 *
 * Displays user's comparison history with:
 * - List of previous comparisons sorted by date descending
 * - Product thumbnails and names for each comparison
 * - Comparison date
 * - Click to view comparison
 * - Delete button for each item
 *
 * Requirements: 5.3, 5.4, 5.5, 5.6
 */
const CompareHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  const [historyItems, setHistoryItems] = useState<CompareHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Fetch comparison history on mount
  useEffect(() => {
    const fetchHistory = async () => {
      if (!isAuthenticated) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const response = await compareService.getHistory();
        if (response.success) {
          setHistoryItems(response.data);
        } else {
          setError('Không thể tải lịch sử so sánh');
        }
      } catch (err) {
        console.error('Failed to fetch comparison history:', err);
        setError('Không thể tải lịch sử so sánh. Vui lòng thử lại sau.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, [isAuthenticated]);


  // Handle delete comparison - Requirement 5.6
  const handleDelete = async (id: string) => {
    try {
      setDeletingId(id);
      const response = await compareService.deleteFromHistory(id);
      if (response.success) {
        setHistoryItems((prev) => prev.filter((item) => item._id !== id));
      } else {
        setError('Không thể xóa lịch sử so sánh');
      }
    } catch (err) {
      console.error('Failed to delete comparison:', err);
      setError('Không thể xóa lịch sử so sánh. Vui lòng thử lại sau.');
    } finally {
      setDeletingId(null);
    }
  };

  // Handle view comparison - Requirement 5.5
  const handleViewComparison = (item: CompareHistory) => {
    const productIds = item.products.map((p) => p._id || p.id || '').join(',');
    navigate(`/compare?products=${productIds}`);
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateString));
  };

  // Not authenticated state
  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center justify-center py-16">
          <History className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Vui lòng đăng nhập</h2>
          <p className="text-muted-foreground mb-6">
            Bạn cần đăng nhập để xem lịch sử so sánh sản phẩm.
          </p>
          <Link to="/login">
            <Button>Đăng nhập</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <History className="h-6 w-6" />
          Lịch sử so sánh
        </h1>
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Đang tải lịch sử so sánh...</p>
          </div>
        </div>
      </div>
    );
  }

  const isEmpty = historyItems.length === 0;

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <History className="h-6 w-6" />
        Lịch sử so sánh
        {historyItems.length > 0 && (
          <Badge variant="secondary" className="ml-2">
            {historyItems.length} so sánh
          </Badge>
        )}
      </h1>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-4 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
          {error}
        </div>
      )}

      {isEmpty ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-16">
          <GitCompare className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Chưa có lịch sử so sánh</h2>
          <p className="text-muted-foreground mb-6">
            Hãy so sánh các sản phẩm để xem lại sau.
          </p>
          <Link to="/products">
            <Button>Khám phá sản phẩm</Button>
          </Link>
        </div>
      ) : (
        /* History List - Requirement 5.3, 5.4 */
        <div className="space-y-4">
          {historyItems.map((item) => (
            <CompareHistoryCard
              key={item._id}
              item={item}
              onView={() => handleViewComparison(item)}
              onDelete={() => handleDelete(item._id)}
              isDeleting={deletingId === item._id}
              formatDate={formatDate}
            />
          ))}
        </div>
      )}
    </div>
  );
};


interface CompareHistoryCardProps {
  item: CompareHistory;
  onView: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  formatDate: (dateString: string) => string;
}

/**
 * CompareHistoryCard Component
 *
 * Individual history item card showing:
 * - Product thumbnails
 * - Product names
 * - Comparison date
 * - View and delete actions
 */
const CompareHistoryCard: React.FC<CompareHistoryCardProps> = ({
  item,
  onView,
  onDelete,
  isDeleting,
  formatDate,
}) => {
  const { products, createdAt } = item;

  // Format price in VND
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(price);
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          {/* Product Thumbnails - Requirement 5.4 */}
          <div className="flex gap-2 flex-shrink-0">
            {products.map((product) => (
              <div
                key={product._id || product.id}
                className="w-16 h-16 md:w-20 md:h-20 rounded-lg overflow-hidden bg-muted flex-shrink-0"
              >
                <AspectRatio ratio={1}>
                  <img
                    src={
                      product.image ||
                      'https://via.placeholder.com/80x80/e5e5e5/9ca3af?text=No+Image'
                    }
                    alt={product.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src =
                        'https://via.placeholder.com/80x80/e5e5e5/9ca3af?text=No+Image';
                    }}
                  />
                </AspectRatio>
              </div>
            ))}
          </div>

          {/* Product Names and Info - Requirement 5.4 */}
          <div className="flex-grow min-w-0">
            <div className="flex flex-wrap gap-2 mb-2">
              {products.map((product, index) => (
                <React.Fragment key={product._id || product.id}>
                  <Link
                    to={`/products/${product._id || product.id}`}
                    className="text-sm font-medium hover:text-primary transition-colors truncate max-w-[150px]"
                    title={product.name}
                  >
                    {product.name}
                  </Link>
                  {index < products.length - 1 && (
                    <span className="text-muted-foreground">vs</span>
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Price Range */}
            <div className="text-sm text-muted-foreground mb-2">
              {products.length > 0 && (
                <span>
                  Giá từ{' '}
                  <span className="font-medium text-foreground">
                    {formatPrice(Math.min(...products.map((p) => p.price)))}
                  </span>
                  {' - '}
                  <span className="font-medium text-foreground">
                    {formatPrice(Math.max(...products.map((p) => p.price)))}
                  </span>
                </span>
              )}
            </div>

            {/* Date - Requirement 5.4 */}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>So sánh lúc: {formatDate(createdAt)}</span>
            </div>
          </div>

          {/* Actions - Requirement 5.5, 5.6 */}
          <div className="flex gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={onView}
              className="gap-1"
            >
              Xem lại
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              disabled={isDeleting}
              className="text-muted-foreground hover:text-destructive"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CompareHistoryPage;
