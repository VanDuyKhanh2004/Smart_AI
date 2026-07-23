/**
 * Deterministic product ranking for soft preference ordering.
 *
 * After hard constraint filtering, rankProducts() scores and sorts
 * candidates so that the user's soft preferences (camera, battery,
 * performance, compact) are reflected in the final order.
 *
 * All functions are pure — no I/O, no randomness, no mutations.
 */

/** Parse a numeric value from a spec string. */
function parseNumber(str) {
  if (!str || typeof str !== 'string') return null;
  const m = str.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

/** Safely get a nested property from an object. */
function get(obj, path) {
  const parts = path.split('.');
  let curr = obj;
  for (const p of parts) {
    if (curr == null || typeof curr !== 'object') return undefined;
    curr = curr[p];
  }
  return curr;
}

/** Check if an array-like field has at least one truthy item. */
function hasItems(val) {
  return Array.isArray(val) && val.length > 0 && val.some(Boolean);
}

/** Check if a string field is non-empty after trimming. */
function hasContent(val) {
  return typeof val === 'string' && val.trim().length > 0;
}

/** Clamp a number between min and max. */
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/* ------------------------------------------------------------------ */
/*  Signal extraction                                                  */
/* ------------------------------------------------------------------ */

/**
 * Extract raw, typed signals from a product document.
 * Returns null for missing/invalid values.
 */
function extractProductSignals(product) {
  if (!product || typeof product !== 'object') return null;
  const s = product.specs || {};

  // Camera
  const rearPrimary = get(s, 'camera.rear.primary');
  const rearSecondary = get(s, 'camera.rear.secondary');
  const rearTertiary = get(s, 'camera.rear.tertiary');
  const rearLenses = [rearPrimary, rearSecondary, rearTertiary].filter(Boolean);
  const cameraFeatures = get(s, 'camera.features');
  const featureList = Array.isArray(cameraFeatures) ? cameraFeatures : [];
  const frontCam = get(s, 'camera.front');

  const signals = {
    camera: {
      rearPrimaryMP: parseNumber(rearPrimary),
      rearLensCount: rearLenses.length,
      featureCount: featureList.length,
      hasOIS: featureList.some(f => /OIS|chống rung|ổn định hình ảnh|optical stabilization/i.test(f)),
      hasTelephoto: featureList.some(f => /telephoto|tele|zoom quang|optical zoom|periscope/i.test(f)) ||
                    /telephoto|tele|periscope|zoom/i.test(rearSecondary || '') ||
                    /telephoto|tele|periscope|zoom/i.test(rearTertiary || ''),
      frontMP: parseNumber(frontCam),
    },
    battery: {
      capacityMAh: parseNumber(get(s, 'battery.capacity')),
      wiredWatts: parseNumber(get(s, 'battery.charging.wired')),
      hasWireless: hasContent(get(s, 'battery.charging.wireless')),
    },
    performance: {
      ramGB: parseNumber(get(s, 'memory.ram')),
      storageGB: parseNumber(get(s, 'memory.storage')),
      hasChipset: hasContent(get(s, 'processor.chipset')),
      hasCPU: hasContent(get(s, 'processor.cpu')),
      hasGPU: hasContent(get(s, 'processor.gpu')),
    },
    compact: {
      screenSizeInches: parseNumber(get(s, 'screen.size')),
      weightGrams: parseNumber(get(s, 'weight')),
    },
    general: {
      price: typeof product.price === 'number' ? product.price : null,
      inStock: typeof product.inStock === 'number' ? product.inStock : 0,
    },
  };

  return signals;
}

/* ------------------------------------------------------------------ */
/*  Component scoring (each 0-5)                                       */
/* ------------------------------------------------------------------ */

/**
 * Camera score (0-5).
 * Signals: rear MP, lens count, OIS, telephoto, feature count, front MP.
 */
function scoreCamera(signals) {
  if (!signals) return 0;
  const c = signals.camera;
  let score = 0;

  // Rear primary MP (0-2): 200 MP → 2, 100 MP → 1, 48 MP → 0.48, 12 MP → 0.12
  if (c.rearPrimaryMP != null) {
    score += clamp(c.rearPrimaryMP / 100, 0, 2);
  }

  // Lens count (0-1): 3 lenses → 0.67, 2 lenses → 0.33, 1 → 0
  if (c.rearLensCount > 0) {
    score += clamp((c.rearLensCount - 1) / 3, 0, 1);
  }

  // OIS keyword +0.5
  if (c.hasOIS) score += 0.5;

  // Telephoto/periscope keyword +0.5
  if (c.hasTelephoto) score += 0.5;

  // Feature count (0-0.5)
  if (c.featureCount > 0) {
    score += clamp(c.featureCount / 10, 0, 0.5);
  }

  // Front MP (0-0.3)
  if (c.frontMP != null) {
    score += clamp(c.frontMP / 40, 0, 0.3);
  }

  // Battery/charging keywords in camera features should not help camera score

  return clamp(score, 0, 5);
}

/**
 * Battery score (0-5).
 * Signals: mAh, wired watts, wireless charging.
 */
function scoreBattery(signals) {
  if (!signals) return 0;
  const b = signals.battery;
  let score = 0;

  // Capacity (0-3): 6000 mAh → 3, 5000 → 2.5, 4000 → 2, 3000 → 1.5
  if (b.capacityMAh != null) {
    score += clamp(b.capacityMAh / 2000, 0, 3);
  }

  // Wired charging (0-1.5): 100W → 1.5, 45W → 0.675, 20W → 0.3
  if (b.wiredWatts != null) {
    score += clamp(b.wiredWatts / 100, 0, 1.5);
  }

  // Wireless charging +0.5
  if (b.hasWireless) score += 0.5;

  return clamp(score, 0, 5);
}

/**
 * Performance score (0-5).
 * Signals: RAM, chipset/CPU/GPU presence, high refresh, storage tie-breaker.
 */
function scorePerformance(signals) {
  if (!signals) return 0;
  const p = signals.performance;
  let score = 0;

  // RAM (0-3): 16 GB → 3, 12 GB → 2.25, 8 GB → 1.5, 6 GB → 1.125
  if (p.ramGB != null) {
    score += clamp(p.ramGB / 8, 0, 3);
  }

  // Chipset presence +0.5
  if (p.hasChipset) score += 0.5;

  // CPU + GPU presence (0.3 each)
  if (p.hasCPU) score += 0.3;
  if (p.hasGPU) score += 0.3;

  // Storage tie-breaker (0-0.3)
  if (p.storageGB != null) {
    score += clamp(p.storageGB / 1024, 0, 0.3);
  }

  return clamp(score, 0, 5);
}

/**
 * Compact score (0-5).
 * Signals: screen size (inverse), weight (inverse).
 */
function scoreCompact(signals) {
  if (!signals) return 0;
  const c = signals.compact;
  let score = 0;

  // Screen size (0-3): smaller is better. 4.0" → 3, 5.5" → 1.5, 6.7" → 0.3, 7.0" → 0
  if (c.screenSizeInches != null) {
    score += clamp((7 - c.screenSizeInches) / 1.5, 0, 3);
  }

  // Weight (0-1.5): lighter is better. 120g → 1.3, 168g → 0.82, 221g → 0.29, 250g → 0
  if (c.weightGrams != null) {
    score += clamp((250 - c.weightGrams) / 150, 0, 1.5);
  }

  return clamp(score, 0, 5);
}

/**
 * General quality tiebreaker (0-1).
 * Only applied when at least one preference is active.
 */
function scoreGeneralTiebreaker(signals) {
  if (!signals) return 0;
  const g = signals.general;
  let score = 0;

  // In stock: +0.3
  if (g.inStock != null && g.inStock > 0) score += 0.3;

  // Lower price preference (0-0.4): phone under 5M → 0.36, under 30M → 0.16
  if (g.price != null) {
    score += clamp(1 - g.price / 50000000, 0, 0.4);
  }

  return clamp(score, 0, 1);
}

/* ------------------------------------------------------------------ */
/*  Ranking explanation                                                */
/* ------------------------------------------------------------------ */

/**
 * Build factual explanation strings for a product given active preferences.
 * Returns an array of reason strings; empty array if no preferences or no signals.
 */
function buildRankingExplanation(product, preferences) {
  if (!preferences || !product) return [];
  const signals = extractProductSignals(product);
  if (!signals) return [];
  const reasons = [];

  if (preferences.camera) {
    const c = signals.camera;
    const parts = [];
    if (c.rearPrimaryMP != null) {
      parts.push(`Camera chính ${c.rearPrimaryMP} MP`);
    }
    if (c.rearLensCount > 1) {
      parts.push(`${c.rearLensCount} ống kính`);
    }
    if (c.hasOIS) parts.push('OIS');
    if (c.hasTelephoto) parts.push('Telephoto');
    if (c.frontMP != null) {
      parts.push(`Camera trước ${c.frontMP} MP`);
    }
    if (parts.length > 0) {
      reasons.push(parts.join(', '));
    }
  }

  if (preferences.battery) {
    const b = signals.battery;
    const parts = [];
    if (b.capacityMAh != null) {
      parts.push(`Pin ${b.capacityMAh} mAh`);
    }
    if (b.wiredWatts != null) {
      parts.push(`Sạc có dây ${b.wiredWatts}W`);
    }
    if (b.hasWireless) parts.push('Sạc không dây');
    if (parts.length > 0) {
      reasons.push(parts.join(', '));
    }
  }

  if (preferences.performance) {
    const p = signals.performance;
    const parts = [];
    if (p.ramGB != null) {
      parts.push(`RAM ${p.ramGB} GB`);
    }
    if (p.hasChipset) {
      const chipset = get(product, 'specs.processor.chipset');
      if (chipset) parts.push(`Chipset ${chipset}`);
    }
    if (p.storageGB != null) {
      parts.push(`Bộ nhớ ${p.storageGB} GB`);
    }
    if (parts.length > 0) {
      reasons.push(parts.join(', '));
    }
  }

  if (preferences.compact) {
    const c = signals.compact;
    const parts = [];
    if (c.screenSizeInches != null) {
      parts.push(`Màn hình ${c.screenSizeInches} inch`);
    }
    if (c.weightGrams != null) {
      parts.push(`Trọng lượng ${c.weightGrams} g`);
    }
    if (parts.length > 0) {
      reasons.push(parts.join(', '));
    }
  }

  return reasons;
}

/* ------------------------------------------------------------------ */
/*  Main ranking entry point                                           */
/* ------------------------------------------------------------------ */

/**
 * Score a single product against the given preferences.
 *
 * @param {object} product — product document
 * @param {object} preferences — { camera, battery, performance, compact }
 * @returns {number} score (higher = more relevant)
 */
function scoreProduct(product, preferences) {
  if (!product || !preferences) return 0;
  const signals = extractProductSignals(product);
  if (!signals) return 0;

  let score = 0;
  const anyPref = preferences.camera || preferences.battery || preferences.performance || preferences.compact;

  if (preferences.camera) score += scoreCamera(signals);
  if (preferences.battery) score += scoreBattery(signals);
  if (preferences.performance) score += scorePerformance(signals);
  if (preferences.compact) score += scoreCompact(signals);

  // Tiebreaker only when preferences exist
  if (anyPref) {
    score += scoreGeneralTiebreaker(signals);
  }

  return score;
}

/**
 * Rank products by soft preferences.
 *
 * @param {object[]} products — array of product objects (already hard-filtered)
 * @param {object} preferences — { camera, battery, performance, compact }
 * @param {object} [options] — unused, reserved for future use
 * @returns {{ ranked: object[], explanations: string[][] }}
 *
 * - Does not mutate input arrays or objects.
 * - If all preferences are false, returns original order with empty explanations.
 * - Uses stable sort: equal scores preserve original order.
 */
function rankProducts(products, preferences, options) {
  if (!Array.isArray(products)) return { ranked: [], explanations: [] };
  if (!preferences) {
    return { ranked: [...products], explanations: products.map(() => []) };
  }

  const anyPref = preferences.camera || preferences.battery || preferences.performance || preferences.compact;

  if (!anyPref) {
    return { ranked: [...products], explanations: products.map(() => []) };
  }

  // Score each product with its original index for stable sorting
  const scored = products.map((p, idx) => ({
    product: p,
    score: scoreProduct(p, preferences),
    originalIndex: idx,
  }));

  // Sort by score descending, then original index ascending (stable)
  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return a.originalIndex - b.originalIndex;
  });

  const ranked = scored.map(s => s.product);
  const explanations = ranked.map(p => buildRankingExplanation(p, preferences));

  return { ranked, explanations };
}

module.exports = {
  rankProducts,
  scoreProduct,
  buildRankingExplanation,
  extractProductSignals,
  scoreCamera,
  scoreBattery,
  scorePerformance,
  scoreCompact,
};
