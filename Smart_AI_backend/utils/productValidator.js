/**
 * Validate a product object against all hard constraints.
 *
 * This is the final gate before response formatting — it catches any
 * product that might have slipped through MongoDB-level filtering
 * (e.g. RAM/storage/color which are complex to filter at query time).
 *
 * Returns true if the product satisfies ALL constraints.
 */

/** Parse "8 GB" → 8, "256 GB" → 256, null → null */
function parseGB(str) {
  if (!str || typeof str !== 'string') return null;
  const m = str.match(/(\d+)\s*gb/i);
  return m ? parseInt(m[1], 10) : null;
}

/** Normalize a product color name to a standard canonical form */
function normalizeProductColor(colorName) {
  if (!colorName) return null;
  const low = colorName.toLowerCase().trim();

  const COLOR_MAP = [
    { canonical: 'black', tests: [/đen/, /black/, /den/, /titanium\s*(black|đen)/, /night/, /midnight/, /space/, /graphite/, /obsidian/, /onyx/] },
    { canonical: 'white', tests: [/trắng/, /white/, /trang/, /starlight/, /pearl/, /snow/, /cream/] },
    { canonical: 'blue', tests: [/xanh/, /blue/, /xanh dương/, /xanh nước biển/, /sierra/, /navy/, /ocean/, /azure/, /sky/] },
    { canonical: 'red', tests: [/đỏ/, /red/, /do/, /coral/, /ruby/, /rose/, /cherry/, /wine/] },
    { canonical: 'gold', tests: [/vàng/, /gold/, /vang/, /golden/, /sand/, /champagne/, /honey/] },
    { canonical: 'silver', tests: [/bạc/, /silver/, /bac/, /platinum/, /stainless/, /titanium\s*(silver|bạc)/, /white\s*titanium/] },
    { canonical: 'gray', tests: [/xám/, /gray/, /grey/, /xam/, /graphite/, /space\s*gray/, /space\s*grey/, /titanium\s*(gray|xám)/, /natural\s*titanium/] },
    { canonical: 'purple', tests: [/tím/, /purple/, /tim/, /violet/, /lavender/, /lilac/, /mauve/] },
    { canonical: 'pink', tests: [/hồng/, /pink/, /hong/, /rose/, /blush/, /coral/] },
  ];

  for (const entry of COLOR_MAP) {
    for (const test of entry.tests) {
      if (test.test(low)) return entry.canonical;
    }
  }
  return null;
}

/** Check if a product's color array matches any of the requested colors */
function matchesColor(product, requestedColors) {
  if (!requestedColors || requestedColors.length === 0) return true;
  if (!product.specs || !Array.isArray(product.specs.colors)) return false;
  const productColors = product.specs.colors.map(normalizeProductColor).filter(Boolean);
  return requestedColors.some(req => productColors.includes(req));
}

/** Check if product RAM matches the constraints */
function matchesRAM(product, filters) {
  if (!filters) return true;
  const { ramGB, minRamGB, maxRamGB } = filters;
  if (!ramGB && minRamGB == null && maxRamGB == null) return true;

  const productRam = parseGB(product.specs?.memory?.ram);
  if (productRam == null) return false;

  // Exact alternatives
  if (Array.isArray(ramGB) && ramGB.length > 0) {
    // If alternatives specified, at least one must match
    if (!ramGB.includes(productRam)) return false;
  }

  // Min / max
  if (minRamGB != null && productRam < minRamGB) return false;
  if (maxRamGB != null && productRam > maxRamGB) return false;

  return true;
}

/** Check if product storage matches the constraints */
function matchesStorage(product, filters) {
  if (!filters) return true;
  const { storageGB, minStorageGB, maxStorageGB } = filters;
  if (!storageGB && minStorageGB == null && maxStorageGB == null) return true;

  const productStorage = parseGB(product.specs?.memory?.storage);
  if (productStorage == null) return false;

  if (Array.isArray(storageGB) && storageGB.length > 0) {
    if (!storageGB.includes(productStorage)) return false;
  }

  if (minStorageGB != null && productStorage < minStorageGB) return false;
  if (maxStorageGB != null && productStorage > maxStorageGB) return false;

  return true;
}

/** Main validation function */
function matchesProductConstraints(product, filters) {
  if (!filters) return true;
  if (!product) return false;

  // Price (already handled in MongoDB, but double-check)
  if (filters.minPrice != null && product.price < filters.minPrice) return false;
  if (filters.maxPrice != null && product.price > filters.maxPrice) return false;

  // Brand
  if (Array.isArray(filters.brands) && filters.brands.length > 0) {
    const productBrand = (product.brand || '').toLowerCase();
    if (!filters.brands.includes(productBrand)) return false;
  }

  // Excluded brands
  if (Array.isArray(filters.excludedBrands) && filters.excludedBrands.length > 0) {
    const productBrand = (product.brand || '').toLowerCase();
    if (filters.excludedBrands.includes(productBrand)) return false;
  }

  // Stock
  if (filters.inStock === true && product.inStock <= 0) return false;
  if (filters.inStock === false && product.inStock > 0) return false;

  // RAM
  if (!matchesRAM(product, filters)) return false;

  // Storage
  if (!matchesStorage(product, filters)) return false;

  // isActive (defense-in-depth — MongoDB always filters isActive:true in production)
  if (product.isActive === false) return false;

  // Colors
  if (!matchesColor(product, filters.colors)) return false;

  return true;
}

module.exports = { matchesProductConstraints, parseGB, normalizeProductColor };
