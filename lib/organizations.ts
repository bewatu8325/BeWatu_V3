/**
 * lib/organizations.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * One model for everything in the directory: businesses, colleges and universities,
 * hospitals and health systems, and other organizations. Existing company records
 * are organizations of type "business" by default, so nothing needs migrating.
 *
 *   organizationType   WHAT KIND of organization it is (a fixed list)
 *   industry           the field it works in (free text, as before)
 *   subindustries      optional, finer-grained (e.g. "Semiconductors")
 *   category           derived (never stored): which of the four prominent
 *                      directory categories it belongs to
 *
 * api/companies.ts keeps a small copy of categoryOf()/normalizeType() (api/ routes
 * cannot import from lib/ on Vercel); test/organizations checks the two agree.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type OrganizationType =
  | 'business' | 'college_university' | 'hospital' | 'health_system'
  | 'research_institute' | 'nonprofit' | 'government' | 'other';

export const ORGANIZATION_TYPES: OrganizationType[] = [
  'business', 'college_university', 'hospital', 'health_system', 'research_institute', 'nonprofit', 'government', 'other',
];

export const ORG_TYPE_LABEL: Record<OrganizationType, string> = {
  business: 'Business',
  college_university: 'College or university',
  hospital: 'Hospital',
  health_system: 'Health system',
  research_institute: 'Research institute',
  nonprofit: 'Nonprofit',
  government: 'Government',
  other: 'Organization',
};

export type CategoryKey = 'colleges' | 'medical' | 'hospitals' | 'manufacturing' | 'finance' | 'other';

export interface CategoryInfo { key: CategoryKey; label: string; short: string; blurb: string }

/** The four prominent categories (in display order), then everything else. */
export const CATEGORIES: CategoryInfo[] = [
  { key: 'colleges',      label: 'Colleges & Universities',        short: 'Colleges',      blurb: 'Universities, colleges and institutes' },
  { key: 'medical',       label: 'Medical & Healthcare Companies', short: 'Medical',       blurb: 'Healthcare, medical, biotech and pharma companies' },
  { key: 'hospitals',     label: 'Hospitals & Health Systems',     short: 'Hospitals',     blurb: 'Hospitals and the health systems they belong to' },
  { key: 'manufacturing', label: 'Manufacturing',                  short: 'Manufacturing', blurb: 'Companies that make things' },
  { key: 'finance',       label: 'Finance',                        short: 'Finance',       blurb: 'Banks, insurers, investment and fintech companies' },
  { key: 'other',         label: 'Other organizations',            short: 'Other',         blurb: 'Everything else' },
];
export const CATEGORY_LABEL: Record<CategoryKey, string> = Object.fromEntries(CATEGORIES.map(c => [c.key, c.label])) as any;

export function normalizeType(raw: unknown): OrganizationType {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase().replace(/[\s-]+/g, '_') : '';
  return (ORGANIZATION_TYPES as string[]).includes(v) ? (v as OrganizationType) : 'business';
}

// Industries that make a *business* a "Medical & Healthcare Company".
export const HEALTH_INDUSTRY_RE = /(health|medical|medicine|biotech|pharma|life.?science|clinical|diagnostic|therapeut)/i;
export const MANUFACTURING_INDUSTRY_RE = /manufactur/i;
export const FINANCE_INDUSTRY_RE = /(financ|bank|insur|invest|wealth|asset management|capital markets|fintech|payments|lending|credit)/i;

/**
 * Which directory category an organization falls in.
 * Type decides first (a hospital is a hospital whatever its industry says); a business is then
 * placed by its industry. Records with no type are businesses, so every existing company keeps
 * working and lands where its industry puts it.
 */
export function categoryOf(o: { organizationType?: unknown; industry?: unknown }): CategoryKey {
  const type = normalizeType(o.organizationType);
  if (type === 'college_university') return 'colleges';
  if (type === 'hospital' || type === 'health_system') return 'hospitals';
  const industry = typeof o.industry === 'string' ? o.industry : '';
  if (type === 'business') {
    if (HEALTH_INDUSTRY_RE.test(industry)) return 'medical';
    if (MANUFACTURING_INDUSTRY_RE.test(industry)) return 'manufacturing';
    if (FINANCE_INDUSTRY_RE.test(industry)) return 'finance';
  }
  return 'other';
}

// ── Category-specific profile facts ──────────────────────────────────────────
// Stored as `profile` on the organization, only ever holding values from a named source
// (an import, or the organization's own administrator). Anything missing is simply not shown.

export interface ProfileFieldSpec { key: string; label: string; kind: 'text' | 'number' | 'year' | 'yesno' | 'rating' }
export interface ProfileSectionSpec { category: CategoryKey; title: string; fields: ProfileFieldSpec[] }

