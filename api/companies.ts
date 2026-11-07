// api/companies.ts
// ─────────────────────────────────────────────────────────────────────────────
// Everything the Organizations directory (formerly "Companies") needs from the server.
// Every record is an organization: a business (the default for every existing company),
// a college or university, a hospital, a health system, or another kind. See lib/organizations.ts.
//
//   list      12 organizations at a time, with search (name, industry, location), a category
//             (Colleges & Universities, Medical & Healthcare Companies, Hospitals & Health
//             Systems, Manufacturing, Other), an organization type, an industry, a country,
//             activity filters (hiring / live challenges / Arena sponsor), four sorts
//             (relevance, recent activity, most followed, A–Z) and three views (For You,
//             Following, All). Paged by a keyset cursor, so a record can never appear twice
//             or be skipped, and `total` always reflects the current search and filters.
//             Facet counts for each filter are what you would get by choosing it now,
//             given every OTHER filter.
//   suggest   search suggestions as someone types.
//   detail    a company's real activity: open roles, live challenges, Arena
//             sponsorship, and related challenges in the same Arenas.
//   follow / unfollow   idempotent, with an honest follower count.
//   claim     ask to administer a company. Ownership is only granted when the
//             caller's VERIFIED corporate email belongs to the company's own
//             domain; anything else goes to a person (support ticket) or is refused.
//
// Honesty rule: every number or label in a response comes from a real record
// (an open job, a live challenge, an approved and currently running sponsorship,
// a follow). Nothing is estimated, padded or invented, and a company with no
// activity simply shows none.
//
// Why a route and not browser queries: Firestore cannot do case-insensitive
// search, relevance ranking or filtered counts, and a browser should not read
// every record to do it. The directory is held in memory per server instance and
// filtered there; the browser only ever receives the page it asked for.
//
// Scale: up to SNAPSHOT_THRESHOLD records, the companies collection is read directly
// (at most once a minute per instance). Beyond that, one instance at a time (guarded
// by a lease) condenses it into a few hundred-record chunks in `directory_snapshot`
// every SNAPSHOT_MS, and every instance reads those chunks (about one read per 400
// records) instead of the whole collection. The 12 records on the page are always
// re-read live, so follower counts and ownership on screen are current; a brand new
// record can take up to SNAPSHOT_MS to appear in a large directory.
//
// POST /api/companies   Authorization: Bearer <idToken>   { action, ... }
// Self-contained on purpose: api/ routes cannot import from lib/ on Vercel.
// ─────────────────────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export interface Caller { uid: string; email?: string; emailVerified?: boolean }

const PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 24;
const CACHE_MS = 60_000;
const SNAPSHOT_THRESHOLD = 1500;     // above this many records, read the condensed snapshot instead
const SNAPSHOT_MS = 10 * 60_000;     // how long a snapshot is trusted
const SNAPSHOT_LEASE_MS = 3 * 60_000;
const SNAPSHOT_CHUNK = 400;
const MAX_ORGS = 60_000;
const SNAP = 'directory_snapshot';
const SUPPORT_EMAIL = 'support@bewatu.com';

// ── The organization model (a small copy of lib/organizations.ts; test/organizations checks they agree) ──
export type OrgType = 'business' | 'college_university' | 'hospital' | 'health_system' | 'research_institute' | 'nonprofit' | 'government' | 'other';
const ORG_TYPES: OrgType[] = ['business', 'college_university', 'hospital', 'health_system', 'research_institute', 'nonprofit', 'government', 'other'];
export type CategoryKey = 'colleges' | 'medical' | 'hospitals' | 'manufacturing' | 'other';
const CATEGORY_KEYS: { key: CategoryKey; label: string }[] = [
  { key: 'colleges', label: 'Colleges & Universities' }, { key: 'medical', label: 'Medical & Healthcare Companies' },
  { key: 'hospitals', label: 'Hospitals & Health Systems' }, { key: 'manufacturing', label: 'Manufacturing' }, { key: 'other', label: 'Other organizations' },
];
const TYPE_LABEL: Record<OrgType, string> = {
  business: 'Business', college_university: 'College or university', hospital: 'Hospital', health_system: 'Health system',
  research_institute: 'Research institute', nonprofit: 'Nonprofit', government: 'Government', other: 'Organization',
};
export function normalizeType(raw: unknown): OrgType {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase().replace(/[\s-]+/g, '_') : '';
  return (ORG_TYPES as string[]).includes(v) ? (v as OrgType) : 'business';
}
const HEALTH_INDUSTRY_RE = /(health|medical|medicine|biotech|pharma|life.?science|clinical|diagnostic|therapeut)/i;
const MANUFACTURING_INDUSTRY_RE = /manufactur/i;
export function categoryOf(o: { organizationType?: unknown; industry?: unknown }): CategoryKey {
  const type = normalizeType(o.organizationType);
  if (type === 'college_university') return 'colleges';
  if (type === 'hospital' || type === 'health_system') return 'hospitals';
  const industry = typeof o.industry === 'string' ? o.industry : '';
  if (type === 'business') {
    if (HEALTH_INDUSTRY_RE.test(industry)) return 'medical';
    if (MANUFACTURING_INDUSTRY_RE.test(industry)) return 'manufacturing';
  }
  return 'other';
}
// Every key a category-specific profile may carry (see PROFILE_SECTIONS in lib/organizations.ts).
const PROFILE_KEYS = new Set(['control', 'established', 'enrollment', 'campusSetting', 'accreditation', 'facilityType', 'ownership', 'beds', 'emergencyServices', 'starRating', 'employeeRange', 'regulatoryStatus', 'sicDescription', 'exchange']);

