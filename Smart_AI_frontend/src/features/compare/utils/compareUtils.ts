/**
 * Comparison Utility Functions
 * Provides functions for building comparison table data and analyzing differences
 *
 * Requirements: 3.4, 3.5, 4.2, 4.3, 4.4
 */

import type { Product } from '@/types/product.type';
import type { CompareTableRow } from '@/types/compare.type';
import { SPEC_CATEGORIES } from './specCategories';

/**
 * Safely get a nested value from an object using a dot-notation path
 * Returns null if the path doesn't exist or value is undefined/null
 *
 * @param obj - The object to extract value from
 * @param path - Dot-notation path (e.g., 'specs.screen.size')
 * @returns The value at the path, or null if not found
 *
 * Requirements: 3.5 - Show "-" for missing values (null represents missing)
 */
export function getSpecValue(obj: unknown, path: string): string | number | boolean | null {
  if (!obj || typeof obj !== 'object') return null;

  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined) return null;
    if (typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[key];
  }

  // Handle arrays (e.g., connectivity.network, connectivity.ports)
  if (Array.isArray(current)) {
    if (current.length === 0) return null;
    return current.join(', ');
  }

  // Handle boolean values
  if (typeof current === 'boolean') {
    return current;
  }

  // Handle empty strings
  if (current === '' || current === undefined || current === null) {
    return null;
  }

  return current as string | number;
}

/**
 * Check if values differ among products for a given spec
 *
 * @param values - Array of spec values from different products
 * @returns true if at least one value differs from others
 *
 * Requirements: 4.2 - Filter rows where all products have identical values
 */
export function isDifferent(values: (string | number | boolean | null)[]): boolean {
  // Filter out null values for comparison
  const nonNullValues = values.filter((v) => v !== null);

  // If all values are null, they're not different
  if (nonNullValues.length === 0) return false;

  // If some have values and some don't, they're different
  if (nonNullValues.length !== values.length) return true;

  // Compare all non-null values
  const firstValue = String(nonNullValues[0]);
  return nonNullValues.some((v) => String(v) !== firstValue);
}

/**
 * Extract numeric value from a string (e.g., "8 GB" -> 8, "4500 mAh" -> 4500)
 *
 * @param value - String value that may contain a number
 * @returns The extracted number, or null if no number found
 */
export function extractNumericValue(value: string | number | boolean | null): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return null;

  // Extract first number from string (handles "8 GB", "48 MP", "4500 mAh", etc.)
  const match = String(value).match(/[\d.]+/);
  if (match) {
    const num = parseFloat(match[0]);
    return isNaN(num) ? null : num;
  }
  return null;
}

/**
 * Find the index of the best value for numeric specs
 *
 * @param values - Array of spec values from different products
 * @param lowerIsBetter - If true, lower values are better (e.g., weight, price)
 * @returns Index of the best value, or undefined if no valid comparison
 *
 * Requirements: 4.3, 4.4 - Highlight best value for numeric specs
 */
export function findBestValue(
  values: (string | number | boolean | null)[],
  lowerIsBetter: boolean = false
): number | undefined {
  const numericValues = values.map(extractNumericValue);

  // Filter out null values and get valid indices
  const validEntries: { index: number; value: number }[] = [];
  numericValues.forEach((value, index) => {
    if (value !== null) {
      validEntries.push({ index, value });
    }
  });

  // Need at least 2 valid values to compare
  if (validEntries.length < 2) return undefined;

  // Check if all values are the same
  const allSame = validEntries.every((e) => e.value === validEntries[0].value);
  if (allSame) return undefined;

  // Find best value
  let bestEntry = validEntries[0];
  for (const entry of validEntries) {
    if (lowerIsBetter) {
      if (entry.value < bestEntry.value) {
        bestEntry = entry;
      }
    } else {
      if (entry.value > bestEntry.value) {
        bestEntry = entry;
      }
    }
  }

  return bestEntry.index;
}

/**
 * Format a spec value for display
 *
 * @param value - The raw spec value
 * @returns Formatted string for display
 *
 * Requirements: 3.5 - Show "-" for missing values
 */
export function formatSpecValue(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  return String(value);
}

/**
 * Build comparison table data from products
 *
 * @param products - Array of products to compare
 * @returns Array of CompareTableRow objects organized by category
 *
 * Requirements: 3.3, 3.4, 3.5, 4.3, 4.4
 */
export function buildCompareTableData(products: Product[]): CompareTableRow[] {
  const rows: CompareTableRow[] = [];

  for (const category of SPEC_CATEGORIES) {
    for (const spec of category.specs) {
      const values = products.map((product) => getSpecValue(product, spec.key));

      // Convert boolean values to strings for display
      const displayValues = values.map((v) => {
        if (typeof v === 'boolean') return v ? 'Có' : 'Không';
        return v;
      });

      const row: CompareTableRow = {
        category: category.name,
        attribute: spec.label,
        values: displayValues,
        isDifferent: isDifferent(values),
      };

      // Find best value for numeric specs
      if (spec.isNumeric) {
        row.bestIndex = findBestValue(values, spec.lowerIsBetter);
      }

      rows.push(row);
    }
  }

  return rows;
}

/**
 * Filter comparison table rows to show only differences
 *
 * @param rows - All comparison table rows
 * @returns Rows where values differ between products
 *
 * Requirements: 4.2 - Hide rows where all products have identical values
 */
export function filterDifferentRows(rows: CompareTableRow[]): CompareTableRow[] {
  return rows.filter((row) => row.isDifferent);
}

/**
 * Group comparison table rows by category
 *
 * @param rows - Flat array of comparison table rows
 * @returns Map of category name to rows
 */
export function groupRowsByCategory(rows: CompareTableRow[]): Map<string, CompareTableRow[]> {
  const grouped = new Map<string, CompareTableRow[]>();

  for (const row of rows) {
    const existing = grouped.get(row.category) || [];
    existing.push(row);
    grouped.set(row.category, existing);
  }

  return grouped;
}
