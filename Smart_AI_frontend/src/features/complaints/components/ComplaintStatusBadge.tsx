import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ComplaintStatus, ComplaintPriority } from "@/types/complaint.type";
import { getStatusColor, getPriorityColor } from "./complaint-status-meta";

interface ComplaintStatusBadgeProps {
  type: 'status' | 'priority';
  value: ComplaintStatus | ComplaintPriority;
}

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
