import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCartStore } from '@/stores/cartStore';
import { useAuthStore } from '@/stores/authStore';
import CartItem from '../components/CartItem';
import CartSummary from '../components/CartSummary';

const CartPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const {
    items,
    isLoading,
    error,
    getTotalItems,
    getTotalPrice,
    fetchCart,
    updateQuantity,
    removeItem,
    clearCart,
    loadFromLocalStorage,
    clearError,
  } = useCartStore();

  useEffect(() => {
    if (isAuthenticated) {
      fetchCart();
    } else {
      loadFromLocalStorage();
    }
  }, [isAuthenticated, fetchCart, loadFromLocalStorage]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => clearError(), 5000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  const handleUpdateQuantity = async (itemId: string, quantity: number) => {
    try {
      await updateQuantity(itemId, quantity);
    } catch {
      // Error is handled in store
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    try {
      await removeItem(itemId);
    } catch {
      // Error is handled in store
    }
  };

  const handleClearCart = async () => {
    try {
      await clearCart();
    } catch {
      // Error is handled in store
    }
  };

  const handleCheckout = () => {
    navigate('/checkout');
  };

  const totalItems = getTotalItems();
  const totalPrice = getTotalPrice();
  const isEmpty = items.length === 0;

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <ShoppingCart className="h-6 w-6" />
        Giỏ hàng của bạn
      </h1>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-4 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
          {error}
        </div>
      )}

      {isEmpty && !isLoading ? (
        /* Empty Cart State */
        <div className="flex flex-col items-center justify-center py-16">
          <ShoppingCart className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Giỏ hàng trống</h2>
          <p className="text-muted-foreground mb-6">
            Bạn chưa có sản phẩm nào trong giỏ hàng.
          </p>
          <Link to="/products">
            <Button>Tiếp tục mua sắm</Button>
          </Link>
        </div>
      ) : (
        /* Cart Content */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Cart Items */}
          <div className="lg:col-span-2 space-y-4">
            {isLoading && items.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              items.map((item) => (
                <CartItem
                  key={item._id}
                  item={item}
                  onUpdateQuantity={handleUpdateQuantity}
                  onRemove={handleRemoveItem}
                  isLoading={isLoading}
                />
              ))
            )}
          </div>

          {/* Cart Summary */}
          <div className="lg:col-span-1">
            <div className="sticky top-20">
              <CartSummary
                totalItems={totalItems}
                totalPrice={totalPrice}
                onClearCart={handleClearCart}
                onCheckout={handleCheckout}
                isLoading={isLoading}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CartPage;
