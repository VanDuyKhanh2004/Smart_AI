import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TopProduct } from "@/types/dashboard.type";

interface TopProductsTableProps {
  products: TopProduct[];
  isLoading?: boolean;
  /** H15: fetch failure is reported instead of "Không có dữ liệu" */
  isError?: boolean;
  onRetry?: () => void;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

export function TopProductsTable({
  products,
  isLoading,
  isError = false,
  onRetry,
}: TopProductsTableProps) {
  const navigate = useNavigate();

  const handleRowClick = (productId: string) => {
    navigate(`/products/${productId}`);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top sản phẩm bán chạy</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="h-4 w-6 bg-muted animate-pulse rounded" />
                <div className="h-10 w-10 bg-muted animate-pulse rounded" />
                <div className="flex-1 h-4 bg-muted animate-pulse rounded" />
                <div className="h-4 w-16 bg-muted animate-pulse rounded" />
                <div className="h-4 w-24 bg-muted animate-pulse rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!products || products.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top sản phẩm bán chạy</CardTitle>
        </CardHeader>
        <CardContent>
          {/* H15: a failed dashboard fetch must never read as "no data" */}
          {isError ? (
            <div className="h-[200px] flex flex-col items-center justify-center gap-3">
              <Alert variant="destructive" className="max-w-md">
                <AlertDescription>Không thể tải top sản phẩm bán chạy.</AlertDescription>
              </Alert>
              {onRetry && (
                <Button variant="outline" size="sm" onClick={onRetry}>
                  Thử lại
                </Button>
              )}
            </div>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground">
              Không có dữ liệu
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top sản phẩm bán chạy</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Sản phẩm</TableHead>
              <TableHead className="text-right">Số lượng</TableHead>
              <TableHead className="text-right">Doanh thu</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((item, index) => (
              <TableRow
                key={item.product._id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleRowClick(item.product._id)}
              >
                <TableCell className="font-medium">{index + 1}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <img
                      src={item.product.image || '/images/product-placeholder.svg'}
                      alt={item.product.name}
                      className="h-10 w-10 rounded object-cover"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = '/images/product-placeholder.svg';
                      }}
                    />
                    {/* Keyboard entry point for the clickable row (H04) */}
                    <button
                      type="button"
                      className="rounded-sm text-left font-medium line-clamp-1 hover:underline focus-visible:underline"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleRowClick(item.product._id);
                      }}
                    >
                      {item.product.name}
                    </button>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {item.totalQuantity.toLocaleString("vi-VN")}
                </TableCell>
                <TableCell className="text-right font-medium text-green-600">
                  {formatCurrency(item.totalRevenue)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
