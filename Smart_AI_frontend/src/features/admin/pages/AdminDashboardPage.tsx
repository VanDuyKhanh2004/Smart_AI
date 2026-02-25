import { useState, useEffect, useCallback } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SummaryCards } from "../components/SummaryCards";
import { RevenueChart } from "../components/RevenueChart";
import { TopProductsTable } from "../components/TopProductsTable";
import { OrderTrendsChart } from "../components/OrderTrendsChart";
import { UserStatsCard } from "../components/UserStatsCard";
import { dashboardService } from "@/services/dashboard.service";
import type {
  PeriodFilter,
  DashboardSummary,
  RevenueData,
  TopProduct,
  OrderTrendData,
  UserStatsData,
} from "@/types/dashboard.type";

const PERIOD_OPTIONS = [
  { value: "daily", label: "Theo ngày" },
  { value: "weekly", label: "Theo tuần" },
  { value: "monthly", label: "Theo tháng" },
] as const;

export function AdminDashboardPage() {
  const [period, setPeriod] = useState<PeriodFilter>("daily");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [orderTrends, setOrderTrends] = useState<OrderTrendData[]>([]);
  const [userStats, setUserStats] = useState<UserStatsData | null>(null);

  const fetchDashboardData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [
        summaryRes,
        revenueRes,
        topProductsRes,
        orderTrendsRes,
        userStatsRes,
      ] = await Promise.all([
        dashboardService.getDashboardSummary(),
        dashboardService.getRevenueStats(period),
        dashboardService.getTopSellingProducts(10),
        dashboardService.getOrderTrends(period),
        dashboardService.getUserStats(period),
      ]);

      setSummary(summaryRes.data);
      setRevenueData(revenueRes.data);
      setTopProducts(topProductsRes.data);
      setOrderTrends(orderTrendsRes.data);
      setUserStats(userStatsRes.data);
    } catch (err) {
      console.error("Failed to fetch dashboard data:", err);
      setError("Không thể tải dữ liệu dashboard. Vui lòng thử lại.");
    } finally {
      setIsLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handlePeriodChange = (value: string) => {
    setPeriod(value as PeriodFilter);
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Select value={period} onValueChange={handlePeriodChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Chọn khoảng thời gian" />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="p-4 rounded-md bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <SummaryCards summary={summary} isLoading={isLoading} />

      {/* Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        <RevenueChart data={revenueData} isLoading={isLoading} />
        <OrderTrendsChart data={orderTrends} isLoading={isLoading} />
      </div>

      {/* Bottom Section */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TopProductsTable products={topProducts} isLoading={isLoading} />
        </div>
        <UserStatsCard data={userStats} isLoading={isLoading} />
      </div>
    </div>
  );
}