// ── Types ────────────────────────────────────────────────────────────────────
interface Lite {
  id: string; numericId: number | null; name: string; nameLower: string;
  industry: string; industryKey: string; description: string; logoUrl: string;
  website: string; domain: string; ticker: string; tickerLower: string;
  verified: boolean; followerCount: number; hasAdmin: boolean;
  orgType: OrgType; category: CategoryKey;
  subindustries: string[]; subLower: string;
  city: string; region: string; country: string; countryKey: string; locationLower: string;
  parentId: string;
}
interface Activity { openJobs: number; liveChallenges: number; sponsoredArenas: string[]; lastActivityMs: number | null }
interface Directory {
  at: number; version: number; fromSnapshot: boolean;
  companies: Lite[]; byId: Map<string, Lite>;
  activity: Map<string, Activity>;
  jobs: Map<string, { title: string; location: string; type: string; atMs: number | null }[]>;
  challenges: { id: string; companyId: string; title: string; arenaId: string; arenaName: string; prize: number; deadlineMs: number; atMs: number | null }[];
  sponsorships: Map<string, { arenaId: string; arenaName: string; startMs: number }[]>;
  industries: Map<string, { label: string; count: number }>;
}

let cache: Directory | null = null;
let versionCounter = 0;
export const resetDirectoryCache = () => { cache = null; };

const clean = (v: unknown, max: number) =>
  // eslint-disable-next-line no-control-regex
  (typeof v === 'string' ? v : '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

const toMs = (v: any): number | null => {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v?.toMillis === 'function') return v.toMillis();
  if (typeof v?.seconds === 'number') return v.seconds * 1000;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};

