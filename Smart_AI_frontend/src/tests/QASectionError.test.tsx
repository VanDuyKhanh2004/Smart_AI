import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockGetProductQuestions } = vi.hoisted(() => ({
  mockGetProductQuestions: vi.fn(),
}));

vi.mock('@/services/qa.service', () => ({
  qaService: {
    getProductQuestions: (...args: unknown[]) =>
      mockGetProductQuestions(...args),
    createQuestion: vi.fn(),
    toggleUpvote: vi.fn(),
    deleteQuestion: vi.fn(),
  },
}));

import { QASection } from '@/features/products/components/QASection';

const ERROR_MESSAGE = 'Không thể tải câu hỏi. Vui lòng thử lại sau.';

function renderSection() {
  return render(
    <MemoryRouter>
      <QASection productId="p1" />
    </MemoryRouter>
  );
}

describe('QASection fetch error feedback (H09)', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGetProductQuestions.mockRejectedValue(new Error('network down'));
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('exposes the fetch error as an alert live region', async () => {
    renderSection();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(ERROR_MESSAGE);
    expect(
      alert.querySelector('[data-slot="alert-description"]')
    ).toHaveTextContent(ERROR_MESSAGE);
  });

  it('keeps the retry button available and re-runs the same fetch on click', async () => {
    renderSection();

    const retry = await screen.findByRole('button', { name: 'Thử lại' });
    expect(mockGetProductQuestions).toHaveBeenCalledTimes(1);

    fireEvent.click(retry);

    await waitFor(() => {
      expect(mockGetProductQuestions).toHaveBeenCalledTimes(2);
    });
    // Same page is re-requested and the error feedback stays announced
    expect(mockGetProductQuestions).toHaveBeenCalledWith('p1', {
      page: 1,
      limit: 10,
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(ERROR_MESSAGE);
    expect(
      screen.getByRole('button', { name: 'Thử lại' })
    ).toBeInTheDocument();
  });

  it('does not render the error alert while the fetch is still pending', () => {
    mockGetProductQuestions.mockReturnValue(new Promise(() => {}));
    renderSection();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
