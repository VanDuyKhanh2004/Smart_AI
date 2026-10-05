import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ComplaintListPage } from '@/features/complaints/pages/ComplaintListPage';
import { ComplaintFilters } from '@/features/complaints/components/ComplaintFilters';
import { ComplaintDetailDialog } from '@/features/complaints/components/ComplaintDetailDialog';
import type { Complaint } from '@/types/complaint.type';

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
  ComplaintFilters: () => <div data-testid="complaint-filters" />,
}));

const complaint = {
  _id: 'c1',
  id: 'c1',
  subject: 'Sản phẩm lỗi',
  status: 'open',
  priority: 'medium',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

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

beforeAll(() => {
  if (typeof Element.prototype.scrollIntoView !== 'function') {
    Element.prototype.scrollIntoView = () => {};
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGetComplaints.mockResolvedValue(listResponse());
  mockGetComplaintStats.mockResolvedValue(statsResponse());
});

describe('M08 complaint save success announcement', () => {
  it('announces a successful details update after the dialog closes', async () => {
    mockUpdateComplaint.mockResolvedValue({
      success: true,
      data: { ...complaint, resolutionNotes: 'Đã xử lý xong' },
    });

    renderPage();

    fireEvent.click(
      await screen.findByRole('button', { name: /Xem chi tiết khiếu nại/ })
    );

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('combobox', { name: 'Complaint status' })
    ).toBeInTheDocument();

    const notes = within(dialog).getByLabelText('Resolution Notes');
    fireEvent.change(notes, { target: { value: 'Đã xử lý xong' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

    const title = await screen.findByText('Cập nhật thành công');
    expect(title.closest('[role="status"]')).not.toBeNull();
    expect(
      screen.getByText('Complaint details updated successfully.')
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});

describe('S05 complaint dialog labels', () => {
  it('gives the status select an accessible name and links the notes label', () => {
    render(
      <ComplaintDetailDialog
        complaint={complaint as unknown as Complaint}
        isOpen={true}
        onClose={vi.fn()}
        onUpdateStatus={vi.fn()}
        onUpdateNotes={vi.fn()}
      />
    );

    expect(
      screen.getByRole('combobox', { name: 'Complaint status' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Resolution Notes')).toBeInTheDocument();
  });
});

describe('S06 complaint filter labels', () => {
  it('names the search input and both filter selects', async () => {
    const { ComplaintFilters: RealFilters } = await vi.importActual<{
      ComplaintFilters: typeof ComplaintFilters;
    }>('@/features/complaints/components/ComplaintFilters');

    render(
      <RealFilters
        filters={{}}
        onFilterChange={vi.fn()}
        onSearch={vi.fn()}
        onClearFilters={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Search complaints')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Priority' })).toBeInTheDocument();
  });
});

describe('M09 complaint fetch error announcement', () => {
  it('exposes the list fetch failure as role="alert"', async () => {
    mockGetComplaints.mockRejectedValue(new Error('list down'));

    renderPage();

    const message = await screen.findByText(
      'Failed to load complaints. Please try again.'
    );
    expect(message.closest('[role="alert"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });
});