const hostOf = (raw: string): string => {
  try { return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
};

const httpsOrEmpty = (raw: unknown): string => {
  if (typeof raw !== 'string') return '';
  try { const u = new URL(raw.trim()); return u.protocol === 'https:' && !u.username && !u.password ? u.toString() : ''; } catch { return ''; }
};

// ── Loading the directory ────────────────────────────────────────────────────
const LITE_FIELDS = ['name', 'industry', 'description', 'logoUrl', 'website', 'domain', 'ticker', 'verificationStatus', 'followerCount', 'adminUid', 'numericId',
  'organizationType', 'subindustries', 'location', 'parentId'];

function toLite(id: string, x: FirebaseFirestore.DocumentData): Lite | null {
  const name = clean(x.name, 120);
  if (!name) return null;
  const website = httpsOrEmpty(x.website);
  const domain = (clean(x.domain, 120) || hostOf(website)).toLowerCase().replace(/^www\./, '');
  const industry = clean(x.industry, 60);
  const orgType = normalizeType(x.organizationType);
  const subindustries: string[] = Array.isArray(x.subindustries) ? x.subindustries.map((v: unknown) => clean(v, 50)).filter(Boolean).slice(0, 8) : [];
  const loc = x.location && typeof x.location === 'object' ? x.location : typeof x.location === 'string' ? { city: x.location } : {};
  const city = clean(loc.city, 60), region = clean(loc.region, 60), country = clean(loc.country, 60);
  return {
    id, numericId: typeof x.numericId === 'number' && x.numericId > 0 ? x.numericId : null,
    name, nameLower: name.toLowerCase(), industry, industryKey: industry.toLowerCase(),
    description: clean(x.description, 220), logoUrl: httpsOrEmpty(x.logoUrl), website, domain,
    ticker: clean(x.ticker, 12), tickerLower: clean(x.ticker, 12).toLowerCase(),
    verified: x.verificationStatus === 'verified', followerCount: Math.max(0, Number(x.followerCount) || 0), hasAdmin: !!x.adminUid,
    orgType, category: categoryOf({ organizationType: orgType, industry }),
    subindustries, subLower: subindustries.join(' ').toLowerCase(),
    city, region, country, countryKey: country.toLowerCase(), locationLower: [city, region, country].join(' ').toLowerCase().trim(),
    parentId: typeof x.parentId === 'string' && x.parentId.length <= 128 && !x.parentId.includes('/') ? x.parentId : '',
  };
}

async function scanCompanies(db: Firestore, limit: number): Promise<Lite[]> {
  const snap = await db.collection('companies').select(...LITE_FIELDS).limit(limit).get();
  const out: Lite[] = [];
  for (const d of snap.docs) { const l = toLite(d.id, d.data()); if (l) out.push(l); }
  return out;
}

async function readSnapshot(db: Firestore, meta: FirebaseFirestore.DocumentData): Promise<Lite[] | null> {
  const n = Number(meta.chunks) || 0;
  if (!meta.gen || n < 1 || n > 500) return null;
  const refs = Array.from({ length: n }, (_, i) => db.collection(SNAP).doc(`c_${meta.gen}_${i}`));
  const docs = await db.getAll(...refs);
  const out: Lite[] = [];
  for (const d of docs) {
    if (!d.exists) return null; // a half-replaced snapshot: let the caller fall back
    const items = d.data()?.items;
    if (Array.isArray(items)) out.push(...(items as Lite[]));
  }
  return out;
}

async function takeLease(db: Firestore, now: number): Promise<boolean> {
  const ref = db.collection(SNAP).doc('lease');
  return db.runTransaction(async tx => {
    const cur = (await tx.get(ref)).data() as { until?: number } | undefined;
    if (cur?.until && cur.until > now) return false;
    tx.set(ref, { until: now + SNAPSHOT_LEASE_MS });
    return true;
  });
}

async function buildSnapshot(db: Firestore, now: number): Promise<Lite[]> {
  const rows = await scanCompanies(db, MAX_ORGS);
  const gen = String(now);
  const chunks = Math.ceil(rows.length / SNAPSHOT_CHUNK);
  for (let i = 0; i < chunks; i += 100) {
    const batch = db.batch();
    for (let j = i; j < Math.min(chunks, i + 100); j++) {
      batch.set(db.collection(SNAP).doc(`c_${gen}_${j}`), { items: rows.slice(j * SNAPSHOT_CHUNK, (j + 1) * SNAPSHOT_CHUNK) });
    }
    await batch.commit();
  }
  const metaRef = db.collection(SNAP).doc('meta');
  const old = (await metaRef.get()).data();
  await metaRef.set({ gen, chunks, count: rows.length, builtAtMs: now });
  // Tidy up the previous generation (best effort; readers of the old one fall back safely).
  if (old?.gen && old.gen !== gen) {
    try {
      const b = db.batch();
      for (let j = 0; j < (Number(old.chunks) || 0) && j < 500; j++) b.delete(db.collection(SNAP).doc(`c_${old.gen}_${j}`));
      await b.commit();
    } catch { /* leftovers are harmless */ }
  }
  return rows;
}

async function loadRows(db: Firestore, now: number): Promise<{ rows: Lite[]; fromSnapshot: boolean }> {
  const meta = (await db.collection(SNAP).doc('meta').get()).data();
  const fresh = !!meta && typeof meta.builtAtMs === 'number' && now >= meta.builtAtMs && now - meta.builtAtMs < SNAPSHOT_MS;
  if (meta && fresh) {
    const rows = await readSnapshot(db, meta);
    if (rows) return { rows, fromSnapshot: true };
  }
  if (meta) {
    // Stale: one instance rebuilds; everyone else keeps serving the last good snapshot.
    if (await takeLease(db, now)) { try { return { rows: await buildSnapshot(db, now), fromSnapshot: true }; } catch (e: any) { console.error('snapshot build failed:', e?.code ?? e?.message); } }
    const rows = await readSnapshot(db, meta);
    if (rows) return { rows, fromSnapshot: true };
  }
  // No snapshot (yet). A small directory is simply read; a large one builds its first snapshot.
  const first = await scanCompanies(db, SNAPSHOT_THRESHOLD + 1);
  if (first.length <= SNAPSHOT_THRESHOLD) return { rows: first, fromSnapshot: false };
  if (await takeLease(db, now)) { try { return { rows: await buildSnapshot(db, now), fromSnapshot: true }; } catch (e: any) { console.error('snapshot build failed:', e?.code ?? e?.message); } }
  return { rows: await scanCompanies(db, MAX_ORGS), fromSnapshot: false };
}

async function loadDirectory(db: Firestore, now: number): Promise<Directory> {
  if (cache && now - cache.at < CACHE_MS && now >= cache.at) return cache;

  const [{ rows: loaded, fromSnapshot }, jobSnap, challengeSnap, sponsorSnap, arenaSnap] = await Promise.all([
    loadRows(db, now),
    db.collection('jobs').where('status', '==', 'Active').limit(1000).get(),
    db.collection('arena_challenges').where('verificationStatus', '==', 'live').limit(600).get(),
    db.collection('arena_sponsorships').where('status', '==', 'approved').limit(300).get(),
    db.collection('arena_industries').limit(60).get(),
  ]);

  const arenaName = new Map<string, string>();
  arenaSnap.docs.forEach(d => arenaName.set(d.id, clean(d.data().name, 80) || d.id));

  const companies: Lite[] = [];
  const byId = new Map<string, Lite>();
  const byNumeric = new Map<number, string>();
  for (const c of loaded) {
    if (byId.has(c.id)) continue;
    companies.push(c); byId.set(c.id, c);
    if (c.numericId != null) byNumeric.set(c.numericId, c.id);
  }

  const activity = new Map<string, Activity>();
  const act = (id: string): Activity => { let a = activity.get(id); if (!a) { a = { openJobs: 0, liveChallenges: 0, sponsoredArenas: [], lastActivityMs: null }; activity.set(id, a); } return a; };
  const bump = (a: Activity, ms: number | null) => { if (ms != null && (a.lastActivityMs == null || ms > a.lastActivityMs)) a.lastActivityMs = ms; };

  // Open roles: active, verified-live (or not subject to verification), not expired.
  const jobs = new Map<string, { title: string; location: string; type: string; atMs: number | null }[]>();
  for (const d of jobSnap.docs) {
    const j = d.data();
    if (j.verificationStatus === 'hidden' || j.verificationStatus === 'pending_verification') continue;
    const expires = toMs(j.expiryDate);
    if (expires != null && expires < now) continue;
    const cid = typeof j.companyId === 'number' ? byNumeric.get(j.companyId) : (typeof j.companyId === 'string' && byId.has(j.companyId) ? j.companyId : undefined);
    if (!cid) continue;
    const at = toMs(j.createdAt) ?? toMs(j.liveDate);
    const a = act(cid); a.openJobs++; bump(a, at);
    const list = jobs.get(cid) ?? []; list.push({ title: clean(j.title, 100), location: clean(j.location, 80), type: clean(j.type, 30), atMs: at }); jobs.set(cid, list);
  }

  // Live challenges that are still open.
  const challenges: Directory['challenges'] = [];
  for (const d of challengeSnap.docs) {
    const c = d.data();
    const cid = typeof c.companyId === 'string' ? c.companyId : '';
    const deadline = toMs(c.deadline);
    if (!byId.has(cid) || deadline == null || deadline < now) continue;
    const arenaId = clean(c.arenaIndustryId ?? c.arenaIndustry, 40);
    const at = toMs(c.liveDate) ?? toMs(c.createdAt);
    const a = act(cid); a.liveChallenges++; bump(a, at);
    challenges.push({ id: d.id, companyId: cid, title: clean(c.title, 120), arenaId, arenaName: arenaName.get(arenaId) ?? arenaId, prize: Number(c.prizeAmount) || 0, deadlineMs: deadline, atMs: at });
  }

  // Arena sponsorship counts only while approved AND inside its dates.
  const sponsorships = new Map<string, { arenaId: string; arenaName: string; startMs: number }[]>();
  for (const d of sponsorSnap.docs) {
    const s = d.data();
    const start = toMs(s.startDate), end = toMs(s.endDate);
    if (start == null || end == null || now < start || now >= end || !byId.has(s.companyId)) continue;
    const a = act(s.companyId); const nm = arenaName.get(s.arenaId) ?? clean(s.arenaName, 80) ?? s.arenaId;
    if (!a.sponsoredArenas.includes(nm)) a.sponsoredArenas.push(nm);
    bump(a, start);
    const list = sponsorships.get(s.companyId) ?? []; list.push({ arenaId: s.arenaId, arenaName: nm, startMs: start }); sponsorships.set(s.companyId, list);
  }

  const industries = new Map<string, { label: string; count: number }>();
  for (const c of companies) {
    if (!c.industryKey) continue;
    const e = industries.get(c.industryKey) ?? { label: c.industry, count: 0 };
    e.count++; industries.set(c.industryKey, e);
  }

  cache = { at: now, version: ++versionCounter, fromSnapshot, companies, byId, activity, jobs, challenges, sponsorships, industries };
  return cache;
}

const NO_ACTIVITY: Activity = { openJobs: 0, liveChallenges: 0, sponsoredArenas: [], lastActivityMs: null };
const activityOf = (d: Directory, id: string) => d.activity.get(id) ?? NO_ACTIVITY;

// ── Scoring ──────────────────────────────────────────────────────────────────

/** How well a company matches typed text. null = does not match (every word must match somewhere). */
export function textScore(c: Pick<Lite, 'nameLower' | 'industryKey' | 'tickerLower' | 'domain' | 'description'> & { subLower?: string; locationLower?: string }, q: string): number | null {
  const full = q.trim().toLowerCase();
  if (!full) return 0;
  const words = full.split(/\s+/).filter(Boolean);
  const nameWords = c.nameLower.split(/[\s\-_.,&/()]+/).filter(Boolean);
  const desc = c.description.toLowerCase();
  let total = 0;
  if (c.nameLower === full) total += 1000;
  else if (c.nameLower.startsWith(full)) total += 800;
  for (const w of words) {
    let s = 0;
    if (c.tickerLower && c.tickerLower === w) s = 700;
    else if (nameWords.some(nw => nw === w)) s = 500;
    else if (nameWords.some(nw => nw.startsWith(w))) s = 450;
    else if (c.nameLower.includes(w)) s = 300;
    else if (c.industryKey.includes(w)) s = 200;
    else if (c.subLower && c.subLower.includes(w)) s = 180;
    else if (c.locationLower && c.locationLower.includes(w)) s = 160;
    else if (c.domain.includes(w)) s = 150;
    else if (desc.includes(w)) s = 60;
    if (s === 0) return null;
    total += s;
  }
  return total;
}

/** Real-activity weight, used to order companies when nothing else distinguishes them. */
export function activityScore(c: Pick<Lite, 'verified' | 'followerCount'>, a: Activity): number {
  let s = 0;
  if (a.openJobs > 0) s += 30 + Math.min(a.openJobs, 10);
  if (a.liveChallenges > 0) s += 25 + Math.min(a.liveChallenges, 5) * 2;
  if (a.sponsoredArenas.length > 0) s += 20;
  s += Math.min(Math.log2(c.followerCount + 1) * 3, 15);
  if (c.verified) s += 5;
  return s;
}

interface Profile { industry: string; goals: string[]; following: Set<string>; followedIndustries: Set<string> }
const STOP = new Set(['with', 'from', 'that', 'this', 'into', 'your', 'have', 'more', 'work', 'build', 'become', 'help', 'make', 'grow', 'learn']);

function personalise(c: Lite, p: Profile): { score: number; reasons: string[] } {
  let score = 0; const reasons: string[] = [];
  const profIndustry = p.industry.toLowerCase();
  if (profIndustry && c.industryKey && (c.industryKey === profIndustry || c.industryKey.includes(profIndustry) || profIndustry.includes(c.industryKey))) {
    score += 100; reasons.push(`Matches your industry: ${c.industry}`);
  }
  if (p.goals.length > 0) {
    const hay = `${c.industryKey} ${c.description.toLowerCase()} ${c.nameLower}`;
    let goalHits = 0;
    for (const g of p.goals) {
      const tokens = g.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 4 && !STOP.has(t));
      if (tokens.some(t => hay.includes(t))) { goalHits++; if (reasons.length < 3) reasons.push(`Relates to your goal: ${clean(g, 50)}`); }
    }
    score += Math.min(goalHits, 3) * 25;
  }
  if (c.industryKey && p.followedIndustries.has(c.industryKey)) { score += 40; reasons.push('Similar to companies you follow'); }
  return { score, reasons: reasons.slice(0, 2) };
}

