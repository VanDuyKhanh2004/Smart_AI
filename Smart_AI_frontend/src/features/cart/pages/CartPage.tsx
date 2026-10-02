import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCartStore } from '@/stores/cartStore';
import { useAuthStore } from '@/stores/authStore';
import CartItem from '../components/CartItem';
import CartSummary from '../components/CartSummary';

const formatPrice = (price: number) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(price);
};

const CartPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);
  // W4-S27: polite live region text for cart mutations (set only on events,
  // never derived during render)
  const [announcement, setAnnouncement] = useState('');
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
  } = useCartStore();

  useEffect(() => {
    if (isAuthenticated) {
      fetchCart();
    } else {
      loadFromLocalStorage();
    }
  }, [isAuthenticated, fetchCart, loadFromLocalStorage]);

  useEffect(() => {
    if (!checkoutNotice) return;

    const timer = setTimeout(() => setCheckoutNotice(null), 1500);
    return () => clearTimeout(timer);
  }, [checkoutNotice]);

  const handleUpdateQuantity = async (itemId: string, quantity: number) => {
    try {
      await updateQuantity(itemId, quantity);
      const state = useCartStore.getState();
      const item = state.items.find((i) => i._id === itemId);
      setAnnouncement(
        `Đã cập nhật số lượng ${item?.product?.name ?? 'sản phẩm'}. ${
          state.getTotalItems()
        } sản phẩm trong giỏ hàng, tạm tính ${formatPrice(state.getTotalPrice())}.`,
      );
    } catch {
      // W4-S28: a store failure is rendered in the visible role="alert"
      // region — only fall back to this polite region when the store has no
      // error to surface, so one failure is never announced twice.
      setAnnouncement(
        useCartStore.getState().error ? '' : 'Không thể cập nhật số lượng.',
      );
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    const name = items.find((i) => i._id === itemId)?.product?.name ?? 'sản phẩm';
    try {
      await removeItem(itemId);
      const state = useCartStore.getState();
      setAnnouncement(
        `Đã xóa ${name} khỏi giỏ hàng. ${
          state.getTotalItems()
        } sản phẩm trong giỏ hàng, tạm tính ${formatPrice(state.getTotalPrice())}.`,
      );
    } catch {
      setAnnouncement(
        useCartStore.getState().error ? '' : 'Không thể xóa sản phẩm.',
      );
    }
  };

  const handleClearCart = async () => {
    try {
      await clearCart();
      setAnnouncement('Đã xóa tất cả sản phẩm trong giỏ hàng.');
    } catch {
      setAnnouncement(
        useCartStore.getState().error ? '' : 'Không thể xóa giỏ hàng.',
      );
    }
  };

  const handleCheckout = () => {
    if (!isAuthenticated) {
      const notice = 'Vui lòng đăng nhập để thanh toán';
      setCheckoutNotice(notice);
      // W4-S31: announced through the persistent polite region (the visible
      // box below is transient visual feedback only)
      setAnnouncement(notice);
      setTimeout(() => {
        navigate('/login', { state: { from: '/checkout' } });
      }, 600);
      return;
    }

    navigate('/checkout');
  };

  // W3-11: manual retry — the load failure no longer auto-dismisses.
  const handleRetry = () => {
    if (isAuthenticated) {
      fetchCart();
    } else {
      loadFromLocalStorage();
    }
  };

  const totalItems = getTotalItems();
  const totalPrice = getTotalPrice();
  const isEmpty = items.length === 0;

  return (
    <div className="py-8">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <ShoppingCart className="h-6 w-6" />
        Giỏ hàng của bạn
      </h1>

      {/* W4-S27: persistent polite live region — announces cart mutations */}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {/* Error Message — only shown while cart items are present (an empty
          cart with an error renders the dedicated error state below).
          W4-S28: announced assertively; mutation failures are not repeated
          in the polite region above (see the catch blocks). */}
      {error && !isEmpty && (
        <div
          role="alert"
          className="mb-4 p-4 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm"
        >
          {error}
        </div>
      )}

      {/* W4-S31: login gate before checkout — visible notice; announced via
          the polite region above (setAnnouncement in handleCheckout) */}
      {checkoutNotice && (
        <div className="mb-4 p-4 bg-primary/10 border border-primary/20 rounded-md text-primary text-sm">
          {checkoutNotice}
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
          /* Empty Cart State */
          <div className="flex flex-col items-center justify-center py-16">
            <ShoppingCart className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Giỏ hàng trống</h2>
            <p className="text-muted-foreground mb-6">
              Bạn chưa có sản phẩm nào trong giỏ hàng.
            </p>
            <Button asChild>
              <Link to="/products">Tiếp tục mua sắm</Link>
            </Button>
          </div>
        )
      ) : (
        /* Cart Content */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8" aria-busy={isLoading}>
          {/* Cart Items */}
          <div className="lg:col-span-2 space-y-4">
            {isLoading && items.length === 0 ? (
              /* W4-S30: first-load spinner announced politely */
              <div role="status" className="flex items-center justify-center py-8">
                <div
                  className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"
                  aria-hidden="true"
                ></div>
                <span className="sr-only">Đang tải giỏ hàng...</span>
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
