import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ComplaintStatusBadge } from "./ComplaintStatusBadge";
import type { Complaint, ComplaintStatus } from "@/types/complaint.type";
import { getComplaintId } from "@/types/complaint.type";

interface ComplaintDetailDialogProps {
  complaint: Complaint | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateStatus: (id: string, status: ComplaintStatus) => void;
  onUpdateNotes: (id: string, notes: string) => void;
}

const STATUS_OPTIONS: { value: ComplaintStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-2 border-b border-border last:border-0">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <div className="col-span-2 text-sm">{children}</div>
    </div>
  );
}


export function ComplaintDetailDialog({
  complaint,
  isOpen,
  onClose,
  onUpdateStatus,
  onUpdateNotes,
}: ComplaintDetailDialogProps) {
  const [status, setStatus] = useState<ComplaintStatus>("open");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  // Sync local state with complaint data when dialog opens or complaint changes
  useEffect(() => {
    if (complaint) {
      setStatus(complaint.status);
      setResolutionNotes(complaint.resolutionNotes || "");
      setHasChanges(false);
    }
  }, [complaint]);

  const handleStatusChange = (newStatus: ComplaintStatus) => {
    setStatus(newStatus);
    setHasChanges(true);
  };

  const handleNotesChange = (notes: string) => {
    setResolutionNotes(notes);
    setHasChanges(true);
  };

  const handleSave = () => {
    if (!complaint) return;

    const complaintId = getComplaintId(complaint);
    if (!complaintId) return;

    if (status !== complaint.status) {
      onUpdateStatus(complaintId, status);
    }
    if (resolutionNotes !== (complaint.resolutionNotes || "")) {
      onUpdateNotes(complaintId, resolutionNotes);
    }
    setHasChanges(false);
  };

  const handleCancel = () => {
    if (complaint) {
      setStatus(complaint.status);
      setResolutionNotes(complaint.resolutionNotes || "");
      setHasChanges(false);
    }
    onClose();
  };

  if (!complaint) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Complaint Details
            <ComplaintStatusBadge type="priority" value={complaint.priority} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Basic Information */}
          <div className="space-y-1">
            <DetailRow label="Session ID">
              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                {complaint.sessionId}
              </code>
            </DetailRow>

            <DetailRow label="Complaint ID">
              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                {getComplaintId(complaint)}
              </code>
            </DetailRow>

            {complaint.conversationId && (
              <DetailRow label="Conversation ID">
                <code className="text-xs bg-muted px-1 py-0.5 rounded">
                  {typeof complaint.conversationId === 'object' 
                    ? (complaint.conversationId as { _id?: string })._id || JSON.stringify(complaint.conversationId)
                    : complaint.conversationId}
                </code>
              </DetailRow>
            )}
          </div>

          {/* Summary and Description */}
          <div className="space-y-1">
            <DetailRow label="Summary">
              {complaint.complaintSummary || <span className="text-muted-foreground">-</span>}
            </DetailRow>

            <DetailRow label="Description">
              <div className="whitespace-pre-wrap">
                {complaint.detailedDescription || <span className="text-muted-foreground">No description provided</span>}
              </div>
            </DetailRow>
          </div>

          {/* Contact Information */}
          <div className="space-y-1">
            <DetailRow label="Email">
              {complaint.customerContact?.email || <span className="text-muted-foreground">-</span>}
            </DetailRow>

            <DetailRow label="Phone">
              {complaint.customerContact?.phone || <span className="text-muted-foreground">-</span>}
            </DetailRow>
          </div>

          {/* Status and Priority */}
          <div className="space-y-1">
            <DetailRow label="Status">
              <Select value={status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </DetailRow>

            <DetailRow label="Priority">
              <ComplaintStatusBadge type="priority" value={complaint.priority} />
            </DetailRow>

            <DetailRow label="Assigned To">
              {complaint.assignedTo || <span className="text-muted-foreground">Unassigned</span>}
            </DetailRow>
          </div>

          {/* Tags */}
          <DetailRow label="Tags">
            {complaint.tags && complaint.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {complaint.tags.map((tag, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="text-muted-foreground">No tags</span>
            )}
          </DetailRow>

          {/* Resolution Notes */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              Resolution Notes
            </label>
            <Textarea
              value={resolutionNotes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Add resolution notes..."
              className="min-h-24"
            />
          </div>

          {/* Timestamps */}
          <div className="space-y-1 pt-2 border-t">
            <DetailRow label="Created">
              {formatDateTime(complaint.createdAt)}
            </DetailRow>

            <DetailRow label="Updated">
              {formatDateTime(complaint.updatedAt)}
            </DetailRow>

            {complaint.resolvedAt && (
              <DetailRow label="Resolved">
                {formatDateTime(complaint.resolvedAt)}
              </DetailRow>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
