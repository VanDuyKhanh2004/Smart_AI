import type { Pagination } from "./api.type";

export type ComplaintStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type ComplaintPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface CustomerContact {
  email?: string;
  phone?: string;
}

export interface Complaint {
  id: string;
  _id?: string; // MongoDB may return _id instead of id
  sessionId: string;
  conversationId?: string | { _id: string; sessionId?: string; messageCount?: number };
  complaintSummary?: string;
  detailedDescription?: string;
  customerContact?: CustomerContact;
  status: ComplaintStatus;
  priority: ComplaintPriority;
  assignedTo?: string;
  resolutionNotes?: string;
  resolvedAt?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

// Helper to get complaint ID (handles both id and _id)
export function getComplaintId(complaint: Complaint): string {
  return complaint.id || complaint._id || '';
}

export interface ComplaintFilters {
  status?: ComplaintStatus;
  priority?: ComplaintPriority;
  search?: string;
}

export interface GetComplaintsParams {
  page?: number;
  limit?: number;
  status?: ComplaintStatus;
  priority?: ComplaintPriority;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface GetComplaintsResponse {
  success: boolean;
  data: {
    complaints: Complaint[];
    pagination: Pagination;
  };
  message: string;
}

export interface GetComplaintByIdResponse {
  success: boolean;
  data: Complaint;
  message: string;
}


export interface UpdateComplaintRequest {
  status?: ComplaintStatus;
  priority?: ComplaintPriority;
  resolutionNotes?: string;
  assignedTo?: string;
}

export interface UpdateComplaintResponse {
  success: boolean;
  data: Complaint;
  message: string;
}

export interface ComplaintStatsData {
  overall: {
    totalComplaints: number;
    openComplaints: number;
    inProgressComplaints: number;
    resolvedComplaints: number;
    closedComplaints: number;
  };
  timeRange: {
    period: string;
    totalComplaints: number;
    resolvedComplaints: number;
    resolutionRate: number;
  };
  priorityDistribution: {
    urgent: number;
    high: number;
    medium: number;
    low: number;
  };
}

export interface GetComplaintStatsResponse {
  success: boolean;
  data: ComplaintStatsData;
  message: string;
}
