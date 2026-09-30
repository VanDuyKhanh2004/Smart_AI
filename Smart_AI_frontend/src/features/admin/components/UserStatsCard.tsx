import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";
import type { UserStatsData } from "@/types/dashboard.type";

interface UserStatsCardProps {
  data: UserStatsData | null;
  isLoading?: boolean;
  /** W3-11: load failure state with a manual retry action */
  isError?: boolean;
  onRetry?: () => void;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: { period: string; count: number } }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-background border rounded-lg shadow-lg p-2">
        <p className="text-xs font-medium">{data.period}</p>
        <p className="text-xs text-purple-600">
          Người dùng mới: {data.count}
        </p>
      </div>
    );
  }
  return null;
}

export function UserStatsCard({ data, isLoading, isError, onRetry }: UserStatsCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Thống kê người dùng</CardTitle>
          <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
            <Users className="h-4 w-4 text-purple-600" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-8 w-24 bg-muted animate-pulse rounded mb-2" />
          <div className="h-[80px] bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Thống kê người dùng</CardTitle>
          <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
            <Users className="h-4 w-4 text-purple-600" />
          </div>
        </CardHeader>
        <CardContent>
          {/* H15: a failed dashboard fetch must never read as "no data" */}
          {isError ? (
            <div className="flex flex-col items-start gap-3">
              <Alert variant="destructive">
                <AlertDescription>Không thể tải thống kê người dùng.</AlertDescription>
              </Alert>
              {onRetry && (
                <Button variant="outline" size="sm" onClick={onRetry}>
                  Thử lại
                </Button>
              )}
            </div>
          ) : (
            <div className="text-muted-foreground text-sm">Không có dữ liệu</div>
          )}
        </CardContent>
      </Card>
    );
  }

  const totalNewUsers = data.newUsers.reduce((sum, item) => sum + item.count, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Thống kê người dùng</CardTitle>
        <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
          <Users className="h-4 w-4 text-purple-600" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {data.total.toLocaleString("vi-VN")}
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Tổng người dùng • +{totalNewUsers} mới trong kỳ
        </p>
        {data.newUsers.length > 0 && (
          <ResponsiveContainer width="100%" height={80}>
            <LineChart data={data.newUsers}>
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
