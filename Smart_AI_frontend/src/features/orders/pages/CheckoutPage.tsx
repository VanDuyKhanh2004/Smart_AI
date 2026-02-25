import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ShoppingBag, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCartStore } from '@/stores/cartStore';
import { useAuthStore } from '@/stores/authStore';
import { orderService } from '@/services/order.service';
import { addressService } from '@/services/address.service';
import CheckoutForm from '../components/CheckoutForm';
import OrderSummary from '../components/OrderSummary';
import { AddressSelector } from '@/features/addresses';
import { PromotionInput } from '@/features/checkout';
import type { ShippingAddress } from '@/types/order.type';
import type { Address, CreateAddressRequest } from '@/types/address.type';
import type { Promotion } from '@/types/promotion.type';

const SHIPPING_FEE = 30000; // 30,000 VND

interface AppliedPromotion {
  promotion: Promotion;
  discountAmount: number;
}

const CheckoutPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const { items, fetchCart, clearCart } = useCartStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Address state
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(true);
  const [useManualEntry, setUseManualEntry] = useState(false);
  
  // Promotion state
  const [appliedPromotion, setAppliedPromotion] = useState<AppliedPromotion | null>(null);

  // Calculate subtotal for promotion validation
  const subtotal = useMemo(() => {
    return items.reduce((total, item) => total + item.product.price * item.quantity, 0);
  }, [items]);

  // Order total for promotion validation (subtotal + shipping)
  const orderTotalForPromotion = subtotal + SHIPPING_FEE;

  // Promotion handlers
  const handleApplyPromotion = useCallback((promo: AppliedPromotion) => {
    setAppliedPromotion(promo);
  }, []);

  const handleRemovePromotion = useCallback(() => {
    setAppliedPromotion(null);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: '/checkout' } });
      return;
    }
    fetchCart();
  }, [isAuthenticated, fetchCart, navigate]);

  // Fetch saved addresses on mount (Requirements 6.1)
  useEffect(() => {
    const loadAddresses = async () => {
      if (!isAuthenticated) return;
      
      try {
        setIsLoadingAddresses(true);
        const response = await addressService.getAddresses();
        setAddresses(response.data);
      } catch (err) {
        console.error('Failed to load addresses:', err);
        // Don't show error - just fall back to manual entry
      } finally {
        setIsLoadingAddresses(false);
      }
    };

    loadAddresses();
  }, [isAuthenticated]);


  useEffect(() => {
    // Redirect to cart if empty
    if (!isLoading && items.length === 0) {
      navigate('/cart');
    }
  }, [items, isLoading, navigate]);

  // Handle address selection (Requirements 6.3)
  const handleSelectAddress = useCallback((address: Address | null) => {
    setSelectedAddress(address);
    setUseManualEntry(false);
  }, []);

  // Handle using a new address (Requirements 6.4, 6.5)
  const handleUseNewAddress = async (
    shippingAddress: ShippingAddress,
    saveAddress: boolean,
    addressData?: CreateAddressRequest
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      // Save address if requested (Requirements 6.5)
      if (saveAddress && addressData) {
        try {
          await addressService.createAddress(addressData);
        } catch (saveErr) {
          console.error('Failed to save address:', saveErr);
          // Continue with order even if save fails
        }
      }

      // Create order with the new address and promotion if applied
      const response = await orderService.createOrder({ 
        shippingAddress,
        promotionCode: appliedPromotion?.promotion.code,
      });
      
      // Clear cart after successful order
      await clearCart();
      
      // Navigate to order confirmation/history
      navigate(`/orders`, { 
        state: { 
          orderCreated: true, 
          orderNumber: response.data.orderNumber 
        } 
      });
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setError(
        axiosError.response?.data?.message || 
        'Đã xảy ra lỗi khi đặt hàng. Vui lòng thử lại.'
      );
      setIsLoading(false);
    }
  };

  // Handle order submission with selected saved address
  const handleSubmitWithSavedAddress = async () => {
    if (!selectedAddress) return;

    setIsLoading(true);
    setError(null);

    try {
      const shippingAddress: ShippingAddress = {
        fullName: selectedAddress.fullName,
        phone: selectedAddress.phone,
        address: selectedAddress.address,
        ward: selectedAddress.ward,
        district: selectedAddress.district,
        city: selectedAddress.city,
      };

      const response = await orderService.createOrder({ 
        shippingAddress,
        promotionCode: appliedPromotion?.promotion.code,
      });
      
      // Clear cart after successful order
      await clearCart();
      
      // Navigate to order confirmation/history
      navigate(`/orders`, { 
        state: { 
          orderCreated: true, 
          orderNumber: response.data.orderNumber 
        } 
      });
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setError(
        axiosError.response?.data?.message || 
        'Đã xảy ra lỗi khi đặt hàng. Vui lòng thử lại.'
      );
      setIsLoading(false);
    }
  };

  // Handle manual form submission (fallback for users without saved addresses)
  const handleManualSubmit = async (shippingAddress: ShippingAddress) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await orderService.createOrder({ 
        shippingAddress,
        promotionCode: appliedPromotion?.promotion.code,
      });
      
      // Clear cart after successful order
      await clearCart();
      
      // Navigate to order confirmation/history
      navigate(`/orders`, { 
        state: { 
          orderCreated: true, 
          orderNumber: response.data.orderNumber 
        } 
      });
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setError(
        axiosError.response?.data?.message || 
        'Đã xảy ra lỗi khi đặt hàng. Vui lòng thử lại.'
      );
      setIsLoading(false);
    }
  };


  if (items.length === 0 && !isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center justify-center py-16">
          <ShoppingBag className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Giỏ hàng trống</h2>
          <p className="text-muted-foreground mb-6">
            Bạn cần thêm sản phẩm vào giỏ hàng trước khi thanh toán.
          </p>
          <Link to="/products">
            <Button>Tiếp tục mua sắm</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Determine if we should show AddressSelector or CheckoutForm
  const showAddressSelector = !isLoadingAddresses && addresses.length > 0 && !useManualEntry;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Link 
          to="/cart" 
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Quay lại giỏ hàng
        </Link>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShoppingBag className="h-6 w-6" />
          Thanh toán
        </h1>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Address Selection / Checkout Form */}
        <div>
          {isLoadingAddresses ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : showAddressSelector ? (
            <div className="space-y-4">
              {/* AddressSelector for users with saved addresses (Requirements 6.1, 6.2) */}
              <AddressSelector
                addresses={addresses}
                selectedAddress={selectedAddress}
                onSelectAddress={handleSelectAddress}
                onUseNewAddress={handleUseNewAddress}
                isLoading={isLoading}
                canSaveAddress={true}
              />
              
              {/* Order button when using saved address */}
              {selectedAddress && (
                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleSubmitWithSavedAddress}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <span className="animate-spin mr-2">⏳</span>
                      Đang xử lý...
                    </>
                  ) : (
                    'Đặt hàng'
                  )}
                </Button>
              )}
            </div>
          ) : (
            /* CheckoutForm for users without saved addresses or manual entry */
            <CheckoutForm onSubmit={handleManualSubmit} isLoading={isLoading} />
          )}
        </div>

        {/* Order Summary and Promotion */}
        <div>
          <div className="sticky top-20 space-y-4">
            {/* Promotion Input - Requirements 3.1, 3.7, 4.1 */}
            <div className="p-4 border rounded-lg bg-card">
              <PromotionInput
                orderTotal={orderTotalForPromotion}
                appliedPromotion={appliedPromotion}
                onApplyPromotion={handleApplyPromotion}
                onRemovePromotion={handleRemovePromotion}
                disabled={isLoading}
              />
            </div>
            
            <OrderSummary 
              items={items} 
              shippingFee={SHIPPING_FEE}
              discountAmount={appliedPromotion?.discountAmount ?? 0}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckoutPage;
