import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScrollToTop } from '@/components/ScrollToTop';

const scrollToSpy = vi.fn();

function GoToB() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/b')}>
      go-b
    </button>
  );
}

function renderRoutes() {
  return render(
    <MemoryRouter initialEntries={['/a']}>
      <ScrollToTop />
      <Routes>
        <Route
          path="/a"
          element={
            <div>
              <div>a-page</div>
              <GoToB />
              <Link to="/a?ref=1">query-link</Link>
            </div>
          }
        />
        <Route path="/b" element={<div>b-page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ScrollToTop (H11)', () => {
  beforeEach(() => {
    scrollToSpy.mockClear();
    vi.spyOn(window, 'scrollTo').mockImplementation(scrollToSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scrolls to the top when the route mounts and on every path change', async () => {
    renderRoutes();

    expect(scrollToSpy).toHaveBeenCalledWith(
      expect.objectContaining({ top: 0 })
    );

    await userEvent.click(screen.getByRole('button', { name: 'go-b' }));
    expect(await screen.findByText('b-page')).toBeInTheDocument();
    expect(scrollToSpy).toHaveBeenCalledTimes(2);
  });

  it('keeps the scroll position for query-string-only changes', async () => {
    renderRoutes();
    expect(scrollToSpy).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('link', { name: 'query-link' }));
    expect(screen.getByText('a-page')).toBeInTheDocument();
    expect(scrollToSpy).toHaveBeenCalledTimes(1);
  });
});
