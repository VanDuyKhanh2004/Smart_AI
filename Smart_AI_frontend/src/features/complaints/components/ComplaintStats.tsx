import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ComplaintStatsData } from "@/types/complaint.type";

interface ComplaintStatsProps {
  stats: ComplaintStatsData | null;
  isLoading: boolean;
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

export function ComplaintStats({ stats, isLoading }: ComplaintStatsProps) {
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