export const PROFILE_SECTIONS: Record<CategoryKey, ProfileSectionSpec> = {
  colleges: { category: 'colleges', title: 'About this institution', fields: [
    { key: 'control', label: 'Type', kind: 'text' }, { key: 'established', label: 'Founded', kind: 'year' },
    { key: 'enrollment', label: 'Students', kind: 'number' }, { key: 'campusSetting', label: 'Campus setting', kind: 'text' },
    { key: 'accreditation', label: 'Accreditation', kind: 'text' } ] },
  hospitals: { category: 'hospitals', title: 'About this facility', fields: [
    { key: 'facilityType', label: 'Facility type', kind: 'text' }, { key: 'ownership', label: 'Ownership', kind: 'text' },
    { key: 'beds', label: 'Beds', kind: 'number' }, { key: 'emergencyServices', label: 'Emergency services', kind: 'yesno' },
    { key: 'starRating', label: 'Overall rating', kind: 'rating' }, { key: 'established', label: 'Founded', kind: 'year' } ] },
  medical: { category: 'medical', title: 'About this company', fields: [
    { key: 'established', label: 'Founded', kind: 'year' }, { key: 'employeeRange', label: 'Employees', kind: 'text' },
    { key: 'regulatoryStatus', label: 'Regulatory status', kind: 'text' } ] },
  manufacturing: { category: 'manufacturing', title: 'About this manufacturer', fields: [
    { key: 'established', label: 'Founded', kind: 'year' }, { key: 'employeeRange', label: 'Employees', kind: 'text' },
    { key: 'sicDescription', label: 'Industry classification', kind: 'text' }, { key: 'exchange', label: 'Listed on', kind: 'text' } ] },
  finance: { category: 'finance', title: 'About this company', fields: [
    { key: 'established', label: 'Founded', kind: 'year' }, { key: 'employeeRange', label: 'Employees', kind: 'text' },
    { key: 'regulatoryStatus', label: 'Regulatory status', kind: 'text' }, { key: 'exchange', label: 'Listed on', kind: 'text' } ] },
  other: { category: 'other', title: 'About this organization', fields: [
    { key: 'established', label: 'Founded', kind: 'year' }, { key: 'employeeRange', label: 'Employees', kind: 'text' } ] },
};

/** Keeps only the fields this category defines, with the right kind of value. Never invents anything. */
export function sanitizeProfile(category: CategoryKey, raw: unknown): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  for (const f of PROFILE_SECTIONS[category].fields) {
    const v = r[f.key];
    if (v == null || v === '') continue;
    if (f.kind === 'number' || f.kind === 'year' || f.kind === 'rating') {
      const n = typeof v === 'number' ? v : Number(v);
      const max = f.kind === 'year' ? new Date().getFullYear() + 1 : f.kind === 'rating' ? 5 : 100_000_000;
      const min = f.kind === 'year' ? 600 : f.kind === 'rating' ? 1 : 0;
      if (Number.isFinite(n) && n >= min && n <= max) out[f.key] = f.kind === 'number' ? Math.round(n) : n;
    } else if (f.kind === 'yesno') {
      const s = String(v).trim().toLowerCase();
      if (['yes', 'y', 'true'].includes(s)) out[f.key] = 'Yes'; else if (['no', 'n', 'false'].includes(s)) out[f.key] = 'No';
    } else {
      const s = String(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
      if (s) out[f.key] = s;
    }
  }
  return out;
}

export function formatProfileValue(kind: ProfileFieldSpec['kind'], v: string | number): string {
  if (kind === 'number') return Number(v).toLocaleString();
  if (kind === 'rating') return `${v} of 5`;
  return String(v);
}

export interface OrganizationLocation { city?: string; region?: string; country?: string; countryCode?: string }

export function locationText(l: OrganizationLocation | null | undefined): string {
  if (!l) return '';
  return [l.city, l.region && l.region !== l.city ? l.region : '', l.country].filter(Boolean).join(', ');
}

// ── Category groups: what the Organizations page offers as "popular" choices ──
// A group is one choice in the picker that can stand for more than one category (Healthcare = healthcare companies
// AND hospitals/health systems). The server takes a category filter as a comma-separated list of keys.
export interface CategoryGroup { id: string; label: string; keys: CategoryKey[] }

export const POPULAR_GROUPS: CategoryGroup[] = [
  { id: 'universities',  label: 'Universities',  keys: ['colleges'] },
  { id: 'healthcare',    label: 'Healthcare',    keys: ['medical', 'hospitals'] },
  { id: 'manufacturing', label: 'Manufacturing', keys: ['manufacturing'] },
  { id: 'finance',       label: 'Finance',       keys: ['finance'] },
];

/** "medical,hospitals" -> ['medical','hospitals']; unknown keys and duplicates are dropped. */
export function parseCategoryParam(raw: unknown): CategoryKey[] {
  if (typeof raw !== 'string') return [];
  const out: CategoryKey[] = [];
  for (const part of raw.split(',')) {
    const k = part.trim() as CategoryKey;
    if (CATEGORIES.some(c => c.key === k) && !out.includes(k)) out.push(k);
  }
  return out;
}
/** The canonical string for a set of categories (CATEGORIES order), so the same choice is always the same value. */
export function categoryParam(keys: CategoryKey[]): string {
  return CATEGORIES.filter(c => keys.includes(c.key)).map(c => c.key).join(',');
}
/** The label for a selected set: a popular group's own name when it matches exactly, else the category names. */
export function categorySelectionLabel(param: string): string {
  const keys = parseCategoryParam(param);
  if (keys.length === 0) return '';
  const canon = categoryParam(keys);
  const group = POPULAR_GROUPS.find(g => categoryParam(g.keys) === canon);
  if (group) return group.label;
  return CATEGORIES.filter(c => keys.includes(c.key)).map(c => c.label).join(' and ');
}
