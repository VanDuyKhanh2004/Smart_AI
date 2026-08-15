import type { ProductSpecs } from '@/types/product.type';

/**
 * Build a canonical ProductSpecs object from the flat field map produced by
 * ProductSpecsFields. Only non-empty, trimmed values are emitted; array-typed
 * fields are split on commas. Returns undefined when nothing is populated so
 * callers can omit the specs field entirely (create) or leave it untouched
 * (update).
 */
export function buildSpecs(
  values: Record<string, string>,
  expandable: boolean | undefined,
): ProductSpecs | undefined {
  const out: ProductSpecs = {};

  const text = (path: string): string | undefined => {
    const v = values[path];
    if (v === undefined || v === null) return undefined;
    const trimmed = v.trim();
    return trimmed === '' ? undefined : trimmed;
  };

  const list = (path: string): string[] | undefined => {
    const v = text(path);
    if (!v) return undefined;
    const items = v.split(',').map((i) => i.trim()).filter(Boolean);
    return items.length > 0 ? [...new Set(items)] : undefined;
  };

  // Screen
  const screen: Partial<NonNullable<ProductSpecs['screen']>> = {};
  const screenSize = text('screen.size');
  if (screenSize) screen.size = screenSize;
  const screenResolution = text('screen.resolution');
  if (screenResolution) screen.resolution = screenResolution;
  const screenTechnology = text('screen.technology');
  if (screenTechnology) screen.technology = screenTechnology;
  if (Object.keys(screen).length > 0) out.screen = screen;

  // Processor
  const processor: Partial<NonNullable<ProductSpecs['processor']>> = {};
  const chipset = text('processor.chipset');
  if (chipset) processor.chipset = chipset;
  const cpu = text('processor.cpu');
  if (cpu) processor.cpu = cpu;
  const gpu = text('processor.gpu');
  if (gpu) processor.gpu = gpu;
  if (Object.keys(processor).length > 0) out.processor = processor;

  // Memory
  const ram = text('memory.ram');
  const storage = text('memory.storage');
  if (ram !== undefined || storage !== undefined || expandable !== undefined) {
    out.memory = {};
    if (ram !== undefined) out.memory.ram = ram;
    if (storage !== undefined) out.memory.storage = storage;
    if (expandable !== undefined) out.memory.expandable = expandable;
  }

  // Camera
  const cameraRear: Partial<NonNullable<ProductSpecs['camera']>['rear']> = {};
  const rearPrimary = text('camera.rear.primary');
  if (rearPrimary) cameraRear.primary = rearPrimary;
  const rearSecondary = text('camera.rear.secondary');
  if (rearSecondary) cameraRear.secondary = rearSecondary;
  const rearTertiary = text('camera.rear.tertiary');
  if (rearTertiary) cameraRear.tertiary = rearTertiary;
  const cameraFront = text('camera.front');
  const cameraFeatures = list('camera.features');
  if (
    Object.keys(cameraRear).length > 0 ||
    cameraFront !== undefined ||
    cameraFeatures !== undefined
  ) {
    out.camera = {};
    if (Object.keys(cameraRear).length > 0) out.camera.rear = cameraRear;
    if (cameraFront !== undefined) out.camera.front = cameraFront;
    if (cameraFeatures !== undefined) out.camera.features = cameraFeatures;
  }

  // Battery
  const capacity = text('battery.capacity');
  const wired = text('battery.charging.wired');
  const wireless = text('battery.charging.wireless');
  if (capacity !== undefined || wired !== undefined || wireless !== undefined) {
    out.battery = {};
    if (capacity !== undefined) out.battery.capacity = capacity;
    if (wired !== undefined || wireless !== undefined) {
      out.battery.charging = {};
      if (wired !== undefined) out.battery.charging.wired = wired;
      if (wireless !== undefined) out.battery.charging.wireless = wireless;
    }
  }

  // Connectivity
  const network = list('connectivity.network');
  const ports = list('connectivity.ports');
  if (network !== undefined || ports !== undefined) {
    out.connectivity = {};
    if (network !== undefined) out.connectivity.network = network;
    if (ports !== undefined) out.connectivity.ports = ports;
  }

  // Other
  const os = text('os');
  if (os !== undefined) out.os = os;
  const dimensions = text('dimensions');
  if (dimensions !== undefined) out.dimensions = dimensions;
  const weight = text('weight');
  if (weight !== undefined) out.weight = weight;

  return Object.keys(out).length > 0 ? out : undefined;
}