import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import Layout from '@/components/Layout';
import Footer from '@/components/layout/Footer';
import { useCompareStore } from '@/stores/compareStore';

const hasCanonicalPadding = (el: Element | null) => {
  expect(el).not.toBeNull();
  const className = el?.className ?? '';
  expect(className).toMatch(/\bpx-4\b/);
  expect(className).toMatch(/\bmd:px-8\b/);
};

describe('Layout padding', () => {
  it('applies canonical horizontal padding on main', () => {
    render(
      <MemoryRouter>
        <Layout>
          <div>content</div>
        </Layout>
      </MemoryRouter>
    );
    hasCanonicalPadding(document.getElementById('main-content'));
  });

  it('applies canonical horizontal padding on header inner container', () => {
    render(
      <MemoryRouter>
        <Layout>
          <div>content</div>
        </Layout>
      </MemoryRouter>
    );
    const header = screen.getByRole('banner');
    const inner = header.querySelector('.container');
    hasCanonicalPadding(inner);
    expect(inner?.className).not.toMatch(/\bcontainer\b.*\bcontainer\b/);
  });

  it('applies canonical horizontal padding on footer', () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    );
    const inner = screen.getByRole('contentinfo').querySelector('.container');
    hasCanonicalPadding(inner);
  });

  it('applies canonical horizontal padding on CompareBar when visible', () => {
    useCompareStore.setState({ items: ['product-1'] });
    render(
      <MemoryRouter>
        <Layout>
          <div>content</div>
        </Layout>
      </MemoryRouter>
    );
    const compareBar = document.querySelector('.fixed.bottom-0');
    const inner = compareBar?.querySelector('.container') ?? null;
    hasCanonicalPadding(inner);
    useCompareStore.setState({ items: [] });
  });
});
