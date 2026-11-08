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

// ── Classification ───────────────────────────────────────────────────────────
// Filtering by category never guesses from keywords. An organization belongs to a category when its recorded
// classification says so:
//   - its organization TYPE (a college or university is Education; a hospital or health system is Healthcare), or
//   - its INDUSTRY or any of its SUBINDUSTRIES is exactly (ignoring case, punctuation and "&" vs "and") one of the
//     category's own labels: the category name, its listed subcategories, or an explicit alias below.
// Anything else is "Other". The tables are data: adding a subcategory or alias is one line, and test/organizations
// checks this copy and api/companies.ts's copy are identical.

export type BroadKey = 'finance' | 'healthcare' | 'technology' | 'education' | 'manufacturing' | 'other';

export interface BroadCategory { key: BroadKey; label: string; subcategories: string[]; aliases: string[] }

export const BROAD_CATEGORIES: BroadCategory[] = [
  { key: 'finance', label: 'Finance',
    subcategories: ['Banking', 'Fintech', 'Financial Services', 'Insurance'],
    aliases: ['Finance', 'Financial', 'Banks', 'Financial Technology', 'Investment Banking', 'Asset Management', 'Wealth Management', 'Payments', 'Capital Markets', 'Lending', 'Credit Unions'] },
  { key: 'healthcare', label: 'Healthcare',
    subcategories: ['Hospitals', 'Health Systems', 'Pharmaceuticals', 'Biotechnology', 'Medical Devices'],
    aliases: ['Healthcare', 'Health Care', 'Health', 'Medical', 'Medicine', 'Life Sciences', 'Pharma', 'Biotech', 'Medical Device', 'Hospital', 'Health System', 'Diagnostics', 'Clinical Research', 'Health Services'] },
  { key: 'technology', label: 'Technology',
    subcategories: ['Software', 'Hardware', 'AI', 'IT Services'],
    aliases: ['Technology', 'Tech', 'Information Technology', 'IT', 'Artificial Intelligence', 'SaaS', 'Cloud Computing', 'Cybersecurity', 'Semiconductors', 'Computer Hardware', 'Internet', 'Software Development'] },
  { key: 'education', label: 'Education',
    subcategories: ['Colleges', 'Universities', 'Technical Institutions', 'Education Technology'],
    aliases: ['Education', 'Higher Education', 'College', 'University', 'Technical Institute', 'Vocational Education', 'Edtech', 'E-Learning'] },
  { key: 'manufacturing', label: 'Manufacturing',
    subcategories: [],
    aliases: ['Manufacturing', 'Industrial Manufacturing', 'Industrial', 'Machinery', 'Automotive Manufacturing', 'Electronics Manufacturing', 'Aerospace and Defense'] },
  { key: 'other', label: 'Other organizations', subcategories: [], aliases: [] },
];

/** The five shortcuts a first-time visitor sees, in this order: All, then these. They are suggestions, never applied filters. */
export const DEFAULT_PILLS: BroadKey[] = ['finance', 'healthcare', 'technology', 'education'];
export const BROAD_LABEL: Record<BroadKey, string> = Object.fromEntries(BROAD_CATEGORIES.map(c => [c.key, c.label])) as Record<BroadKey, string>;

/** "Financial & Services" and "financial and services" are the same label. */
export const normLabel = (v: unknown): string =>
  (typeof v === 'string' ? v : '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();

const LABEL_TO_BROAD = new Map<string, BroadKey>();
for (const c of BROAD_CATEGORIES) for (const l of [c.label, ...c.subcategories, ...c.aliases]) if (c.key !== 'other') LABEL_TO_BROAD.set(normLabel(l), c.key);

/** Every category an organization belongs to (never empty: "other" when none apply). */
export function classify(o: { organizationType?: unknown; industry?: unknown; subindustries?: unknown }): BroadKey[] {
  const out = new Set<BroadKey>();
  const type = normalizeType(o.organizationType);
  if (type === 'college_university') out.add('education');
  if (type === 'hospital' || type === 'health_system') out.add('healthcare');
  const labels = [o.industry, ...(Array.isArray(o.subindustries) ? o.subindustries : [])];
  for (const l of labels) { const k = LABEL_TO_BROAD.get(normLabel(l)); if (k) out.add(k); }
  return out.size ? BROAD_CATEGORIES.map(c => c.key).filter(k => out.has(k)) : ['other'];
}

/**
 * Which kind of profile an organization gets (the "About this ..." facts it can show). Type first, then what
 * classify() says for a business.
 */
export function categoryOf(o: { organizationType?: unknown; industry?: unknown; subindustries?: unknown }): CategoryKey {
  const type = normalizeType(o.organizationType);
  if (type === 'college_university') return 'colleges';
  if (type === 'hospital' || type === 'health_system') return 'hospitals';
  if (type === 'business') {
    const c = classify(o);
    if (c.includes('healthcare')) return 'medical';
    if (c.includes('manufacturing')) return 'manufacturing';
    if (c.includes('finance')) return 'finance';
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

// ── Category selections in links and saved preferences ──
// A selection is a set of categories joined with commas, always in BROAD_CATEGORIES order, so the same choice is always
// the same string. Unknown keys and duplicates are dropped; "other" is allowed.

/** "healthcare,finance" -> ['finance','healthcare'] (canonical order). */
export function parseCategoryParam(raw: unknown): BroadKey[] {
  const wanted = new Set(typeof raw === 'string' ? raw.split(',').map(s => s.trim()) : Array.isArray(raw) ? raw.map(String) : []);
  return BROAD_CATEGORIES.map(c => c.key).filter(k => wanted.has(k));
}
export const categoryParam = (keys: BroadKey[]): string => parseCategoryParam(keys).join(',');
