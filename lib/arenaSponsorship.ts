/**
 * lib/arenaSponsorship.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure logic for Arena sponsorship, shared by the directory, the Arena page,
 * the company manager and the admin queue. No React, no Firebase.
 *
 * The one rule everything hangs on: a company is a sponsor only while it has an
 * APPROVED sponsorship record whose dates cover "now". A logo, a name, or an
 * old record is never enough. `activeSponsorship()` is the only place that
 * decides this; every screen goes through it.
 *
 * Arena sponsorship (this file) is separate from challenge attribution: a
 * challenge always names the company that posted it, sponsor or not.
 *
 * api/arena-sponsorship.ts re-implements the same limits (routes under api/
 * cannot import from lib/), and test/arena-sponsorship checks both against the
 * same cases.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type SponsorshipStatus = 'pending_review' | 'approved' | 'rejected' | 'revoked' | 'withdrawn';

/** What a record looks like to the UI once timestamps are turned into milliseconds. */
export interface SponsorshipRecord {
  id: string;
  arenaId: string;
  companyId: string;
  companyName: string;
  status: SponsorshipStatus;
  exclusive: boolean;
  startMs: number | null;
  endMs: number | null;
  branding: SponsorBranding;
  /** True when the branding was edited after BeWatu approved it (shown in the admin queue). */
  brandingChangedSinceApproval?: boolean;
  approval?: { byName?: string; atMs?: number | null; note?: string } | null;
  note?: string | null;
  createdAtMs?: number | null;
}

export interface SponsorLink { label: string; url: string }

export interface SponsorBranding {
  primaryColor: string;         // #rrggbb
  tagline: string;
  description: string;
  website: string | null;       // https only
  links: SponsorLink[];         // https only
  logo: string | null;          // data:image/(png|jpeg|webp);base64,… (re-encoded by the browser)
  hasBanner?: boolean;          // the banner itself lives in arena_sponsorship_assets/{id}
}

export const LIMITS = {
  tagline: 120,
  description: 600,
  linkLabel: 40,
  links: 4,
  logoBytes: 100 * 1024,
  bannerBytes: 300 * 1024,
  maxTermDays: 731,
} as const;

// ── Is it active? ────────────────────────────────────────────────────────────

export type SponsorshipPhase = 'active' | 'scheduled' | 'expired' | 'pending' | 'rejected' | 'revoked' | 'withdrawn';

/** Where a record is in its life, from its status and dates. */
export function sponsorshipPhase(s: Pick<SponsorshipRecord, 'status' | 'startMs' | 'endMs'>, now: number = Date.now()): SponsorshipPhase {
  switch (s.status) {
    case 'pending_review': return 'pending';
    case 'rejected':       return 'rejected';
    case 'revoked':        return 'revoked';
    case 'withdrawn':      return 'withdrawn';
    case 'approved': {
      if (s.startMs == null || s.endMs == null) return 'pending'; // approved without dates is not a sponsorship
      if (now < s.startMs) return 'scheduled';
      if (now >= s.endMs)  return 'expired';
      return 'active';
    }
    default: return 'pending';
  }
}

export const isSponsorshipActive = (s: SponsorshipRecord, now: number = Date.now()) => sponsorshipPhase(s, now) === 'active';

/**
 * The sponsorship to show for an Arena, or null. If data ever contains two active
 * records for one Arena (the server prevents it), the one that started latest wins,
 * deterministically, rather than whichever happened to load first.
 */
export function activeSponsorship(list: SponsorshipRecord[], arenaId: string, now: number = Date.now()): SponsorshipRecord | null {
  const live = list.filter(s => s.arenaId === arenaId && isSponsorshipActive(s, now));
  if (live.length === 0) return null;
  return live.sort((a, b) => (b.startMs ?? 0) - (a.startMs ?? 0) || a.id.localeCompare(b.id))[0];
}

/** Two approved records conflict if their date ranges overlap and either is exclusive. */
export function sponsorshipsConflict(
  a: { startMs: number; endMs: number; exclusive: boolean },
  b: { startMs: number; endMs: number; exclusive: boolean },
): boolean {
  const overlap = a.startMs < b.endMs && b.startMs < a.endMs;
  return overlap && (a.exclusive || b.exclusive);
}

// ── Colour: accessible whatever the company picks ────────────────────────────

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;
export const DEFAULT_BRAND = '#244038'; // BeWatu's deep green

