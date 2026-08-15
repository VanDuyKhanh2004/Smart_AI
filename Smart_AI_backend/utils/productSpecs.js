/**
 * Canonical product specifications normalization.
 *
 * The Product model stores a single nested `specs` object that is the shared
 * specification domain model consumed by the Product Detail page, the Compare
 * table, and the AI/RAG embedding pipeline. This module enforces that single
 * canonical shape: it strips unknown keys and normalizes values so that
 * whatever is persisted (and later embedded / compared / displayed) always
 * matches the documented spec structure.
 *
 * The whitelist mirrors the canonical spec categories:
 *   screen, processor, memory, camera, battery, connectivity, os, dimensions,
 *   weight, colors
 */

const OBJECT_FIELDS = {
  screen: ['size', 'resolution', 'technology'],
  processor: ['chipset', 'cpu', 'gpu'],
  memory: ['ram', 'storage', 'expandable'],
  camera: ['rear', 'front', 'features'],
  battery: ['capacity', 'charging'],
  connectivity: ['network', 'ports'],
};

const REAR_FIELDS = ['primary', 'secondary', 'tertiary'];
const CHARGING_FIELDS = ['wired', 'wireless'];

/** Coerce a value to a string, returning undefined for empty / non-scalar input. */
function cleanString(value) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** Coerce a value to a strict boolean, returning undefined for non-boolean input. */
function cleanBoolean(value) {
  if (value === true || value === 1 || value === 'true' || value === '1') return true;
  if (value === false || value === 0 || value === 'false' || value === '0') return false;
  return undefined;
}

/** Clean an array of strings: trim, drop empties, de-duplicate. */
function cleanStringArray(value) {
  if (!Array.isArray(value)) return undefined;
  const cleaned = value
    .map(cleanString)
    .filter((item) => item !== undefined);
  return cleaned.length > 0 ? [...new Set(cleaned)] : undefined;
}

/** Clean an object of string fields, keeping only non-empty values. */
function cleanStringObject(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const result = {};
  let hasAny = false;
  for (const field of fields) {
    const cleaned = cleanString(value[field]);
    if (cleaned !== undefined) {
      result[field] = cleaned;
      hasAny = true;
    }
  }
  return hasAny ? result : undefined;
}

/**
 * Normalize an arbitrary `specs` payload against the canonical shape.
 *
 * Returns a new object containing only whitelisted, cleaned fields. Unknown
 * keys are dropped (never silently persisted), so the spec model used by
 * Compare / Detail / RAG stays canonical. Returns undefined when the input is
 * not an object (or when all known fields are empty), so callers can decide
 * whether to default to `{}` (create) or leave the field untouched (update).
 *
 * @param {unknown} input - Raw specs value (parsed JSON or plain object).
 * @returns {object | undefined} Normalized canonical specs object.
 */
function normalizeProductSpecs(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;

  const result = {};
  let hasAny = false;

  // Nested string sub-objects (screen / processor / simple memory strings)
  for (const field of OBJECT_FIELDS.screen) {
    const cleaned = cleanString(input.screen?.[field]);
    if (cleaned !== undefined) {
      result.screen ||= {};
      result.screen[field] = cleaned;
      hasAny = true;
    }
  }

  for (const field of OBJECT_FIELDS.processor) {
    const cleaned = cleanString(input.processor?.[field]);
    if (cleaned !== undefined) {
      result.processor ||= {};
      result.processor[field] = cleaned;
      hasAny = true;
    }
  }

  // Memory: strings + boolean expandable
  const ram = cleanString(input.memory?.ram);
  if (ram !== undefined) {
    result.memory ||= {};
    result.memory.ram = ram;
    hasAny = true;
  }
  const storage = cleanString(input.memory?.storage);
  if (storage !== undefined) {
    result.memory ||= {};
    result.memory.storage = storage;
    hasAny = true;
  }
  const expandable = cleanBoolean(input.memory?.expandable);
  if (expandable !== undefined) {
    result.memory ||= {};
    result.memory.expandable = expandable;
    hasAny = true;
  }

  // Camera: rear {primary, secondary, tertiary}, front, features[]
  const rear = cleanStringObject(input.camera?.rear, REAR_FIELDS);
  if (rear) {
    result.camera ||= {};
    result.camera.rear = rear;
    hasAny = true;
  }
  const cameraFront = cleanString(input.camera?.front);
  if (cameraFront !== undefined) {
    result.camera ||= {};
    result.camera.front = cameraFront;
    hasAny = true;
  }
  const cameraFeatures = cleanStringArray(input.camera?.features);
  if (cameraFeatures) {
    result.camera ||= {};
    result.camera.features = cameraFeatures;
    hasAny = true;
  }

  // Battery: capacity + charging {wired, wireless}
  const capacity = cleanString(input.battery?.capacity);
  if (capacity !== undefined) {
    result.battery ||= {};
    result.battery.capacity = capacity;
    hasAny = true;
  }
  const charging = cleanStringObject(input.battery?.charging, CHARGING_FIELDS);
  if (charging) {
    result.battery ||= {};
    result.battery.charging = charging;
    hasAny = true;
  }

  // Connectivity: network[] + ports[]
  const network = cleanStringArray(input.connectivity?.network);
  if (network) {
    result.connectivity ||= {};
    result.connectivity.network = network;
    hasAny = true;
  }
  const ports = cleanStringArray(input.connectivity?.ports);
  if (ports) {
    result.connectivity ||= {};
    result.connectivity.ports = ports;
    hasAny = true;
  }

  // Top-level strings: os, dimensions, weight
  const os = cleanString(input.os);
  if (os !== undefined) {
    result.os = os;
    hasAny = true;
  }
  const dimensions = cleanString(input.dimensions);
  if (dimensions !== undefined) {
    result.dimensions = dimensions;
    hasAny = true;
  }
  const weight = cleanString(input.weight);
  if (weight !== undefined) {
    result.weight = weight;
    hasAny = true;
  }

  // Colors (array of strings, part of the spec model read by Detail / Compare)
  const colors = cleanStringArray(input.colors);
  if (colors) {
    result.colors = colors;
    hasAny = true;
  }

  return hasAny ? result : undefined;
}

module.exports = { normalizeProductSpecs };