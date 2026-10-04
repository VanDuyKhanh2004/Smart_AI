import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, GitCompareArrows, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCompareStore, MAX_COMPARE_ITEMS } from '@/stores/compareStore';
import { compareService } from '@/services/compare.service';
import type { Product } from '@/types/product.type';
import { cn } from '@/lib/utils';

/**
 * CompareBar Component
 * 
 * Floating bar at the bottom of the page showing products in comparison list.
 * - Shows product thumbnails with remove buttons
 * - "Xóa tất cả" button to clear all products
 * - "So sánh ngay" button to navigate to comparison page (disabled if < 2 products)
 * - Counter showing "X/4 sản phẩm"
 * 
 * Requirements: 1.4, 2.1, 2.2, 2.3, 3.1
 */
const CompareBar: React.FC = () => {
  const navigate = useNavigate();
  const { items, removeFromCompare, clearCompare } = useCompareStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // W4-S52: polite live region text for compare-list changes; the region
  // itself stays mounted even while the visual bar is hidden.
  const [announcement, setAnnouncement] = useState('');
  const prevCountRef = useRef<number | null>(null);
  // Set by in-bar actions (remove/clear) so their outcome text is used once
  // instead of the generic count transition below.
  const pendingMessageRef = useRef<string | null>(null);

  // Fetch product details when items change
  useEffect(() => {
    const fetchProducts = async () => {
      if (items.length === 0) {
        setProducts([]);
        return;
      }

      setIsLoading(true);
      try {
        const response = await compareService.getCompareProducts(items);
        if (response.success) {
          // Maintain order based on items array
          const orderedProducts = items
            .map(id => response.data.find(p => p._id === id))
            .filter((p): p is Product => p !== undefined);
          setProducts(orderedProducts);
        }
      } catch (error) {
        console.error('Failed to fetch compare products:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProducts();
  }, [items]);

  // W4-S52: announce every count change (add/remove/clear) once, through the
  // persistent polite region that outlives the bar itself.
  useEffect(() => {
    const prev = prevCountRef.current;
    prevCountRef.current = items.length;

    if (prev === null) {
      // First render with a pre-filled list (page load): announce the bar.
      if (items.length > 0) {
        setAnnouncement(`Danh sách so sánh: ${items.length}/${MAX_COMPARE_ITEMS} sản phẩm`);
      }
      return;
    }

    if (items.length === prev) return;

    if (pendingMessageRef.current) {
      setAnnouncement(pendingMessageRef.current);
      pendingMessageRef.current = null;
      return;
    }

    if (items.length > prev) {
      setAnnouncement(`Đã thêm vào danh sách so sánh. ${items.length}/${MAX_COMPARE_ITEMS} sản phẩm`);
    } else {
      setAnnouncement(`Đã xóa khỏi danh sách so sánh. ${items.length}/${MAX_COMPARE_ITEMS} sản phẩm`);
    }
  }, [items]);

  const handleRemove = (productId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Requirement 2.1: Remove product from comparison list
    const product = products.find((p) => p._id === productId);
    const nextCount = Math.max(items.length - 1, 0);
    pendingMessageRef.current = product
      ? `Đã xóa ${product.name} khỏi danh sách so sánh. ${nextCount}/${MAX_COMPARE_ITEMS} sản phẩm`
      : `Đã xóa khỏi danh sách so sánh. ${nextCount}/${MAX_COMPARE_ITEMS} sản phẩm`;
    removeFromCompare(productId);
  };

  const handleClearAll = () => {
    // Requirement 2.2: Clear all products
    pendingMessageRef.current = 'Đã xóa tất cả sản phẩm khỏi danh sách so sánh.';
    clearCompare();
  };

  const handleCompare = () => {
    // Requirement 3.1: Navigate to comparison page with at least 2 products
    if (items.length >= 2) {
      navigate(`/compare?products=${items.join(',')}`);
    }
  };

  const canCompare = items.length >= 2;

  return (
    <>
      {/* W4-S52: persistent polite region — stays mounted when the bar hides */}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {/* Requirement 2.3: Hide the visual bar when empty */}
      {items.length > 0 && (
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t shadow-lg">
        <div className="container mx-auto px-4 py-3 md:px-8">
          <div className="flex items-center justify-between gap-4">
            {/* Product thumbnails — W4-S52: busy while names are loading */}
            <div
              className="flex items-center gap-2 flex-1 min-w-0 overflow-x-auto"
              aria-busy={isLoading}
            >
            <GitCompareArrows className="h-5 w-5 text-blue-500 flex-shrink-0" />
            <span className="text-sm font-medium text-gray-600 flex-shrink-0">
              So sánh:
            </span>
            
            <div className="flex items-center gap-2">
              {isLoading ? (
                <div className="flex gap-2">
                  {items.map((id) => (
                    <div
                      key={id}
                      className="w-12 h-12 bg-gray-200 rounded animate-pulse"
                    />
                  ))}
                </div>
              ) : (
                products.map((product) => (
                  <div
                    key={product._id}
                    className="relative group flex-shrink-0"
                  >
                    <div className="w-12 h-12 border rounded overflow-hidden bg-gray-50">
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    {/* Remove button — always visible on touch (no hover) with a
                        24px minimum target */}
                    <button
                      onClick={(e) => handleRemove(product._id, e)}
                      className={cn(
                        'absolute -top-1 -right-1 h-6 w-6 rounded-full',
                        'bg-red-500 text-white flex items-center justify-center',
                        'opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 focus-visible:opacity-100 transition-opacity',
                        'hover:bg-red-600'
                      )}
                      aria-label={`Xóa ${product.name} khỏi so sánh`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    {/* Product name tooltip — W4-S53: also shown on keyboard
                        focus, not hover only */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity pointer-events-none">
                      {product.name}
                    </div>
                  </div>
                ))
              )}
              
              {/* Empty slots */}
              {Array.from({ length: MAX_COMPARE_ITEMS - items.length }).map((_, index) => (
                <div
                  key={`empty-${index}`}
                  className="w-12 h-12 border-2 border-dashed border-gray-300 rounded flex items-center justify-center flex-shrink-0"
                >
                  <span className="text-gray-500 text-xs">+</span>
                </div>
              ))}
            </div>
          </div>

          {/* Counter and actions */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Counter — hidden on small screens so the actions fit at 320px */}
            <span className="hidden sm:inline text-sm text-gray-500">
              {items.length}/{MAX_COMPARE_ITEMS} sản phẩm
            </span>

            {/* Clear all button - Requirement 2.2 — W4-S62: red-600 = 4.83:1 */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Xóa tất cả
            </Button>

            {/* Compare button - Requirement 3.1 */}
            <Button
              onClick={handleCompare}
              disabled={!canCompare}
              className="bg-blue-500 hover:bg-blue-600"
            >
              <GitCompareArrows className="h-4 w-4 mr-1" />
              So sánh ngay
            </Button>
          </div>
        </div>
      </div>
      </div>
      )}
    </>
  );
};

export default CompareBar;