// ── Cursor (keyset) ──────────────────────────────────────────────────────────
type Key = (number | string)[];
const encodeCursor = (key: Key, id: string, v: number) => Buffer.from(JSON.stringify({ k: key, i: id, v })).toString('base64url');
function decodeCursor(raw: unknown): { k: Key; i: string } | null {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string' || raw.length > 400) throw new HttpError(400, 'Invalid cursor.');
  try {
    const o = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!Array.isArray(o.k) || o.k.length > 5 || !o.k.every((x: unknown) => typeof x === 'number' || typeof x === 'string') || typeof o.i !== 'string') throw new Error('shape');
    return { k: o.k, i: o.i };
  } catch { throw new HttpError(400, 'Invalid cursor.'); }
}
const cmpKey = (a: Key, ai: string, b: Key, bi: string): number => {
  for (let n = 0; n < Math.max(a.length, b.length); n++) {
    const x = a[n], y = b[n];
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x < y ? -1 : 1;
    return String(x) < String(y) ? -1 : 1;
  }
  return ai < bi ? -1 : ai > bi ? 1 : 0;
};

// ── list ─────────────────────────────────────────────────────────────────────
type View = 'for_you' | 'following' | 'all';
type Sort = 'relevance' | 'recent' | 'followers' | 'alpha';

