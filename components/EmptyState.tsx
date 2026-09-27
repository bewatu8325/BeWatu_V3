import React from 'react';

// Extracted from the near-identical "no X yet" panel that had been
// hand-copied (with slightly different icon sizes, font weights, and
// wrapper chrome each time) into Messaging, ConnectionsView, Feed,
// Jobs, and CompaniesPage.
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  bordered?: boolean;
  tone?: 'white' | 'stone';
  compact?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  bordered = true,
  tone = 'white',
  compact = false,
  className = '',
  style,
}: EmptyStateProps) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center text-center',
        compact ? 'px-4 py-8' : 'px-6 py-16',
        bordered ? `rounded-2xl border shadow-sm ${tone === 'white' ? 'bg-white' : 'bg-stone-50'}` : '',
        className,
      ].filter(Boolean).join(' ')}
      style={{ ...(bordered ? { borderColor: '#e7e5e4' } : {}), ...style }}
    >
      {icon && <div className={`opacity-30 [&>svg]:h-12 [&>svg]:w-12 ${compact ? 'mb-3' : 'mb-4'}`}>{icon}</div>}
      <p className={compact ? 'text-sm text-stone-600' : 'text-lg font-medium text-stone-700'}>{title}</p>
      {description && <p className="text-sm mt-1.5 text-stone-600 max-w-sm">{description}</p>}
      {action && <div className={compact ? 'mt-4' : 'mt-6'}>{action}</div>}
    </div>
  );
}
