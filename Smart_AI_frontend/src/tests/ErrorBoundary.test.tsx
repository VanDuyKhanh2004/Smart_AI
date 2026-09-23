import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ErrorBoundary from '@/components/ErrorBoundary';

function Bomb(): React.ReactNode {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div>Nội dung bình thường</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Nội dung bình thường')).toBeInTheDocument();
  });

  it('renders Vietnamese fallback with Thử lại and Tải lại trang on error', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Đã xảy ra lỗi')).toBeInTheDocument();
    expect(
      screen.getByText(/trang này gặp sự cố không mong muốn/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Thử lại' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Tải lại trang' })
    ).toBeInTheDocument();
  });

  it('resets error state when Thử lại is clicked', async () => {
    const user = userEvent.setup();
    let shouldThrow = true;

    function Conditional(): React.ReactNode {
      if (shouldThrow) {
        throw new Error('boom');
      }
      return <div>Đã phục hồi</div>;
    }

    render(
      <ErrorBoundary>
        <Conditional />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();

    shouldThrow = false;
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(screen.getByText('Đã phục hồi')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reloads the page when Tải lại trang is clicked', async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, reload },
    });

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );

    await user.click(screen.getByRole('button', { name: 'Tải lại trang' }));
    expect(reload).toHaveBeenCalledTimes(1);

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: original,
    });
  });
});
