import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

function renderPagination(onSelect: () => void) {
  render(
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious disabled onClick={onSelect} />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink onClick={onSelect}>1</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink isActive onClick={onSelect}>
            2
          </PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationNext onClick={onSelect} />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="/products?page=3" onClick={onSelect}>
            3
          </PaginationLink>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

describe('Pagination accessibility (H05)', () => {
  it('renders href-less page items as focusable buttons', () => {
    const onSelect = vi.fn();
    renderPagination(onSelect);

    const pageOne = screen.getByRole('button', { name: '1' });
    expect(pageOne.tagName).toBe('BUTTON');
    expect(pageOne).toHaveAttribute('type', 'button');
    expect(pageOne).toBeInTheDocument();
    // No stray anchor without an href
    expect(screen.queryByRole('link', { name: '1' })).not.toBeInTheDocument();
  });

  it('activates a page button with the keyboard', async () => {
    const onSelect = vi.fn();
    renderPagination(onSelect);

    const pageOne = screen.getByRole('button', { name: '1' });
    pageOne.focus();
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledTimes(1);

    await userEvent.keyboard(' ');
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('marks the active page with aria-current', () => {
    const onSelect = vi.fn();
    renderPagination(onSelect);

    expect(screen.getByRole('button', { name: '2' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('button', { name: '1' })).not.toHaveAttribute(
      'aria-current'
    );
  });

  it('exposes real disabled semantics on boundary controls', async () => {
    const onSelect = vi.fn();
    renderPagination(onSelect);

    const previous = screen.getByRole('button', {
      name: 'Go to previous page',
    });
    expect(previous).toBeDisabled();

    previous.focus();
    await userEvent.keyboard('{Enter}');
    expect(onSelect).not.toHaveBeenCalled();

    const next = screen.getByRole('button', { name: 'Go to next page' });
    expect(next).not.toBeDisabled();
  });

  it('keeps anchor semantics when a real href is provided', async () => {
    const onSelect = vi.fn();
    renderPagination(onSelect);

    const pageThree = screen.getByRole('link', { name: '3' });
    expect(pageThree).toHaveAttribute('href', '/products?page=3');

    await userEvent.click(pageThree);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('ignores activation of a disabled anchor item', async () => {
    const onSelect = vi.fn();
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationLink href="#" disabled onClick={onSelect}>
              9
            </PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );

    const pageNine = screen.getByRole('link', { name: '9' });
    expect(pageNine).toHaveAttribute('aria-disabled', 'true');

    await userEvent.click(pageNine);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