interface Row { c: Lite; a: Activity; key: Key; reasons: string[]; personalised: boolean }

async function loadProfile(db: Firestore, uid: string, dir: Directory): Promise<Profile & { hasPrefs: boolean }> {
  const snap = await db.collection('users').doc(uid).get();
  const u = snap.data() ?? {};
  const following = new Set<string>(Array.isArray(u.followingCompanies) ? u.followingCompanies.filter((x: unknown) => typeof x === 'string').slice(0, 500) : []);
  const followedIndustries = new Set<string>();
  following.forEach(id => { const k = dir.byId.get(id)?.industryKey; if (k) followedIndustries.add(k); });
  const goals: string[] = Array.isArray(u.professionalGoals) ? u.professionalGoals.filter((x: unknown) => typeof x === 'string').map((x: string) => clean(x, 80)).filter(Boolean).slice(0, 12) : [];
  const industry = clean(u.industry, 60);
  return { industry, goals, following, followedIndustries, hasPrefs: !!industry || goals.length > 0 || followedIndustries.size > 0 };
}

function toItem(r: Row, following: Set<string>) {
  const { c, a } = r;
  return {
    id: c.id, name: c.name, industry: c.industry, description: c.description, logoUrl: c.logoUrl, domain: c.domain, ticker: c.ticker,
    organizationType: c.orgType, category: c.category, typeLabel: TYPE_LABEL[c.orgType],
    subindustries: c.subindustries, location: { city: c.city, region: c.region, country: c.country },
    claimStatus: c.hasAdmin ? 'claimed' : 'unclaimed',
    verified: c.verified, followerCount: c.followerCount, following: following.has(c.id),
    openJobs: a.openJobs, liveChallenges: a.liveChallenges, sponsoredArenas: a.sponsoredArenas, lastActivityMs: a.lastActivityMs,
    ...(r.reasons.length ? { reasons: r.reasons } : {}),
  };
}

const facetList = (m: Map<string, { label: string; count: number }>, cap: number) =>
  [...m.entries()].map(([key, v]) => ({ key, label: v.label, count: v.count }))
    .sort((x, y) => y.count - x.count || x.label.localeCompare(y.label)).slice(0, cap);

