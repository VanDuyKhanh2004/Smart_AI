const crypto = require("crypto");

function normalizeAddress(address) {
  if (!address) return null;
  return {
    fullName: (address.fullName || "").trim(),
    phone: (address.phone || "").trim(),
    address: (address.address || "").trim(),
    ward: (address.ward || "").trim(),
    district: (address.district || "").trim(),
    city: (address.city || "").trim(),
  };
}

function normalizePromotionCode(code) {
  if (!code || !String(code).trim()) return null;
  return String(code).trim().toUpperCase();
}

function computeCartFingerprint(cartItems) {
  const items = (cartItems || []).map((item) => ({
    product: (item.product?._id || item.product)?.toString() || "",
    quantity: Number(item.quantity) || 0,
    color: (item.color || "").trim() || null,
  }));
  items.sort((a, b) => {
    const byProduct = (a.product || "").localeCompare(b.product || "");
    if (byProduct !== 0) return byProduct;
    return (a.color || "").localeCompare(b.color || "");
  });
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(items), "utf8")
    .digest("hex");
}

function computeRequestFingerprint(userId, shippingAddress, promotionCode) {
  const canonical = JSON.stringify({
    userId: String(userId),
    shippingAddress: normalizeAddress(shippingAddress),
    promotionCode: normalizePromotionCode(promotionCode),
  });
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}

function computeCheckoutFingerprint(requestFingerprint, cartItems) {
  const canonical = JSON.stringify({
    requestFingerprint,
    cartHash: computeCartFingerprint(cartItems),
  });
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}

module.exports = {
  computeRequestFingerprint,
  computeCartFingerprint,
  computeCheckoutFingerprint,
  normalizeAddress,
  normalizePromotionCode,
};
