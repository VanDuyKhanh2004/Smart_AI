import React, { Suspense, lazy } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import Layout from '@/components/Layout';

const neverLoads: Promise<{ default: React.ComponentType }> = new Promise(
  () => {}
);

const LazyChild = lazy(() => neverLoads);

describe('Layout Suspense', () => {
  it('keeps header and footer mounted while page content suspends', () => {
    render(
      <MemoryRouter>
        <Layout>
          <Suspense fallback={<div>Đang tải nội dung</div>}>
            <LazyChild />
          </Suspense>
        </Layout>
      </MemoryRouter>
    );

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByText('Đang tải nội dung')).toBeInTheDocument();
  });

  it('exposes main landmark with skip-target id while suspended', () => {
    render(
      <MemoryRouter>
        <Layout>
          <Suspense fallback={<div>Đang tải nội dung</div>}>
            <LazyChild />
          </Suspense>
        </Layout>
      </MemoryRouter>
    );

    const main = document.getElementById('main-content');
    expect(main).not.toBeNull();
    expect(main).toHaveAttribute('tabindex', '-1');
    expect(screen.getByText('Bỏ qua đến nội dung chính')).toBeInTheDocument();
  });

  it('renders children when not suspended', () => {
    render(
      <MemoryRouter>
        <Layout>
          <div>Nội dung trang</div>
        </Layout>
      </MemoryRouter>
    );

    expect(screen.getByText('Nội dung trang')).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });
});
