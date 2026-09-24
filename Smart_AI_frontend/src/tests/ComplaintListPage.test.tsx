import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComplaintListPage } from '@/features/complaints/pages/ComplaintListPage';

const mockGetComplaints = vi.fn();
const mockGetComplaintStats = vi.fn();
const mockUpdateComplaint = vi.fn();

vi.mock('@/services/complaint.service', () => ({
  complaintService: {
    getComplaints: (...args: unknown[]) => mockGetComplaints(...args),
    getComplaintStats: (...args: unknown[]) => mockGetComplaintStats(...args),
    updateComplaint: (...args: unknown[]) => mockUpdateComplaint(...args),
    getComplaintById: vi.fn(),
  },
}));

vi.mock('@/features/complaints/components/ComplaintStats', () => ({
  ComplaintStats: () => <div data-testid="complaint-stats" />,
}));

vi.mock('@/features/complaints/components/ComplaintFilters', () => ({
  ComplaintFilters: ({ onClearFilters }: { onClearFilters: () => void }) => (
    <button type="button" onClick={onClearFilters}>
      Clear filters
    </button>
  ),
}));

const complaint = {
  _id: 'c1',
  id: 'c1',
  subject: 'Sản phẩm lỗi',
  status: 'open',
  priority: 'medium',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  user: { _id: 'u1', name: 'User', email: 'u@e.com' },
};

vi.mock('@/features/complaints/components/ComplaintTable', () => ({
  ComplaintTable: ({
    complaints,
    onRowClick,
  }: {
    complaints: Array<{ id?: string; _id?: string }>;
    onRowClick: (c: unknown) => void;
  }) => (
    <div data-testid="complaint-table">
      <button
        type="button"
        onClick={() => onRowClick(complaints[0])}
        data-testid="open-detail"
      >
        Open row
      </button>
      <span>{complaints.length} rows</span>
    </div>
  ),
}));

vi.mock('@/features/complaints/components/ComplaintDetailDialog', () => ({
  ComplaintDetailDialog: ({
    isOpen,
    onClose,
    onUpdateStatus,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onUpdateStatus: (id: string, status: string) => void;
  }) => {
    if (!isOpen) return null;
    return (
      <div role="dialog" aria-label="Chi tiết khiếu nại">
        <button type="button" onClick={onClose}>
          Close dialog
        </button>
        <button
          type="button"
          onClick={() => onUpdateStatus('c1', 'resolved')}
          data-testid="update-status"
        >
          Update status
        </button>
      </div>
    );
  },
}));

function listResponse() {
  return {
    success: true,
    data: {
      complaints: [complaint],
      pagination: {
        currentPage: 1,
        totalPages: 1,
        totalCount: 1,
        limit: 10,
        hasNextPage: false,
        hasPrevPage: false,
        nextPage: null,
        prevPage: null,
      },
    },
  };
}

function statsResponse() {
  return {
    success: true,
    data: { total: 1, open: 1, resolved: 0, closed: 0 },
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/complaints']}>
        <Routes>
          <Route path="/complaints" element={<ComplaintListPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ComplaintListPage mutation errors (ERR-04)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetComplaints.mockResolvedValue(listResponse());
    mockGetComplaintStats.mockResolvedValue(statsResponse());
  });

  it('surfaces mutation rejection as destructive Alert and keeps dialog open', async () => {
    mockUpdateComplaint.mockImplementation(() =>
      new Promise((_resolve, reject) => {
        setTimeout(
          () =>
            reject(
              Object.assign(new Error('Request failed'), {
                response: {
                  data: { message: 'Không thể cập nhật khiếu nại' },
                },
              })
            ),
          0
        );
      })
    );

    const user = userEvent.setup();
    renderPage();

    await screen.findByTestId('open-detail');
    await user.click(screen.getByTestId('open-detail'));
    await user.click(screen.getByTestId('update-status'));

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent('Không thể cập nhật khiếu nại');
    // Dialog stays open on failure
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes dialog on successful mutation', async () => {
    mockUpdateComplaint.mockResolvedValue({
      success: true,
      data: { ...complaint, status: 'resolved' },
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByTestId('open-detail');
    await user.click(screen.getByTestId('open-detail'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByTestId('update-status'));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps query error distinct from mutation error', async () => {
    mockGetComplaints.mockRejectedValue(new Error('list down'));

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByText('Failed to load complaints. Please try again.')
      ).toBeInTheDocument();
    });
    // Mutation alert not shown for query failure
    expect(
      screen.queryByText('Không thể cập nhật khiếu nại')
    ).not.toBeInTheDocument();
  });

  it('does not show mutation Alert initially', async () => {
    mockUpdateComplaint.mockResolvedValue({ success: true, data: {} });
    renderPage();

    await screen.findByTestId('open-detail');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
