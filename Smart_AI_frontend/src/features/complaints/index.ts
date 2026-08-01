// Export pages
export { ComplaintListPage } from './pages/ComplaintListPage';

// Export components for the complaints feature
export { ComplaintStatusBadge } from './components/ComplaintStatusBadge';
export { getStatusColor, getPriorityColor } from './components/complaint-status-meta';
export { ComplaintStats } from './components/ComplaintStats';
export { ComplaintFilters } from './components/ComplaintFilters';
export { ComplaintTable } from './components/ComplaintTable';
export { ComplaintDetailDialog } from './components/ComplaintDetailDialog';

// Export hooks
export {
  useComplaints,
  useComplaintStats,
  useComplaint,
  useUpdateComplaint,
  complaintKeys,
} from './hooks/useComplaints';
export type {
  UseComplaintsReturn,
  UseComplaintStatsReturn,
  UseComplaintReturn,
  UseUpdateComplaintReturn,
} from './hooks/useComplaints';
