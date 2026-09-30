import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ComplaintStatsData } from "@/types/complaint.type";

interface ComplaintStatsProps {
  stats: ComplaintStatsData | null;
  isLoading: boolean;
  /** W3-11: load failure state with a manual retry action */
  isError?: boolean;
  onRetry?: () => void;
}

interface StatCardProps {
  title: string;
  value: number;
  description?: string;
  colorClass?: string;
}

function StatCard({ title, value, description, colorClass = "text-foreground" }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${colorClass}`}>{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

function StatCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-24" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-3 w-20 mt-1" />
      </CardContent>
    </Card>
  );
}

export function ComplaintStats({ stats, isLoading, isError, onRetry }: ComplaintStatsProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
    );
  }

  if (!stats) {
    // W3-11: a failed stats fetch must not silently render nothing
    if (isError) {
      return (
        <div role="alert" className="flex flex-wrap items-center gap-3">
          <Alert variant="destructive">
            <AlertDescription>Không thể tải thống kê khiếu nại.</AlertDescription>
          </Alert>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              Thử lại
            </Button>
          )}
        </div>
      );
    }
    return null;
  }

  const { overall } = stats;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Total Complaints"
        value={overall.totalComplaints}
        description="All time"
      />
      <StatCard
        title="Open"
        value={overall.openComplaints}
        description="Awaiting action"
        colorClass="text-yellow-600"
      />
      <StatCard
        title="In Progress"
        value={overall.inProgressComplaints}
        description="Being handled"
        colorClass="text-blue-600"
      />
      <StatCard
        title="Resolved"
        value={overall.resolvedComplaints}
        description="Successfully closed"
        colorClass="text-green-600"
      />
    </div>
  );
}
