import { describe, it, expect } from 'vitest';
import {
  buildCompareTableData,
  filterRowsWithValues,
  hasAnyValue,
} from '@/features/compare/utils/compareUtils';
import type { CompareTableRow } from '@/types/compare.type';
import type { Product } from '@/types/product.type';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    _id: 'p1',
    name: 'Product A',
    brand: 'apple',
    price: 10000000,
    description: 'desc',
    inStock: 5,
    colors: [],
    tags: [],
    image: '',
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('filterRowsWithValues / hasAnyValue', () => {
  it('returns true when at least one product has a value', () => {
    const row: CompareTableRow = {
      category: 'Màn hình',
      attribute: 'Kích thước',
      values: ['6.7 inch', null, null],
      isDifferent: true,
    };
    expect(hasAnyValue(row)).toBe(true);
    expect(filterRowsWithValues([row])).toEqual([row]);
  });

  it('returns false when every product is missing the value', () => {
    const row: CompareTableRow = {
      category: 'Camera',
      attribute: 'Camera tele',
      values: [null, null],
      isDifferent: false,
    };
    expect(hasAnyValue(row)).toBe(false);
    expect(filterRowsWithValues([row])).toEqual([]);
  });

  it('keeps only rows that have any usable value', () => {
    const withValue: CompareTableRow = {
      category: 'Màn hình',
      attribute: 'Kích thước',
      values: ['6.7 inch', '6.1 inch'],
      isDifferent: true,
    };
    const empty: CompareTableRow = {
      category: 'Kết nối',
      attribute: 'Cổng kết nối',
      values: [null, null, null],
      isDifferent: false,
    };

    expect(filterRowsWithValues([withValue, empty])).toEqual([withValue]);
  });

  it('treats undefined values as missing too', () => {
    const row: CompareTableRow = {
      category: 'Màn hình',
      attribute: 'Công nghệ',
      values: [null as string | number | null, null],
      isDifferent: false,
    };
    expect(hasAnyValue(row)).toBe(false);
  });
});

describe('buildCompareTableData + filterRowsWithValues integration', () => {
  it('drops entire categories when no product stores specs', () => {
    const products = [makeProduct(), makeProduct({ _id: 'p2', name: 'Product B', brand: 'samsung' })];

    const rows = buildCompareTableData(products);
    expect(rows.length).toBeGreaterThan(0);

    const withValues = filterRowsWithValues(rows);
    // Price/weight etc. are not part of spec categories; with no specs at all,
    // every spec row must be dropped.
    expect(withValues).toEqual([]);
  });

  it('keeps only categories that carry at least one spec value', () => {
    const products = [
      makeProduct({ specs: { screen: { size: '6.7 inch' } } }),
      makeProduct({ _id: 'p2', name: 'Product B', brand: 'samsung' }),
    ];

    const rows = buildCompareTableData(products);
    const withValues = filterRowsWithValues(rows);

    expect(withValues.length).toBe(1);
    expect(withValues[0].attribute).toBe('Kích thước');
    expect(withValues[0].values[0]).toBe('6.7 inch');
    expect(withValues[0].values[1]).toBeNull();
  });
});