import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OrderStats as OrderStatsType } from "@/types/order.type";
import {
  Package,
  Clock,
  CheckCircle,
  Settings,
  Truck,
  PackageCheck,
  XCircle,
} from "lucide-react";

interface OrderStatsProps {
  stats: OrderStatsType | null;
  isLoading?: boolean;
}

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  colorClass: string;
}

function StatCard({ title, value, icon, colorClass }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className={colorClass}>{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

export function OrderStats({ stats, isLoading }: OrderStatsProps) {
  if (isLoading || !stats) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 w-20 bg-muted animate-pulse rounded" />
              <div className="h-4 w-4 bg-muted animate-pulse rounded" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-12 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const statCards: StatCardProps[] = [
    {
      title: "Tổng đơn hàng",
      value: stats.total,
      icon: <Package className="h-4 w-4" />,
      colorClass: "text-gray-600",
    },
    {
      title: "Chờ xác nhận",
      value: stats.pending,
      icon: <Clock className="h-4 w-4" />,
      colorClass: "text-yellow-600",
    },
    {
      title: "Đã xác nhận",
      value: stats.confirmed,
      icon: <CheckCircle className="h-4 w-4" />,
      colorClass: "text-blue-600",
    },
    {
      title: "Đang xử lý",
      value: stats.processing,
      icon: <Settings className="h-4 w-4" />,
      colorClass: "text-purple-600",
    },
    {
      title: "Đang giao",
      value: stats.shipping,
      icon: <Truck className="h-4 w-4" />,
      colorClass: "text-orange-600",
    },
    {
      title: "Đã giao",
      value: stats.delivered,
      icon: <PackageCheck className="h-4 w-4" />,
      colorClass: "text-green-600",
    },
    {
      title: "Đã hủy",
      value: stats.cancelled,
      icon: <XCircle className="h-4 w-4" />,
      colorClass: "text-red-600",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {statCards.map((card) => (
        <StatCard key={card.title} {...card} />
      ))}
    </div>
  );
}
