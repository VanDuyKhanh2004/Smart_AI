import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OrderTrendData } from "@/types/dashboard.type";

interface OrderTrendsChartProps {
  data: OrderTrendData[];
  isLoading?: boolean;
}

const STATUS_CONFIG = {
  pending: { name: "Chờ xác nhận", color: "#eab308" },
  confirmed: { name: "Đã xác nhận", color: "#3b82f6" },
  processing: { name: "Đang xử lý", color: "#8b5cf6" },
  shipping: { name: "Đang giao", color: "#f97316" },
  delivered: { name: "Đã giao", color: "#22c55e" },
  cancelled: { name: "Đã hủy", color: "#ef4444" },
};

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background border rounded-lg shadow-lg p-3">
        <p className="font-medium text-sm mb-2">{label}</p>
        {payload.map((entry) => {
          const config = STATUS_CONFIG[entry.dataKey as keyof typeof STATUS_CONFIG];
          return (
            <p
              key={entry.dataKey}
              className="text-sm"
              style={{ color: entry.color }}
            >
              {config?.name || entry.dataKey}: {entry.value}
            </p>
          );
        })}
      </div>
    );
  }
  return null;
}

export function OrderTrendsChart({ data, isLoading }: OrderTrendsChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Xu hướng đơn hàng</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground">
              Đang tải dữ liệu...
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Xu hướng đơn hàng</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            Không có dữ liệu
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Xu hướng đơn hàng</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="period"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              className="text-muted-foreground"
            />
            <YAxis
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              className="text-muted-foreground"
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              formatter={(value) => {
                const config = STATUS_CONFIG[value as keyof typeof STATUS_CONFIG];
                return config?.name || value;
              }}
            />
            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={config.color}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