function hexToRgb(hex: string): [number, number, number] {
  const h = HEX_RE.test(hex) ? hex : DEFAULT_BRAND;
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
const toHex = (rgb: number[]) => '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

function luminance([r, g, b]: number[]): number {
  const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(hexToRgb(a)), lb = luminance(hexToRgb(b));
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const mix = (rgb: number[], target: number, t: number) => rgb.map(v => v + (target - v) * t);

export interface BrandTheme {
  /** The colour actually painted (the company's, nudged only if text would be unreadable on it). */
  bg: string;
  /** Text and icons on `bg`: white or near-black, whichever reads better. */
  fg: string;
  /** A quieter text colour on `bg`, still ≥ 4.5:1. */
  fgMuted: string;
  /** True when the company's colour had to be adjusted to stay readable. */
  adjusted: boolean;
  ratio: number;
}

const WHITE = '#ffffff';
const INK = '#14201b';
const MIN_TEXT = 4.5;

/**
 * Turns whatever colour a company picked into a header colour that text can sit on.
 * Dark and mid colours get white text; light colours get dark text. If neither reaches
 * 4.5:1 (some mid-tones), the colour is darkened step by step until white does.
 */
export function brandTheme(input: string | null | undefined): BrandTheme {
  const original = input && HEX_RE.test(input) ? input.toLowerCase() : DEFAULT_BRAND;
  let rgb = hexToRgb(original);
  const best = (hex: string) => {
    const w = contrastRatio(hex, WHITE), k = contrastRatio(hex, INK);
    return w >= k ? { fg: WHITE, ratio: w } : { fg: INK, ratio: k };
  };
  let hex = toHex(rgb);
  let pick = best(hex);
  if (pick.ratio < MIN_TEXT) {
    // Pull toward black until white text is readable.
    for (let t = 0.05; t <= 1 && pick.ratio < MIN_TEXT; t += 0.05) {
      hex = toHex(mix(rgb, 0, t));
      pick = { fg: WHITE, ratio: contrastRatio(hex, WHITE) };
    }
  }
  const muted = pick.fg === WHITE ? '#e7efeb' : '#33433b';
  const fgMuted = contrastRatio(hex, muted) >= MIN_TEXT ? muted : pick.fg;
  return { bg: hex, fg: pick.fg, fgMuted, adjusted: hex !== original, ratio: Math.round(pick.ratio * 100) / 100 };
}

// ── Links, text and images: what is allowed to be shown ──────────────────────

/** An https link without credentials, or null. Used for the website and extra links. */
export function safeHttpsUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    if (!u.hostname.includes('.') || /\.(local|internal|localhost)$/i.test(u.hostname)) return null;
    return u.toString();
  } catch { return null; }
}

export const IMAGE_DATA_URL_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Decoded size in bytes of a base64 data URL (without decoding it). */
export function dataUrlBytes(dataUrl: string): number {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

/** A logo or banner that is safe to put in an <img>: a re-encoded raster, within the size cap. */
export function safeImage(dataUrl: unknown, maxBytes: number): string | null {
  if (typeof dataUrl !== 'string' || !IMAGE_DATA_URL_RE.test(dataUrl)) return null;
  return dataUrlBytes(dataUrl) <= maxBytes ? dataUrl : null;
}

const cleanText = (v: unknown, max: number): string =>
  // eslint-disable-next-line no-control-regex
  (typeof v === 'string' ? v : '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Normalises branding read from Firestore (or typed into the form) into something
 * the UI can render without further checks. Never throws; unusable parts are dropped.
 */
export function normalizeBranding(raw: any): SponsorBranding {
  const links: SponsorLink[] = [];
  for (const l of Array.isArray(raw?.links) ? raw.links : []) {
    const url = safeHttpsUrl(l?.url);
    const label = cleanText(l?.label, LIMITS.linkLabel);
    if (url && label && links.length < LIMITS.links) links.push({ label, url });
  }
  return {
    primaryColor: typeof raw?.primaryColor === 'string' && HEX_RE.test(raw.primaryColor) ? raw.primaryColor.toLowerCase() : DEFAULT_BRAND,
    tagline: cleanText(raw?.tagline, LIMITS.tagline),
    description: cleanText(raw?.description, LIMITS.description),
    website: safeHttpsUrl(raw?.website),
    links,
    logo: safeImage(raw?.logo, LIMITS.logoBytes),
    hasBanner: !!raw?.hasBanner,
  };
}

const toMs = (v: any): number | null => {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v?.toMillis === 'function') return v.toMillis();
  if (typeof v?.seconds === 'number') return v.seconds * 1000;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};

/** Firestore document data -> the record the UI uses. */
export function toSponsorshipRecord(id: string, d: any): SponsorshipRecord {
  return {
    id,
    arenaId: String(d?.arenaId ?? ''),
    companyId: String(d?.companyId ?? ''),
    companyName: cleanText(d?.companyName, 120),
    status: (['pending_review', 'approved', 'rejected', 'revoked', 'withdrawn'] as const).includes(d?.status) ? d.status : 'pending_review',
    exclusive: d?.exclusive !== false,
    startMs: toMs(d?.startDate),
    endMs: toMs(d?.endDate),
    branding: normalizeBranding(d?.branding),
    brandingChangedSinceApproval: !!d?.brandingChangedSinceApproval,
    approval: d?.approval ? { byName: cleanText(d.approval.byName, 80), atMs: toMs(d.approval.at), note: cleanText(d.approval.note, 300) } : null,
    note: d?.note ? cleanText(d.note, 300) : null,
    createdAtMs: toMs(d?.createdAt),
  };
}

export const PHASE_LABEL: Record<SponsorshipPhase, string> = {
  active: 'Active', scheduled: 'Scheduled', expired: 'Expired', pending: 'Awaiting review',
  rejected: 'Not approved', revoked: 'Revoked', withdrawn: 'Withdrawn',
};