async function list(db: Firestore, caller: Caller, body: any, now: number) {
  const view: View = (['for_you', 'following', 'all'] as const).includes(body.view) ? body.view : 'all';
  const sort: Sort = (['relevance', 'recent', 'followers', 'alpha'] as const).includes(body.sort) ? body.sort : 'relevance';
  const q = clean(body.q, 80);
  const industry = clean(body.industry, 60).toLowerCase();
  const category = CATEGORY_KEYS.some(c => c.key === body.category) ? (body.category as CategoryKey) : '';
  const orgType = (ORG_TYPES as string[]).includes(body.organizationType) ? (body.organizationType as OrgType) : '';
  const country = clean(body.country, 60).toLowerCase();
  const f = body.filters && typeof body.filters === 'object' ? body.filters : {};
  const need = { hiring: f.hiring === true, challenges: f.challenges === true, sponsor: f.sponsor === true };
  const limit = Math.max(1, Math.min(MAX_PAGE_SIZE, Number.isInteger(body.limit) ? body.limit : PAGE_SIZE));
  const after = decodeCursor(body.cursor);

  const dir = await loadDirectory(db, now);
  const profile = await loadProfile(db, caller.uid, dir);

  // 1. rows that match the view, the search and the activity filters (the facet filters are applied after, so each facet can ignore its own)
  const base: Row[] = [];
  for (const c of dir.companies) {
    if (view === 'following' && !profile.following.has(c.id)) continue;
    if (view === 'for_you' && profile.following.has(c.id)) continue;
    const a = activityOf(dir, c.id);
    if (need.hiring && a.openJobs === 0) continue;
    if (need.challenges && a.liveChallenges === 0) continue;
    if (need.sponsor && a.sponsoredArenas.length === 0) continue;
    const ts = textScore(c, q);
    if (ts === null) continue;
    let personalScore = 0; let reasons: string[] = []; let personalised = false;
    if (view === 'for_you') { const p = personalise(c, profile); personalScore = p.score; reasons = p.reasons; personalised = p.score > 0; }
    const act = activityScore(c, a);
    let key: Key;
    if (sort === 'alpha') key = [c.nameLower];
    else if (sort === 'recent') key = [-(a.lastActivityMs ?? 0), c.nameLower];
    else if (sort === 'followers') key = [-c.followerCount, c.nameLower];
    else if (view === 'for_you') key = [-ts, personalised ? 0 : 1, -personalScore, -act, c.nameLower];
    else key = [-ts, -act, c.nameLower];
    base.push({ c, a, key, reasons, personalised });
  }

  // 2. facets: for each filter, the counts you would get by choosing it now, given every OTHER filter
  type F = 'category' | 'orgType' | 'industry' | 'country';
  const passes = (c: Lite, skip?: F) =>
    (skip === 'category' || !category || c.category === category) &&
    (skip === 'orgType' || !orgType || c.orgType === orgType) &&
    (skip === 'industry' || !industry || c.industryKey === industry) &&
    (skip === 'country' || !country || c.countryKey === country);
  const catCounts = new Map<CategoryKey, number>();
  const typeCounts = new Map<string, { label: string; count: number }>();
  const industryCounts = new Map<string, { label: string; count: number }>();
  const countryCounts = new Map<string, { label: string; count: number }>();
  for (const { c } of base) {
    if (passes(c, 'category')) catCounts.set(c.category, (catCounts.get(c.category) ?? 0) + 1);
    if (passes(c, 'orgType')) { const e = typeCounts.get(c.orgType) ?? { label: TYPE_LABEL[c.orgType], count: 0 }; e.count++; typeCounts.set(c.orgType, e); }
    if (c.industryKey && passes(c, 'industry')) { const e = industryCounts.get(c.industryKey) ?? { label: dir.industries.get(c.industryKey)?.label ?? c.industry, count: 0 }; e.count++; industryCounts.set(c.industryKey, e); }
    if (c.countryKey && passes(c, 'country')) { const e = countryCounts.get(c.countryKey) ?? { label: c.country, count: 0 }; e.count++; countryCounts.set(c.countryKey, e); }
  }
  const facets = facetList(industryCounts, 60);
  const categories = CATEGORY_KEYS.map(c => ({ key: c.key, label: c.label, count: catCounts.get(c.key) ?? 0 }));

  // 3. all filters, then total order, then the page after the cursor
  const rows = base.filter(r => passes(r.c));
  rows.sort((x, y) => cmpKey(x.key, x.c.id, y.key, y.c.id));
  const start = after ? rows.findIndex(r => cmpKey(r.key, r.c.id, after.k, after.i) > 0) : 0;
  const page = start < 0 ? [] : rows.slice(start, start + limit);
  const hasMore = start >= 0 && start + limit < rows.length;
  const last = page[page.length - 1];

  // A snapshot may be minutes old: show the page's records as they are right now.
  const items = page.map(r => toItem(r, profile.following));
  if (dir.fromSnapshot && page.length > 0) {
    try {
      const live = await db.getAll(...page.map(r => db.collection('companies').doc(r.c.id)), { fieldMask: ['followerCount', 'verificationStatus', 'adminUid'] });
      live.forEach((d, i) => {
        const x = d.data(); if (!x) return;
        items[i].followerCount = Math.max(0, Number(x.followerCount) || 0);
        items[i].verified = x.verificationStatus === 'verified';
        items[i].claimStatus = x.adminUid ? 'claimed' : 'unclaimed';
      });
    } catch { /* the snapshot values are still sensible */ }
  }

  const personalisedCount = view === 'for_you' ? rows.filter(r => r.personalised).length : 0;
  return {
    items,
    total: rows.length,
    nextCursor: hasMore && last ? encodeCursor(last.key, last.c.id, dir.version) : null,
    facets,
    categories,
    types: facetList(typeCounts, 10),
    countries: facetList(countryCounts, 60),
    meta: {
      view, sort,
      // For You: were these chosen from the member's own profile, or is this the general fallback?
      forYou: view === 'for_you' ? { hasPreferences: profile.hasPrefs, personalisedCount, fallback: personalisedCount === 0 } : undefined,
    },
  };
}

// ── suggest ──────────────────────────────────────────────────────────────────
async function suggest(db: Firestore, body: any, now: number) {
  const q = clean(body.q, 60);
  if (q.length < 2) return { companies: [], industries: [] };
  const dir = await loadDirectory(db, now);
  const scored: { c: Lite; s: number }[] = [];
  for (const c of dir.companies) { const s = textScore({ ...c, industryKey: '', domain: '', description: '', subLower: '', locationLower: '' }, q); if (s !== null) scored.push({ c, s }); }
  scored.sort((a, b) => b.s - a.s || a.c.nameLower.localeCompare(b.c.nameLower));
  const ql = q.toLowerCase();
  return {
    companies: scored.slice(0, 6).map(({ c }) => ({ id: c.id, name: c.name, industry: c.industry, typeLabel: TYPE_LABEL[c.orgType] })),
    industries: [...dir.industries.values()].filter(i => i.label.toLowerCase().includes(ql)).sort((a, b) => b.count - a.count).slice(0, 2).map(i => i.label),
  };
}

