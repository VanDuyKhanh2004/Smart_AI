import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Scrolls the window back to the top whenever the route path changes (H11)
 * and restores focus to the main content region so SPA navigations are
 * announced to keyboard and screen-reader users (R1). Query-string or
 * hash-only changes keep the current scroll position and never move focus,
 * and the initial mount does not steal focus.
 */
export function ScrollToTop() {
  const { pathname } = useLocation();
  const isFirstRender = useRef(true);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });

    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // preventScroll keeps the scroll-to-top behavior above intact.
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [pathname]);

  return null;
}

export default ScrollToTop;
