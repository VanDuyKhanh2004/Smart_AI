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

describe('ScrollToTop route focus (R1)', () => {
  let focusSpy: ReturnType<typeof vi.spyOn>;

  function preventScrollFocusCalls() {
    return focusSpy.mock.calls.filter((args: unknown[]) => {
      const options = args[0] as { preventScroll?: boolean } | null | undefined;
      return options !== null && options !== undefined && options.preventScroll === true;
    });
  }

  function renderFocusRoutes() {
    return render(
      <MemoryRouter initialEntries={['/a']}>
        <ScrollToTop />
        <Routes>
          <Route
            path="/a"
            element={
              <main id="main-content" tabIndex={-1}>
                <div>a-page</div>
                <GoToB />
                <Link to="/a?ref=1">query-link</Link>
              </main>
            }
          />
          <Route
            path="/b"
            element={
              <main id="main-content" tabIndex={-1}>
                b-page
              </main>
            }
          />
        </Routes>
      </MemoryRouter>
    );
  }

  beforeEach(() => {
    scrollToSpy.mockClear();
    vi.spyOn(window, 'scrollTo').mockImplementation(scrollToSpy);
    focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not focus the main content region on initial mount', () => {
    renderFocusRoutes();

    expect(preventScrollFocusCalls()).toHaveLength(0);
    expect(document.activeElement).not.toBe(document.getElementById('main-content'));
  });

  it('focuses #main-content with preventScroll:true after pathname navigation', async () => {
    renderFocusRoutes();

    await userEvent.click(screen.getByRole('button', { name: 'go-b' }));
    expect(await screen.findByText('b-page')).toBeInTheDocument();

    expect(preventScrollFocusCalls()).toHaveLength(1);
    expect(document.activeElement).toBe(document.getElementById('main-content'));
    // Scroll-to-top still happens alongside the focus restore.
    expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });

  it('does not move focus on search-only navigation', async () => {
    renderFocusRoutes();

    await userEvent.click(screen.getByRole('link', { name: 'query-link' }));
    expect(screen.getByText('a-page')).toBeInTheDocument();

    expect(preventScrollFocusCalls()).toHaveLength(0);
    expect(scrollToSpy).toHaveBeenCalledTimes(1);
  });
});
