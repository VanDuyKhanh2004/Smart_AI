import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ComplaintStatus, ComplaintPriority } from "@/types/complaint.type";

interface ComplaintStatusBadgeProps {
  type: 'status' | 'priority';
  value: ComplaintStatus | ComplaintPriority;
}

const statusColorMap: Record<ComplaintStatus, string> = {
  open: "bg-yellow-100 text-yellow-800 border-yellow-200",
  in_progress: "bg-blue-100 text-blue-800 border-blue-200",
  resolved: "bg-green-100 text-green-800 border-green-200",
  closed: "bg-gray-100 text-gray-800 border-gray-200",
};

const priorityColorMap: Record<ComplaintPriority, string> = {
  low: "bg-gray-100 text-gray-800 border-gray-200",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  urgent: "bg-red-100 text-red-800 border-red-200",
};

const statusLabelMap: Record<ComplaintStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

const priorityLabelMap: Record<ComplaintPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export function getStatusColor(status: ComplaintStatus): string {
  return statusColorMap[status] ?? statusColorMap.open;
}

export function getPriorityColor(priority: ComplaintPriority): string {
  return priorityColorMap[priority] ?? priorityColorMap.low;
}

export function ComplaintStatusBadge({ type, value }: ComplaintStatusBadgeProps) {
  const colorClass = type === 'status' 
    ? getStatusColor(value as ComplaintStatus)
    : getPriorityColor(value as ComplaintPriority);
  
  const label = type === 'status'
    ? statusLabelMap[value as ComplaintStatus] ?? value
    : priorityLabelMap[value as ComplaintPriority] ?? value;

  return (
    <Badge className={cn("font-medium", colorClass)}>
      {label}
    </Badge>
  );
}