// ── detail ───────────────────────────────────────────────────────────────────
async function detail(db: Firestore, caller: Caller, body: any, now: number) {
  const dir = await loadDirectory(db, now);
  const id = typeof body.companyId === 'string' ? body.companyId : '';
  const c = dir.byId.get(id);
  if (!c) throw new HttpError(404, 'Organization not found.');
  const a = activityOf(dir, id);
  const profile = await loadProfile(db, caller.uid, dir);

  const openRoles = (dir.jobs.get(id) ?? []).sort((x, y) => (y.atMs ?? 0) - (x.atMs ?? 0));
  const own = dir.challenges.filter(ch => ch.companyId === id).sort((x, y) => (y.atMs ?? 0) - (x.atMs ?? 0));
  const arenaIds = new Set(own.map(ch => ch.arenaId).filter(Boolean));
  (dir.sponsorships.get(id) ?? []).forEach(s => arenaIds.add(s.arenaId));
  const related = dir.challenges
    .filter(ch => ch.companyId !== id && arenaIds.has(ch.arenaId))
    .sort((x, y) => (y.atMs ?? 0) - (x.atMs ?? 0)).slice(0, 4);

  // "Updates" is a timeline of things that really happened, newest first.
  const updates: { kind: 'role' | 'challenge' | 'sponsorship'; text: string; atMs: number }[] = [];
  openRoles.forEach(r => r.atMs && updates.push({ kind: 'role', text: `Hiring: ${r.title}`, atMs: r.atMs }));
  own.forEach(ch => ch.atMs && updates.push({ kind: 'challenge', text: `Posted a challenge: ${ch.title}`, atMs: ch.atMs }));
  (dir.sponsorships.get(id) ?? []).forEach(s => updates.push({ kind: 'sponsorship', text: `Began sponsoring the ${s.arenaName}`, atMs: s.startMs }));
  updates.sort((x, y) => y.atMs - x.atMs);

  const doc = await db.collection('companies').doc(id).get();
  const live = doc.data() ?? {};
  const adminUid = live.adminUid as string | undefined;
  // Category-specific facts: only keys the model defines, only plain strings/numbers.
  const profileFacts: Record<string, string | number> = {};
  if (live.profile && typeof live.profile === 'object') {
    for (const [k, v] of Object.entries(live.profile as Record<string, unknown>)) {
      if (!PROFILE_KEYS.has(k)) continue;
      if (typeof v === 'number' && Number.isFinite(v)) profileFacts[k] = v;
      else if (typeof v === 'string' && v.trim()) profileFacts[k] = clean(v, 120);
    }
  }
  const src = live.directorySource && typeof live.directorySource === 'object' ? live.directorySource : null;
  const parent = c.parentId ? dir.byId.get(c.parentId) : undefined;
  const children = dir.companies.filter(o => o.parentId === id).sort((x, y) => x.nameLower.localeCompare(y.nameLower));
  return {
    company: { id: c.id, name: c.name, industry: c.industry, followerCount: Math.max(0, Number(live.followerCount) || 0), verified: live.verificationStatus === 'verified' },
    organization: {
      id: c.id, name: c.name, organizationType: c.orgType, typeLabel: TYPE_LABEL[c.orgType], category: c.category,
      industry: c.industry, subindustries: c.subindustries,
      description: clean(live.description, 1500), website: httpsOrEmpty(live.website), logoUrl: httpsOrEmpty(live.logoUrl),
      location: { city: c.city, region: c.region, country: c.country },
      profile: profileFacts,
      claimStatus: adminUid ? 'claimed' : 'unclaimed',
      source: src ? { name: clean(src.name, 60), url: httpsOrEmpty(src.url) } : null,
      parent: parent ? { id: parent.id, name: parent.name, typeLabel: TYPE_LABEL[parent.orgType] } : null,
      children: children.slice(0, 12).map(o => ({ id: o.id, name: o.name, typeLabel: TYPE_LABEL[o.orgType] })),
      childCount: children.length,
    },
    following: profile.following.has(id),
    // Whether the "Claim this company" action should be offered to this person.
    claim: { available: !adminUid, isAdmin: adminUid === caller.uid },
    openRoleCount: a.openJobs, liveChallengeCount: a.liveChallenges, sponsoredArenas: a.sponsoredArenas,
    roles: openRoles.slice(0, 5),
    challenges: own.slice(0, 5).map(ch => ({ id: ch.id, title: ch.title, arenaName: ch.arenaName, prize: ch.prize, deadlineMs: ch.deadlineMs })),
    related: related.map(ch => ({ id: ch.id, title: ch.title, arenaName: ch.arenaName, prize: ch.prize, deadlineMs: ch.deadlineMs, companyName: dir.byId.get(ch.companyId)?.name ?? '' })),
    updates: updates.slice(0, 8),
  };
}

// ── follow / unfollow ────────────────────────────────────────────────────────
async function setFollow(db: Firestore, uid: string, body: any, follow: boolean) {
  const id = typeof body.companyId === 'string' && body.companyId && body.companyId.length <= 128 && !body.companyId.includes('/') ? body.companyId : '';
  if (!id) throw new HttpError(400, 'An organization is required.');
  const userRef = db.collection('users').doc(uid);
  const companyRef = db.collection('companies').doc(id);
  return db.runTransaction(async tx => {
    const [u, c] = await Promise.all([tx.get(userRef), tx.get(companyRef)]);
    if (!c.exists) throw new HttpError(404, 'Organization not found.');
    const list: string[] = Array.isArray(u.data()?.followingCompanies) ? u.data()!.followingCompanies : [];
    const already = list.includes(id);
    let count = Math.max(0, Number(c.data()?.followerCount) || 0);
    if (follow && !already) {
      tx.set(userRef, { followingCompanies: FieldValue.arrayUnion(id) }, { merge: true });
      tx.update(companyRef, { followerCount: count + 1 }); count += 1;
    } else if (!follow && already) {
      tx.set(userRef, { followingCompanies: FieldValue.arrayRemove(id) }, { merge: true });
      tx.update(companyRef, { followerCount: Math.max(0, count - 1) }); count = Math.max(0, count - 1);
    }
    cache = null; // the next list should see the new count
    return { ok: true, following: follow, followerCount: count };
  });
}

// ── claim ────────────────────────────────────────────────────────────────────
const FREE_EMAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com', 'msn.com',
  'aol.com', 'icloud.com', 'me.com', 'mac.com', 'protonmail.com', 'proton.me', 'mail.com', 'email.com', 'zoho.com', 'yandex.com', 'gmx.com', 'gmx.net', 'fastmail.com', 'tutanota.com',
]);

/** The email's domain is the company's own domain or a subdomain of it. "evilmeridian.com" is NOT meridian.com. */
export function emailBelongsToDomain(email: string, companyDomain: string): boolean {
  const at = email.lastIndexOf('@');
  if (at < 1 || !companyDomain) return false;
  const e = email.slice(at + 1).toLowerCase().trim();
  const d = companyDomain.toLowerCase().replace(/^www\./, '').trim();
  return !!e && !!d && (e === d || e.endsWith('.' + d));
}

