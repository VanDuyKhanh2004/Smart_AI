import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { CartItem } from '@/types/cart.type';
import type { ShippingAddress } from '@/types/order.type';

function computeSignature(
  cartItems: CartItem[],
  shippingAddress: ShippingAddress | null,
  promotionCode: string | undefined,
): string {
  const cartPart = cartItems
    .map(i => `${i.product?._id ?? i.product}-${i.quantity}-${i.color ?? ''}`)
    .sort()
    .join(',');
  const addressPart = shippingAddress
    ? `${shippingAddress.fullName}|${shippingAddress.phone}|${shippingAddress.address}|${shippingAddress.ward}|${shippingAddress.district}|${shippingAddress.city}`
    : '';
  const promoPart = promotionCode ?? '';
  return `${cartPart}||${addressPart}||${promoPart}`;
}

export function useIdempotencyKey(
  cartItems: CartItem[],
  shippingAddress: ShippingAddress | null,
  promotionCode: string | undefined,
): { key: string; rotateKey: () => void } {
  const [key, setKey] = useState(() => crypto.randomUUID());

  const signature = useMemo(
    () => computeSignature(cartItems, shippingAddress, promotionCode),
    [cartItems, shippingAddress, promotionCode],
  );

  const isFirstRender = useRef(true);
  const prevSignatureRef = useRef(signature);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
    } else if (signature !== prevSignatureRef.current) {
      prevSignatureRef.current = signature;
      setKey(crypto.randomUUID());
    }
  }, [signature]);

  const rotateKey = useCallback(() => {
    setKey(crypto.randomUUID());
  }, []);

  return { key, rotateKey };
}
