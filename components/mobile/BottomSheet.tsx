/**
 * components/mobile/BottomSheet.tsx
 * A bottom sheet for phones: dimmed backdrop, Escape / backdrop tap / close button to dismiss, focus moves in on
 * open and returns to the button that opened it, the page behind does not scroll, and the sheet never runs under
 * the bottom safe area. Sits above the bottom navigation so its own last row is never covered by it.
 */
import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface Props { open: boolean; onClose: () => void; title: string; children: React.ReactNode }

export const BottomSheet: React.FC<Props> = ({ open, onClose, title, children }) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    closeRef.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', key);
      document.body.style.overflow = prev;
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] md:hidden" role="presentation">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label={title}
        className="absolute inset-x-0 bottom-0 flex max-h-[90dvh] flex-col rounded-t-3xl bg-white shadow-2xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center justify-between px-4 pb-1 pt-3">
          <div className="mx-auto h-1 w-10 rounded-full bg-stone-300" aria-hidden="true" />
        </div>
        <div className="flex items-center justify-between px-4 pb-2">
          <h2 className="text-base font-bold text-stone-900">{title}</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close"
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-stone-600 hover:bg-stone-100 focus:outline-none focus-visible:ring-2"
            style={{ ['--tw-ring-color' as any]: 'var(--bw-green)' }}>
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
      </div>
    </div>
  );
};

export default BottomSheet;
