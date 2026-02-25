/**
 * Spec Categories Configuration for Product Comparison
 * Defines the structure and mapping of product specifications for the comparison table
 * 
 * Requirements: 3.3 - Organize specs into categories
 */

export interface SpecDefinition {
  key: string;
  label: string;
  /** Whether this spec should be compared numerically (higher is better) */
  isNumeric?: boolean;
  /** For numeric specs, whether lower is better (e.g., price, weight) */
  lowerIsBetter?: boolean;
}

export interface SpecCategory {
  name: string;
  specs: SpecDefinition[];
}

/**
 * SPEC_CATEGORIES defines all specification categories and their attributes
 * for the product comparison table.
 * 
 * Categories: Màn hình, Bộ xử lý, Bộ nhớ, Camera, Pin, Kết nối, Hệ điều hành, Thiết kế
 */
export const SPEC_CATEGORIES: SpecCategory[] = [
  {
    name: 'Màn hình',
    specs: [
      { key: 'specs.screen.size', label: 'Kích thước' },
      { key: 'specs.screen.resolution', label: 'Độ phân giải' },
      { key: 'specs.screen.technology', label: 'Công nghệ' },
    ],
  },
  {
    name: 'Bộ xử lý',
    specs: [
      { key: 'specs.processor.chipset', label: 'Chipset' },
      { key: 'specs.processor.cpu', label: 'CPU' },
      { key: 'specs.processor.gpu', label: 'GPU' },
    ],
  },
  {
    name: 'Bộ nhớ',
    specs: [
      { key: 'specs.memory.ram', label: 'RAM', isNumeric: true },
      { key: 'specs.memory.storage', label: 'Bộ nhớ trong', isNumeric: true },
      { key: 'specs.memory.expandable', label: 'Mở rộng' },
    ],
  },
  {
    name: 'Camera',
    specs: [
      { key: 'specs.camera.rear.primary', label: 'Camera chính', isNumeric: true },
      { key: 'specs.camera.rear.secondary', label: 'Camera phụ' },
      { key: 'specs.camera.rear.tertiary', label: 'Camera tele' },
      { key: 'specs.camera.front', label: 'Camera trước', isNumeric: true },
    ],
  },
  {
    name: 'Pin',
    specs: [
      { key: 'specs.battery.capacity', label: 'Dung lượng', isNumeric: true },
      { key: 'specs.battery.charging.wired', label: 'Sạc có dây', isNumeric: true },
      { key: 'specs.battery.charging.wireless', label: 'Sạc không dây', isNumeric: true },
    ],
  },
  {
    name: 'Kết nối',
    specs: [
      { key: 'specs.connectivity.network', label: 'Mạng' },
      { key: 'specs.connectivity.ports', label: 'Cổng kết nối' },
    ],
  },
  {
    name: 'Thông tin khác',
    specs: [
      { key: 'specs.os', label: 'Hệ điều hành' },
      { key: 'specs.dimensions', label: 'Kích thước' },
      { key: 'specs.weight', label: 'Trọng lượng', isNumeric: true, lowerIsBetter: true },
    ],
  },
];

/**
 * Get all spec keys as a flat array
 */
export function getAllSpecKeys(): string[] {
  return SPEC_CATEGORIES.flatMap((category) => category.specs.map((spec) => spec.key));
}

/**
 * Find a spec definition by its key
 */
export function findSpecByKey(key: string): SpecDefinition | undefined {
  for (const category of SPEC_CATEGORIES) {
    const spec = category.specs.find((s) => s.key === key);
    if (spec) return spec;
  }
  return undefined;
}
