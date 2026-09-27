import type React from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/**
 * Keeps Tab / Shift+Tab cycling inside an open drawer (H08).
 * Called from the drawer's onKeyDown; handles every Tab press itself so the
 * cycle is deterministic (and testable) instead of relying on browser
 * default focus movement, wrapping around at either end and pulling focus
 * back in if it ever sits outside the drawer.
 */
export function trapTabKey(
  event: React.KeyboardEvent<Element>,
  container: HTMLElement | null
): void {
  if (event.key !== 'Tab' || !container) return;

  const focusables = getFocusableElements(container);
  if (focusables.length === 0) {
    event.preventDefault();
    return;
  }

  event.preventDefault();

  const active = document.activeElement;
  const isInside = active instanceof HTMLElement && container.contains(active);
  const index = isInside ? focusables.indexOf(active as HTMLElement) : -1;

  let nextIndex: number;
  if (event.shiftKey) {
    nextIndex = index <= 0 ? focusables.length - 1 : index - 1;
  } else {
    nextIndex = index === -1 || index === focusables.length - 1 ? 0 : index + 1;
  }

  focusables[nextIndex].focus();
}
