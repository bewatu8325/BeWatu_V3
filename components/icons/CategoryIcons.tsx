/**
 * components/icons/CategoryIcons.tsx
 * BeWatu's organization-category icons, in the same family as the navigation icons: one 24px grid, one 1.75 stroke,
 * round caps and joins, drawn in currentColor so a tile can tint them.
 */
import React from 'react';
import type { CategoryKey } from '../../lib/organizations';

type P = { className?: string; style?: React.CSSProperties };
const base = (p: P) => ({
  width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const, focusable: false as const,
  className: p.className, style: p.style,
});

/** Mortarboard over a book: universities and colleges. */
export const UniversityIcon: React.FC<P> = p => (
  <svg {...base(p)}><path d="m2.8 9.2 9.2-4.4 9.2 4.4L12 13.6z" /><path d="M6.4 11.6v4.2c0 1.3 2.5 2.6 5.6 2.6s5.6-1.3 5.6-2.6v-4.2" /><path d="M21.2 9.2v5.6" /></svg>
);
/** A cross held in a rounded square: healthcare as a whole. */
export const HealthcareIcon: React.FC<P> = p => (
  <svg {...base(p)}><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><path d="M12 8v8M8 12h8" /></svg>
);
/** A flask: medical, biotech and pharma companies. */
export const MedicalCompanyIcon: React.FC<P> = p => (
  <svg {...base(p)}><path d="M9.2 3.8h5.6M10.2 3.8v5.4L5 18.2a1.6 1.6 0 0 0 1.4 2.4h11.2a1.6 1.6 0 0 0 1.4-2.4l-5.2-9V3.8" /><path d="M7.6 14.6h8.8" /></svg>
);
/** A building with a cross: hospitals and health systems. */
export const HospitalIcon: React.FC<P> = p => (
  <svg {...base(p)}><path d="M4.5 20.5V6.8a1.3 1.3 0 0 1 1.3-1.3h12.4a1.3 1.3 0 0 1 1.3 1.3v13.7" /><path d="M2.8 20.5h18.4" /><path d="M12 8.6v5M9.5 11.1h5" /><path d="M10 20.5v-3.4h4v3.4" /></svg>
);
/** A factory roofline with a chimney: manufacturing. */
export const ManufacturingIcon: React.FC<P> = p => (
  <svg {...base(p)}><path d="M3.5 20.5V11l5 3.2V11l5 3.2V11l5 3.2V6h2.8v14.5z" /><path d="M2.8 20.5h18.4" /><path d="M8 17.6h.01M12 17.6h.01M16 17.6h.01" /></svg>
);
/** Columns under a pediment: banks, insurers and investment firms. */
export const FinanceIcon: React.FC<P> = p => (
  <svg {...base(p)}><path d="m3.6 9.2 8.4-5 8.4 5z" /><path d="M6 11.6v6.2M10 11.6v6.2M14 11.6v6.2M18 11.6v6.2" /><path d="M3.6 20.2h16.8" /></svg>
);
/** Four tiles: everything else. */
export const OtherOrgIcon: React.FC<P> = p => (
  <svg {...base(p)}><rect x="4" y="4" width="6.6" height="6.6" rx="1.6" /><rect x="13.4" y="4" width="6.6" height="6.6" rx="1.6" /><rect x="4" y="13.4" width="6.6" height="6.6" rx="1.6" /><rect x="13.4" y="13.4" width="6.6" height="6.6" rx="1.6" /></svg>
);

export const CATEGORY_ICON_COMPONENT: Record<CategoryKey, React.FC<P>> = {
  colleges: UniversityIcon, medical: MedicalCompanyIcon, hospitals: HospitalIcon, manufacturing: ManufacturingIcon, finance: FinanceIcon, other: OtherOrgIcon,
};
