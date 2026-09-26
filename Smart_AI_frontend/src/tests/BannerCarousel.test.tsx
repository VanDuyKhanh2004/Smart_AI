import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  api: {
    selectedScrollSnap: vi.fn(() => 0),
    on: vi.fn(),
    canScrollNext: vi.fn(() => true),
    scrollNext: vi.fn(),
    scrollTo: vi.fn(),
  },
  setApi: vi.fn() as unknown as (api: unknown) => void,
}));

vi.mock('@/components/ui/carousel', async () => {
  const react = await import('react');
  return {
    Carousel: ({
      setApi,
      children,
    }: {
      setApi: (api: unknown) => void;
      children: React.ReactNode;
    }) => {
      react.useEffect(() => {
        setApi(h.api);
      }, [setApi]);
      return react.createElement('div', { 'data-testid': 'carousel' }, children);
    },
    CarouselContent: ({ children }: { children: React.ReactNode }) =>
      react.createElement('div', null, children),
    CarouselItem: ({ children }: { children: React.ReactNode }) =>
      react.createElement('div', null, children),
    CarouselPrevious: () =>
      react.createElement('button', { 'aria-label': 'Previous slide' }, 'prev'),
    CarouselNext: () =>
      react.createElement('button', { 'aria-label': 'Next slide' }, 'next'),
    CarouselApi: class {},
  };
});

import BannerCarousel from '@/features/products/components/BannerCarousel';

function mockMatchMedia(prefersReducedMotion: boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: query.includes('prefers-reduced-motion')
      ? prefersReducedMotion
      : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  })) as unknown as typeof window.matchMedia;
}

function renderCarousel() {
  const utils = render(
    <MemoryRouter>
      <BannerCarousel />
    </MemoryRouter>
  );
  const wrapper = utils.container.firstElementChild as HTMLElement;
  return { ...utils, wrapper };
}

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

const AUTOPLAY_TICK = 5000;

describe('BannerCarousel autoplay control (H07)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockMatchMedia(false);
    h.api.selectedScrollSnap.mockReturnValue(0);
    h.api.canScrollNext.mockReturnValue(true);
    h.api.scrollNext.mockClear();
    h.api.scrollTo.mockClear();
    h.api.on.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('rotates automatically after 5 seconds', async () => {
    renderCarousel();

    expect(h.api.scrollNext).not.toHaveBeenCalled();
    await advance(AUTOPLAY_TICK);
    expect(h.api.scrollNext).toHaveBeenCalledTimes(1);
  });

  it('pauses while the banner is hovered and resumes on leave', async () => {
    const { wrapper } = renderCarousel();

    await advance(AUTOPLAY_TICK);
    expect(h.api.scrollNext).toHaveBeenCalledTimes(1);

    fireEvent.mouseEnter(wrapper);
    await advance(AUTOPLAY_TICK * 3);
    expect(h.api.scrollNext).toHaveBeenCalledTimes(1);

    fireEvent.mouseLeave(wrapper);
    await advance(AUTOPLAY_TICK);
    expect(h.api.scrollNext).toHaveBeenCalledTimes(2);
  });

  it('pauses while focus is inside the banner and resumes on blur out', async () => {
    const { wrapper } = renderCarousel();
    const toggle = screen.getByRole('button', {
      name: 'Tạm dừng tự động chuyển banner',
    });

    fireEvent.focus(toggle);
    await advance(AUTOPLAY_TICK * 3);
    expect(h.api.scrollNext).not.toHaveBeenCalled();

    fireEvent.blur(toggle, { relatedTarget: document.body });
    await advance(AUTOPLAY_TICK);
    expect(h.api.scrollNext).toHaveBeenCalledTimes(1);
    expect(wrapper).toBeInTheDocument();
  });

  it('stays still when the user prefers reduced motion and disables the toggle', async () => {
    mockMatchMedia(true);
    renderCarousel();

    await advance(AUTOPLAY_TICK * 3);
    expect(h.api.scrollNext).not.toHaveBeenCalled();

    const toggle = screen.getByRole('button', {
      name: 'Tự động chuyển banner đã tắt theo cài đặt hệ thống',
    });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('exposes a play/pause toggle with aria-pressed that stops and restarts rotation', async () => {
    renderCarousel();

    const toggle = screen.getByRole('button', {
      name: 'Tạm dừng tự động chuyển banner',
    });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(toggle);
    const paused = screen.getByRole('button', {
      name: 'Bật lại tự động chuyển banner',
    });
    expect(paused).toHaveAttribute('aria-pressed', 'true');

    await advance(AUTOPLAY_TICK * 3);
    expect(h.api.scrollNext).not.toHaveBeenCalled();

    fireEvent.click(paused);
    expect(
      screen.getByRole('button', { name: 'Tạm dừng tự động chuyển banner' })
    ).toHaveAttribute('aria-pressed', 'false');

    await advance(AUTOPLAY_TICK);
    expect(h.api.scrollNext).toHaveBeenCalledTimes(1);
  });

  it('keeps previous/next controls and dot navigation', async () => {
    renderCarousel();

    expect(
      screen.getByRole('button', { name: 'Previous slide' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next slide' })).toBeInTheDocument();

    const dots = screen.getAllByRole('button', { name: /Chuyển đến banner / });
    expect(dots).toHaveLength(5);
    expect(dots[0]).toHaveAttribute('aria-current', 'true');

    fireEvent.click(dots[2]);
    expect(h.api.scrollTo).toHaveBeenCalledWith(2);
  });
});