async function claim(db: Firestore, caller: Caller, body: any, now: number) {
  const id = typeof body.companyId === 'string' && body.companyId && body.companyId.length <= 128 && !body.companyId.includes('/') ? body.companyId : '';
  if (!id) throw new HttpError(400, 'An organization is required.');
  const email = (caller.email ?? '').toLowerCase();
  const emailDomain = email.includes('@') ? email.slice(email.lastIndexOf('@') + 1) : '';

  if (!email || !caller.emailVerified) throw new HttpError(403, 'Verify your email address first. We only accept claims from a verified work email.');
  if (FREE_EMAIL.has(emailDomain)) throw new HttpError(403, `Claiming needs a work email at the company's own domain. If you work there and don't have one, write to ${SUPPORT_EMAIL}.`);

  // 5 attempts a day per person.
  const rl = db.collection('company_claim_rate_limits').doc(caller.uid);
  await db.runTransaction(async tx => {
    const e = (await tx.get(rl)).data() as { windowStart?: number; count?: number } | undefined;
    const inWindow = !!e?.windowStart && now - e.windowStart < 86_400_000;
    const count = inWindow ? (e?.count ?? 0) : 0;
    if (count >= 5) throw new HttpError(429, 'Too many claim attempts today. Please try again tomorrow, or write to ' + SUPPORT_EMAIL + '.');
    tx.set(rl, { windowStart: inWindow ? e!.windowStart : now, count: count + 1 });
  });

  const ref = db.collection('companies').doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, 'Organization not found.');
  const x = snap.data()!;
  if (x.adminUid === caller.uid) return { ok: true, status: 'already_admin' };
  if (x.adminUid || x.claimed === true) throw new HttpError(409, `This company already has an administrator. If that is wrong, write to ${SUPPORT_EMAIL}.`);

  const companyDomain = (clean(x.domain, 120) || hostOf(httpsOrEmpty(x.website))).toLowerCase().replace(/^www\./, '');
  const event = (outcome: string, extra: Record<string, unknown> = {}) =>
    db.collection('company_claim_events').add({ companyId: id, uid: caller.uid, emailDomain, companyDomain, outcome, at: FieldValue.serverTimestamp(), ...extra });

  if (companyDomain && emailBelongsToDomain(email, companyDomain)) {
    // The person proved control of a mailbox at the company's own domain: grant, pending BeWatu's usual company verification.
    const won = await db.runTransaction(async tx => {
      const fresh = await tx.get(ref);
      const f = fresh.data();
      if (!fresh.exists || f?.adminUid || f?.claimed === true) return false;
      tx.update(ref, { claimed: true, adminUid: caller.uid, verificationStatus: 'pending', claimedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      return true;
    });
    if (!won) throw new HttpError(409, `This company already has an administrator. If that is wrong, write to ${SUPPORT_EMAIL}.`);
    cache = null;
    await event('granted');
    return { ok: true, status: 'granted' };
  }

  // Not provable automatically: hand it to a person. One open ticket per person and company.
  const ticketRef = db.collection('support_tickets').doc(`company_claim_${id}_${caller.uid}`);
  const existing = await ticketRef.get();
  if (!existing.exists) {
    const userSnap = await db.collection('users').doc(caller.uid).get();
    await ticketRef.set({
      subject: `Company claim: ${clean(x.name, 100)}`, category: 'account', priority: 'medium',
      userId: caller.uid, userName: clean(userSnap.data()?.displayName, 80) || 'BeWatu member', userEmail: email,
      body: companyDomain
        ? `Asked to administer ${clean(x.name, 100)} (${companyDomain}) from a verified ${emailDomain} address, which is not on the company's domain.`
        : `Asked to administer ${clean(x.name, 100)}, which has no website or domain on file to check a work email against.`,
      status: 'open', assignedTo: null, assignedName: null, slaBreached: false, slaDeadline: new Date(now + 24 * 3_600_000),
      notes: [], createdByOps: false, metadata: { type: 'company_claim', companyId: id, companyDomain, emailDomain },
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), resolvedAt: null,
    });
  }
  await event('manual_review', { ticketId: ticketRef.id });
  return { ok: false, status: 'manual_review', ticketId: ticketRef.id };
}

// ── dispatcher ───────────────────────────────────────────────────────────────
export async function runAction(db: Firestore, caller: Caller, body: any, now: number = Date.now()): Promise<Record<string, unknown>> {
  switch (body?.action) {
    case 'list':     return list(db, caller, body, now);
    case 'suggest':  return suggest(db, body, now);
    case 'detail':   return detail(db, caller, body, now);
    case 'follow':   return setFollow(db, caller.uid, body, true);
    case 'unfollow': return setFollow(db, caller.uid, body, false);
    case 'claim':    return claim(db, caller, body, now);
    default: throw new HttpError(400, 'Unknown action.');
  }
}

// ── HTTP handler ─────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = ['https://www.bewatu.com', 'https://bewatu.com'];

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER ?? process.env.FIREBASE_SERVICE_ACCOUNT!;
  return initializeApp({ credential: cert(JSON.parse(sa)) });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requested = String(req.headers.origin ?? '');
  const localDev = process.env.VERCEL_ENV !== 'production' && /^http:\/\/localhost:\d+$/.test(requested);
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS.find(o => o === requested) ?? (localDev ? requested : ALLOWED_ORIGINS[0]));
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const app = getAdminApp();
    const decoded = await getAuth(app).verifyIdToken(authHeader.split('Bearer ')[1]);
    const result = await runAction(getFirestore(app), { uid: decoded.uid, email: decoded.email, emailVerified: decoded.email_verified === true }, req.body ?? {});
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(result);
  } catch (err: any) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (String(err?.code ?? '').startsWith('auth/')) return res.status(401).json({ error: 'Unauthorized' });
    console.error('companies error:', err?.code ?? err?.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
