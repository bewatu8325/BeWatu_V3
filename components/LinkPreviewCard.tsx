/**
 * components/LinkPreviewCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The article card shown under a post (and in the composer before posting),
 * plus the loading skeleton and a text renderer that makes links clickable.
 *
 * The whole card is one link that opens the original article in a new tab.
 * With no usable image it becomes a text card (source, headline, description).
 * Everything comes from third-party pages, so it is only ever rendered as React
 * text, links are limited to http(s), and the image is https-only, loaded
 * without a referrer.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { LinkPreview } from '../types';
import { linkifyParts, safeHref } from '../lib/linkPreview';

const BORDER = '#e7e5e4';

interface CardProps {
  preview: LinkPreview;
  /** Composer only: shows a remove button. */
  onRemove?: () => void;
}

export const LinkPreviewCard: React.FC<CardProps> = ({ preview, onRemove }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const href = safeHref(preview.url);
  if (!href) return null;
  const showImage = !!preview.image && !imageFailed;
  const source = preview.siteName || preview.hostname;

  return (
    <div className="relative">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow ugc"
        className="block overflow-hidden rounded-xl border bg-white transition-colors hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
        style={{ borderColor: BORDER, ['--tw-ring-color' as any]: 'var(--bw-green)' }}
        aria-label={`${preview.title} — ${source} (opens in a new tab)`}
      >
        {showImage && (
          <img
            src={preview.image}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
            className="block w-full object-cover bg-stone-100"
            style={{ aspectRatio: '1.91 / 1' }}
          />
        )}
        <div className="px-3 py-2.5 sm:px-3.5 sm:py-3">
          <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-stone-600 min-w-0">
            <span className="truncate">{source}</span>
            {!showImage && <ExternalLink size={11} className="flex-shrink-0" aria-hidden="true" />}
          </p>
          <p className="mt-1 text-sm font-bold leading-snug text-stone-900 line-clamp-2 break-words">{preview.title}</p>
          {preview.description && (
            <p className="mt-1 text-xs leading-snug sm:leading-relaxed text-stone-600 line-clamp-2 break-words">{preview.description}</p>
          )}
          {preview.siteName && preview.siteName.toLowerCase() !== preview.hostname.toLowerCase() && (
            <p className="mt-1.5 text-[11px] text-stone-500 truncate">{preview.hostname}</p>
          )}
        </div>
      </a>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove link preview"
          title="Remove link preview"
          className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-stone-700 shadow ring-1 ring-black/10 hover:bg-white hover:text-stone-900 focus:outline-none focus-visible:ring-2"
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
};

export const LinkPreviewSkeleton: React.FC = () => (
  <div role="status" aria-live="polite" className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: BORDER }}>
    <span className="sr-only">Loading link preview…</span>
    <div className="w-full animate-pulse bg-stone-100" style={{ aspectRatio: '1.91 / 1' }} />
    <div className="px-3.5 py-3 space-y-2 animate-pulse">
      <div className="h-2.5 w-24 rounded bg-stone-200" />
      <div className="h-3.5 w-11/12 rounded bg-stone-200" />
      <div className="h-3 w-3/4 rounded bg-stone-100" />
    </div>
  </div>
);

/** Post text with its links made clickable. Plain React nodes: no HTML is ever injected. */
export const LinkifiedText: React.FC<{ text: string; className?: string }> = ({ text, className }) => (
  <p className={className}>
    {linkifyParts(text).map((part, i) =>
      part.type === 'link' ? (
        <a key={i} href={part.href} target="_blank" rel="noopener noreferrer nofollow ugc"
           className="underline break-all" style={{ color: 'var(--bw-green)' }}>{part.value}</a>
      ) : (
        <React.Fragment key={i}>{part.value}</React.Fragment>
      )
    )}
  </p>
);
