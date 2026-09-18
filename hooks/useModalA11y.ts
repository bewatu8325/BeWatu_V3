/**
 * hooks/useModalA11y.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Accessibility audit finding: every hand-rolled modal in this app had a
 * close button and, in some cases, an Escape handler, but none of them
 * moved focus into the dialog on open, trapped Tab/Shift+Tab inside it
 * while open, or restored focus to whatever opened it on close. A keyboard
 * user could Tab straight through a modal into the page behind the
 * (visual-only) overlay, and a screen-reader user got no indication a
 * dialog had even opened.
 *
 * Usage: attach `ref` to the actual dialog panel element (not the fixed
 * inset-0 overlay behind it), and put `role="dialog" aria-modal="true"` on
 * that same element.
 *
 *   const dialogRef = useRef<HTMLDivElement>(null);
 *   useModalA11y(dialogRef, onClose);
 *   return (
 *     <div className="fixed inset-0 ..." onClick={onClose}>
 *       <div ref={dialogRef} role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
 *         ...
 *       </div>
 *     </div>
 *   );
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useModalA11y(
  containerRef: React.RefObject<HTMLElement | null>,
  // Pass null for a mandatory dialog with no dismiss action (e.g. a
  // required consent screen) -- Escape is skipped, but the focus trap and
  // initial focus still apply.
  onClose: (() => void) | null
) {
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const container = containerRef.current;
    const focusable = container
      ? Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      : [];
    (focusable[0] ?? container)?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && onClose) {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !container) return;

      const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter(el => el.offsetParent !== null); // skip hidden elements
      if (nodes.length === 0) return;

      const first = nodes[0];
      const last  = nodes[nodes.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (!container.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);
}
