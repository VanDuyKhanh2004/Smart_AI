import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardSummary } from "@/types/dashboard.type";
import {
  DollarSign,
  ShoppingCart,
  Users,
  Clock,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

interface SummaryCardsProps {
  summary: DashboardSummary | null;
  isLoading?: boolean;
}

interface SummaryCardProps {
  title: string;
  value: string | number;
  change: number;
  icon: React.ReactNode;
  iconBgClass: string;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatChange(change: number): string {
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}%`;
}

function SummaryCard({ title, value, change, icon, iconBgClass }: SummaryCardProps) {
  const isPositive = change >= 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className={`p-2 rounded-lg ${iconBgClass}`}>{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center gap-1 mt-1">
          {isPositive ? (
            <TrendingUp className="h-3 w-3 text-green-600" />
          ) : (
            <TrendingDown className="h-3 w-3 text-red-600" />
          )}
          <span
            className={`text-xs font-medium ${
              isPositive ? "text-green-600" : "text-red-600"
            }`}
          >
            {formatChange(change)}
          </span>
          <span className="text-xs text-muted-foreground">so với kỳ trước</span>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="h-4 w-24 bg-muted animate-pulse rounded" />
        <div className="h-8 w-8 bg-muted animate-pulse rounded-lg" />
      </CardHeader>
      <CardContent>
        <div className="h-8 w-32 bg-muted animate-pulse rounded mb-2" />
        <div className="h-3 w-28 bg-muted animate-pulse rounded" />
      </CardContent>
    </Card>
  );
}

export function SummaryCards({ summary, isLoading }: SummaryCardsProps) {
  if (isLoading || !summary) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SummaryCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  const cards: SummaryCardProps[] = [
    {
      title: "Tổng doanh thu",
      value: formatCurrency(summary.totalRevenue),
      change: summary.revenueChange,
      icon: <DollarSign className="h-4 w-4 text-green-600" />,
      iconBgClass: "bg-green-100 dark:bg-green-900/30",
    },
    {
      title: "Tổng đơn hàng",
      value: summary.totalOrders.toLocaleString("vi-VN"),
      change: summary.ordersChange,
      icon: <ShoppingCart className="h-4 w-4 text-blue-600" />,
      iconBgClass: "bg-blue-100 dark:bg-blue-900/30",
    },
    {
      title: "Tổng người dùng",
      value: summary.totalUsers.toLocaleString("vi-VN"),
      change: summary.usersChange,
      icon: <Users className="h-4 w-4 text-purple-600" />,
      iconBgClass: "bg-purple-100 dark:bg-purple-900/30",
    },
    {
      title: "Đơn chờ xử lý",
      value: summary.pendingOrders.toLocaleString("vi-VN"),
      change: 0,
      icon: <Clock className="h-4 w-4 text-orange-600" />,
      iconBgClass: "bg-orange-100 dark:bg-orange-900/30",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <SummaryCard key={card.title} {...card} />
      ))}
    </div>
  );
}
