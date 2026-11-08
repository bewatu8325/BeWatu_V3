/**
 * components/mobile/BottomSheet.tsx
 * A bottom sheet on phones and a centred dialog on wide screens (when `allWidths`).
 *
 *   - Rendered in a portal on <body>, so no parent's stacking order, transform or overflow can hide or clip it, and it sits above
 *     the header, the bottom navigation and the page overlays (z-80).
 *   - Never taller than the visible screen (dvh, minus the top safe area); long content scrolls inside it, and the footer
 *     (primary actions) stays pinned and clear of the bottom safe area.
 *   - The page behind does not scroll (counted, so a sheet opened over another restores correctly).
 *   - Focus moves in on open, Tab stays inside, Escape and the backdrop dismiss, and focus returns to what opened it.
 */
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface Props {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
  /** Also show on wide screens, as a centred dialog (the default is phones only). */
  allWidths?: boolean;
  /** Pinned under the scrolling content (for a Done / Apply button). */
  footer?: React.ReactNode;
  /** Width on wide screens: a narrow dialog (default) or a wide one for forms with a preview. */
  size?: 'md' | 'xl';
}

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
let scrollLocks = 0; let savedOverflow = '';
const lockScroll = () => { if (scrollLocks++ === 0) { savedOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; } };
const unlockScroll = () => { if (--scrollLocks <= 0) { scrollLocks = 0; document.body.style.overflow = savedOverflow; } };

export const BottomSheet: React.FC<Props> = ({ open, onClose, title, children, allWidths = false, footer, size = 'md' }) => {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    closeRef.current?.focus();
    lockScroll();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current(); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      const nodes = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(n => n.offsetParent !== null || n === document.activeElement);
      if (nodes.length === 0) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && (document.activeElement === first || !panel.current.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !panel.current.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      unlockScroll();
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;
  const wide = size === 'xl' ? 'md:w-[min(64rem,calc(100vw-3rem))]' : 'md:w-[30rem]';
  return createPortal(
    <div className={`fixed inset-0 z-[80] ${allWidths ? '' : 'md:hidden'}`} role="presentation">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div ref={panel} role="dialog" aria-modal="true" aria-label={title}
        className={`bw-sheet-max absolute inset-x-0 bottom-0 flex flex-col rounded-t-3xl bg-white shadow-2xl ${allWidths ? `md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:max-h-[85vh] ${wide} md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl` : ''}`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center justify-between px-4 pb-1 pt-3 md:hidden">
          <div className="mx-auto h-1 w-10 rounded-full bg-stone-300" aria-hidden="true" />
        </div>
        <div className="flex items-center justify-between gap-3 px-4 pb-2 md:pt-4">
          <h2 className="min-w-0 text-base font-bold text-stone-900">{title}</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close"
            className="-mr-2 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-stone-600 hover:bg-stone-100 focus:outline-none focus-visible:ring-2"
            style={{ ['--tw-ring-color' as any]: 'var(--bw-green)' }}>
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
        {footer && <div className="border-t border-stone-100 px-4 pb-3 pt-3">{footer}</div>}
      </div>
    </div>,
    document.body
  );
};

export default BottomSheet;
