import React, { useMemo } from 'react';
import { Check } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Product } from '@/types/product.type';
import type { CompareTableRow } from '@/types/compare.type';
import {
  buildCompareTableData,
  filterDifferentRows,
  groupRowsByCategory,
  formatSpecValue,
} from '../utils/compareUtils';
import { cn } from '@/lib/utils';

/**
 * CompareTable Component
 *
 * Displays a detailed comparison table of product specifications.
 * - Organizes specs into categories
 * - Highlights different values between products
 * - Highlights best values for numeric specs (green background)
 * - Shows "-" for missing values
 *
 * Requirements: 3.3, 3.4, 3.5, 4.3, 4.4
 */

interface CompareTableProps {
  /** Products to compare */
  products: Product[];
  /** Whether to show only rows with different values */
  showOnlyDifferences?: boolean;
}

const CompareTable: React.FC<CompareTableProps> = ({
  products,
  showOnlyDifferences = false,
}) => {
  // Build comparison table data from products
  const tableData = useMemo(() => {
    return buildCompareTableData(products);
  }, [products]);

  // Filter to show only differences if enabled (Requirement 4.2)
  const filteredData = useMemo(() => {
    if (showOnlyDifferences) {
      return filterDifferentRows(tableData);
    }
    return tableData;
  }, [tableData, showOnlyDifferences]);

  // Group rows by category for organized display (Requirement 3.3)
  const groupedData = useMemo(() => {
    return groupRowsByCategory(filteredData);
  }, [filteredData]);


  // Render a single spec value cell
  const renderValueCell = (
    row: CompareTableRow,
    value: string | number | null,
    index: number
  ) => {
    const displayValue = formatSpecValue(value);
    const isBest = row.bestIndex === index;
    const isMissing = value === null;

    return (
      <TableCell
        key={index}
        className={cn(
          'text-center min-w-[120px]',
          // Requirement 4.3, 4.4: Highlight best value with green background
          isBest && 'bg-green-50',
          // Requirement 3.5: Style missing values
          isMissing && 'text-gray-400'
        )}
      >
        <div className="flex items-center justify-center gap-1">
          <span>{displayValue}</span>
          {/* Requirement 4.3: Show check icon for best numeric value */}
          {isBest && (
            <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
          )}
        </div>
      </TableCell>
    );
  };

  // Render a spec row
  const renderSpecRow = (row: CompareTableRow, rowIndex: number) => {
    return (
      <TableRow
        key={`${row.category}-${row.attribute}-${rowIndex}`}
        className={cn(
          // Highlight rows with differences
          row.isDifferent && 'bg-blue-50/30'
        )}
      >
        {/* Attribute label */}
        <TableCell className="font-medium text-gray-700 min-w-[150px] sticky left-0 bg-white">
          {row.attribute}
        </TableCell>
        {/* Values for each product */}
        {row.values.map((value, index) => renderValueCell(row, value, index))}
      </TableRow>
    );
  };

  // Render category header row
  const renderCategoryHeader = (categoryName: string) => {
    return (
      <TableRow key={`category-${categoryName}`} className="bg-gray-100">
        <TableCell
          colSpan={products.length + 1}
          className="font-semibold text-gray-800 py-3"
        >
          {categoryName}
        </TableCell>
      </TableRow>
    );
  };

  if (products.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        Không có sản phẩm để so sánh
      </div>
    );
  }

  if (filteredData.length === 0 && showOnlyDifferences) {
    return (
      <div className="text-center py-8 text-gray-500">
        Tất cả thông số đều giống nhau giữa các sản phẩm
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50">
            {/* Empty header cell for attribute column */}
            <TableHead className="min-w-[150px] sticky left-0 bg-gray-50 z-10">
              Thông số
            </TableHead>
            {/* Product name headers */}
            {products.map((product) => (
              <TableHead
                key={product._id}
                className="text-center min-w-[120px]"
              >
                {product.name}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* Render rows grouped by category (Requirement 3.3) */}
          {Array.from(groupedData.entries()).map(([categoryName, rows]) => (
            <React.Fragment key={categoryName}>
              {renderCategoryHeader(categoryName)}
              {rows.map((row, index) => renderSpecRow(row, index))}
            </React.Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default CompareTable;
