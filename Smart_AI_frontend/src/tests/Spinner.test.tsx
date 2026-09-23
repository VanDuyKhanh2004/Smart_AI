import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Spinner } from '@/components/ui/spinner';

describe('Spinner', () => {
  it('renders with role="status" and default label', () => {
    render(<Spinner />);
    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute('aria-label', 'Đang tải');
  });

  it('supports custom label', () => {
    render(<Spinner label="Đang xử lý" />);
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      'Đang xử lý'
    );
  });

  it('supports sm/md/lg sizes', () => {
    const first = render(<Spinner size="sm" />);
    expect(first.container.querySelector('svg')).toHaveClass('size-4');
    first.unmount();

    const second = render(<Spinner size="md" />);
    expect(second.container.querySelector('svg')).toHaveClass('size-6');
    second.unmount();

    const third = render(<Spinner size="lg" />);
    expect(third.container.querySelector('svg')).toHaveClass('size-8');
    third.unmount();
  });

  it('includes an icon hidden from accessibility tree', () => {
    const { container } = render(<Spinner />);
    const icon = container.querySelector('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });
});
