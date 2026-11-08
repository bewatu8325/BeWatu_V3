// api/arena-sponsorship.ts
// ─────────────────────────────────────────────────────────────────────────────
// The only way Arena sponsorships are created or changed. firestore.rules lets
// nobody write arena_sponsorships from a browser, because what matters here
// cannot be expressed in rules:
//   - a company can ask to sponsor an Arena, but cannot make itself the sponsor:
//     only a BeWatu platform admin approves, and approval sets the dates;
//   - two exclusive sponsorships must not overlap (checked in a transaction);
//   - branding is validated here (colour, https-only links, re-encoded raster
//     images within a size cap), so nothing unsafe is ever stored.
//
// "Active" is never stored. A sponsorship is active only while its status is
// 'approved' and now is inside [startDate, endDate); expiry therefore needs no
// job, and a revoked or expired record stops showing the moment its status or
// dates say so. See lib/arenaSponsorship.ts (same rules, used by the UI).
//
// POST /api/arena-sponsorship   Authorization: Bearer <idToken>
//   { action: 'request',         arenaId, companyId, branding, banner? }          company admin
//   { action: 'update_branding', id, branding, banner? }  (banner: string = set, null = remove, absent = keep)
//   { action: 'withdraw',        id }                                              company admin
//   { action: 'approve',         id, startDate, endDate, exclusive?, note? }       platform admin
//   { action: 'reject',          id, note }                                        platform admin
//   { action: 'revoke',          id, note }                                        platform admin
//   { action: 'acknowledge',     id }  clears "branding changed since approval"   platform admin
//
// Self-contained on purpose: api/ routes cannot import from lib/ on Vercel.
// ─────────────────────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp, FieldValue, type Firestore } from 'firebase-admin/firestore';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// ── Limits (mirrors lib/arenaSponsorship.ts) ─────────────────────────────────
const LIMITS = { tagline: 120, description: 600, linkLabel: 40, links: 4, logoBytes: 100 * 1024, bannerBytes: 300 * 1024, maxTermDays: 731, noteMin: 5, noteMax: 300 };
const MAX_OPEN_REQUESTS_PER_COMPANY = 3;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 40;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const IMAGE_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

// eslint-disable-next-line no-control-regex
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v : '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function httpsUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    if (!u.hostname.includes('.') || /\.(local|internal|localhost)$/i.test(u.hostname)) return null;
    return u.toString();
  } catch { return null; }
}

/** Throws unless this is a PNG / JPEG / WebP data URL whose bytes really are that format and fit the cap. */
export function checkImage(dataUrl: unknown, maxBytes: number, what: string): string {
  if (typeof dataUrl !== 'string' || !IMAGE_RE.test(dataUrl)) throw new HttpError(400, `${what} must be a PNG, JPEG or WebP image.`);
  const buf = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  if (buf.length > maxBytes) throw new HttpError(400, `${what} is too large (limit ${Math.round(maxBytes / 1024)} KB).`);
  const png  = buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpeg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const webp = buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP';
  const declared = /^data:image\/(png|jpeg|webp)/.exec(dataUrl)![1];
  if (!((declared === 'png' && png) || (declared === 'jpeg' && jpeg) || (declared === 'webp' && webp))) {
    throw new HttpError(400, `${what} is not a valid image.`);
  }
  return dataUrl;
}

export interface CleanBranding {
  primaryColor: string; tagline: string; description: string; website: string | null;
  links: { label: string; url: string }[]; logo: string | null;
}

export function validateBranding(raw: any): CleanBranding {
  if (!raw || typeof raw !== 'object') throw new HttpError(400, 'Branding details are required.');
  if (typeof raw.primaryColor !== 'string' || !HEX_RE.test(raw.primaryColor)) throw new HttpError(400, 'Choose a brand colour as a hex value like #244038.');
  const tagline = clean(raw.tagline, LIMITS.tagline);
  const description = clean(raw.description, LIMITS.description);
  let website: string | null = null;
  if (raw.website !== undefined && raw.website !== null && raw.website !== '') {
    website = httpsUrl(raw.website);
    if (!website) throw new HttpError(400, 'The website must be a secure https:// link.');
  }
  const links: { label: string; url: string }[] = [];
  if (raw.links !== undefined && raw.links !== null) {
    if (!Array.isArray(raw.links)) throw new HttpError(400, 'Links must be a list.');
    if (raw.links.length > LIMITS.links) throw new HttpError(400, `At most ${LIMITS.links} links.`);
    for (const l of raw.links) {
      const url = httpsUrl(l?.url);
      const label = clean(l?.label, LIMITS.linkLabel);
      if (!url || !label) throw new HttpError(400, 'Each link needs a label and a secure https:// address.');
      links.push({ label, url });
    }
  }
  const logo = raw.logo ? checkImage(raw.logo, LIMITS.logoBytes, 'The logo') : null;
  return { primaryColor: raw.primaryColor.toLowerCase(), tagline, description, website, links, logo };
}

const brandingDoc = (b: CleanBranding, hasBanner: boolean) => ({ ...b, hasBanner });
const historyEntry = (by: string, action: string, note?: string) => ({ atMs: Date.now(), by, action, ...(note ? { note: clean(note, LIMITS.noteMax) } : {}) });
const capHistory = (h: any[]) => h.slice(-40);

// ── Authorisation helpers ────────────────────────────────────────────────────
async function requirePlatformAdmin(db: Firestore, uid: string): Promise<string> {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists || snap.data()?.isPlatformAdmin !== true) throw new HttpError(403, 'Platform admin access required.');
  return String(snap.data()?.displayName ?? 'BeWatu admin').slice(0, 80);
}

// ── Which organizations may ask ──────────────────────────────────────────────
// Only an organization BeWatu has verified may ask to sponsor an Arena: sponsorship puts its name and branding in front of members,
// so "an administrator" alone is not enough. This is checked here, on the server, every time (the screens only explain it).
export type OrgState = 'eligible' | 'pending_verification' | 'ineligible';
export interface OrgEligibility { state: OrgState; reason: string; next: string }

export function orgEligibility(company: { verificationStatus?: unknown; status?: unknown } | undefined): OrgEligibility {
  const v = typeof company?.verificationStatus === 'string' ? company.verificationStatus : 'unverified';
  const st = typeof company?.status === 'string' ? company.status : 'active';
  if (st === 'suspended' || st === 'inactive' || v === 'suspended') return { state: 'ineligible', reason: 'This organization is suspended.', next: 'Contact support to resolve this before sponsoring.' };
  if (v === 'verified') return { state: 'eligible', reason: '', next: '' };
  if (v === 'pending') return { state: 'pending_verification', reason: 'BeWatu is verifying this organization.', next: 'You can request sponsorship as soon as verification is complete. We will keep your place.' };
  if (v === 'rejected') return { state: 'ineligible', reason: 'This organization could not be verified.', next: 'Contact support to review the decision, or update its details and apply again.' };
  return { state: 'ineligible', reason: 'This organization has not been verified yet.', next: 'Complete verification for the organization, then come back to sponsor.' };
}

async function requireCompanyAdmin(db: Firestore, uid: string, companyId: unknown): Promise<{ id: string; name: string }> {
  if (typeof companyId !== 'string' || !companyId || companyId.length > 128 || companyId.includes('/')) throw new HttpError(400, 'A company is required.');
  const snap = await db.collection('companies').doc(companyId).get();
  if (!snap.exists) throw new HttpError(404, 'Company not found.');
  if (snap.data()?.adminUid !== uid) throw new HttpError(403, 'Only the company administrator can manage its sponsorship.');
  return { id: snap.id, name: clean(snap.data()?.name, 120) || 'Company' };
}

async function rateLimit(db: Firestore, uid: string, now: number) {
  const ref = db.collection('arena_sponsorship_rate_limits').doc(uid);
  await db.runTransaction(async tx => {
    const e = (await tx.get(ref)).data() as { windowStart?: number; count?: number } | undefined;
    const inWindow = !!e?.windowStart && now - e.windowStart < RATE_WINDOW_MS;
    const count = inWindow ? (e?.count ?? 0) : 0;
    if (count >= RATE_MAX) throw new HttpError(429, 'Too many changes. Please try again later.');
    tx.set(ref, { windowStart: inWindow ? e!.windowStart : now, count: count + 1 });
  });
}

const idOf = (v: unknown): string => {
  if (typeof v !== 'string' || !v || v.length > 128 || v.includes('/')) throw new HttpError(400, 'A sponsorship id is required.');
  return v;
};

const parseDate = (v: unknown, label: string): number => {
  const t = typeof v === 'string' || typeof v === 'number' ? new Date(v).getTime() : NaN;
  if (!Number.isFinite(t)) throw new HttpError(400, `${label} is not a valid date.`);
  return t;
};

// ── The actions ──────────────────────────────────────────────────────────────
export async function runAction(db: Firestore, uid: string, body: any, now: number = Date.now()): Promise<Record<string, unknown>> {
  const action = body?.action;
  const col = db.collection('arena_sponsorships');

  switch (action) {
    case 'request': {
      const company = await requireCompanyAdmin(db, uid, body.companyId);
      const gate = orgEligibility((await db.collection('companies').doc(company.id).get()).data());
      if (gate.state !== 'eligible') throw new HttpError(403, `${gate.reason} ${gate.next}`.trim());
      const arenaId = typeof body.arenaId === 'string' ? body.arenaId : '';
      if (!/^[a-z0-9_-]{2,40}$/.test(arenaId)) throw new HttpError(400, 'Choose an Arena.');
      const arena = await db.collection('arena_industries').doc(arenaId).get();
      if (!arena.exists || arena.data()?.isActive === false) throw new HttpError(404, 'That Arena is not open for sponsorship.');
      const branding = validateBranding(body.branding);
      const banner = body.banner ? checkImage(body.banner, LIMITS.bannerBytes, 'The banner') : null;
      await rateLimit(db, uid, now);

      const mine = await col.where('companyId', '==', company.id).get();
      const open = mine.docs.filter(d => d.data().status === 'pending_review');
      if (open.some(d => d.data().arenaId === arenaId)) throw new HttpError(409, 'You already have a request for this Arena under review.');
      if (open.length >= MAX_OPEN_REQUESTS_PER_COMPANY) throw new HttpError(409, 'You have several requests under review already. Wait for a decision first.');
      const running = mine.docs.find(d => { const x = d.data(); return x.arenaId === arenaId && x.status === 'approved' && x.endDate && x.endDate.toMillis() > now; });
      if (running) throw new HttpError(409, 'Your company already sponsors this Arena.');

      const ref = col.doc();
      const batch = db.batch();
      batch.set(ref, {
        arenaId, arenaName: clean(arena.data()?.name, 80), companyId: company.id, companyName: company.name,
        companyAdminUid: uid, requestedByUid: uid, status: 'pending_review', exclusive: true,
        startDate: null, endDate: null, branding: brandingDoc(branding, !!banner),
        approval: null, brandingChangedSinceApproval: false,
        history: [historyEntry(uid, 'requested')],
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
      if (banner) batch.set(db.collection('arena_sponsorship_assets').doc(ref.id), { banner, updatedAt: FieldValue.serverTimestamp() });
      await batch.commit();
      return { ok: true, id: ref.id, status: 'pending_review' };
    }

    // What this person may do for an Arena, from the records (never from what the browser says): the Arena's availability, each
    // organization they administer and whether it may ask, any request already open for this Arena, and claims awaiting review.
    case 'eligibility': {
      if (!uid) throw new HttpError(401, 'Unauthorized');
      const arenaId = typeof body.arenaId === 'string' ? body.arenaId : '';
      if (!/^[a-z0-9_-]{2,40}$/.test(arenaId)) throw new HttpError(400, 'Choose an Arena.');
      const [arena, mine, tickets, running] = await Promise.all([
        db.collection('arena_industries').doc(arenaId).get(),
        db.collection('companies').where('adminUid', '==', uid).limit(25).get(),
        db.collection('support_tickets').where('userId', '==', uid).limit(50).get(),
        col.where('arenaId', '==', arenaId).where('status', '==', 'approved').get(),
      ]);
      const open = arena.exists && arena.data()?.isActive !== false;
      const live = running.docs.map(d => d.data()).filter(x => x.endDate && x.endDate.toMillis() > now && (!x.startDate || x.startDate.toMillis() <= now))[0];
      const orgs = await Promise.all(mine.docs.map(async d => {
        const x = d.data(); const e = orgEligibility(x);
        const requests = (await col.where('companyId', '==', d.id).get()).docs.map(r => r.data()).filter(r => r.arenaId === arenaId && (r.status === 'pending_review' || (r.status === 'approved' && r.endDate && r.endDate.toMillis() > now)));
        return { id: d.id, name: clean(x.name, 120) || 'Organization', logoUrl: typeof x.logoUrl === 'string' && x.logoUrl.startsWith('https://') ? x.logoUrl : '', state: e.state, reason: e.reason, next: e.next, existing: requests[0] ? (requests[0].status === 'approved' ? 'approved' : 'pending_review') : null };
      }));
      const claims = tickets.docs.map(t => t.data()).filter(t => t.metadata?.type === 'company_claim' && t.status !== 'resolved' && t.status !== 'closed')
        .map(t => ({ companyId: clean(t.metadata?.companyId, 128), name: clean(String(t.subject ?? '').replace(/^Company claim:\s*/i, ''), 120) }));
      return {
        arena: { id: arenaId, name: arena.exists ? clean(arena.data()?.name, 80) : '', open, sponsoredUntil: live?.endDate ? live.endDate.toMillis() : null, sponsorName: live ? clean(live.companyName, 120) : null },
        organizations: orgs, pendingClaims: claims,
      };
    }

    case 'update_branding': {
      const id = idOf(body.id);
      const ref = col.doc(id);
      const snap = await ref.get();
      if (!snap.exists) throw new HttpError(404, 'Sponsorship not found.');
      const s = snap.data()!;
      const company = await requireCompanyAdmin(db, uid, s.companyId);
      if (s.status !== 'pending_review' && s.status !== 'approved') throw new HttpError(409, 'This sponsorship can no longer be edited.');
      if (s.status === 'approved' && s.endDate && s.endDate.toMillis() <= now) throw new HttpError(409, 'This sponsorship has ended.');
      const branding = validateBranding(body.branding);
      await rateLimit(db, uid, now);

      let hasBanner = !!s.branding?.hasBanner;
      const batch = db.batch();
      if (body.banner === null) { hasBanner = false; batch.delete(db.collection('arena_sponsorship_assets').doc(id)); }
      else if (typeof body.banner === 'string') {
        checkImage(body.banner, LIMITS.bannerBytes, 'The banner'); hasBanner = true;
        batch.set(db.collection('arena_sponsorship_assets').doc(id), { banner: body.banner, updatedAt: FieldValue.serverTimestamp() });
      }
      const wasApproved = s.status === 'approved';
      batch.update(ref, {
        branding: brandingDoc(branding, hasBanner), companyName: company.name, companyAdminUid: uid,
        ...(wasApproved ? { brandingChangedSinceApproval: true } : {}),
        history: capHistory([...(s.history ?? []), historyEntry(uid, 'branding_updated')]),
        updatedAt: FieldValue.serverTimestamp(),
      });
      await batch.commit();
      return { ok: true, id, status: s.status };
    }

    case 'withdraw': {
      const id = idOf(body.id);
      const ref = col.doc(id);
      const snap = await ref.get();
      if (!snap.exists) throw new HttpError(404, 'Sponsorship not found.');
      const s = snap.data()!;
      await requireCompanyAdmin(db, uid, s.companyId);
      if (s.status !== 'pending_review' && s.status !== 'approved') throw new HttpError(409, 'Nothing to withdraw.');
      await ref.update({ status: 'withdrawn', history: capHistory([...(s.history ?? []), historyEntry(uid, 'withdrawn')]), updatedAt: FieldValue.serverTimestamp() });
      return { ok: true, id, status: 'withdrawn' };
    }

    case 'approve': {
      const adminName = await requirePlatformAdmin(db, uid);
      const id = idOf(body.id);
      const start = parseDate(body.startDate, 'The start date');
      const end = parseDate(body.endDate, 'The end date');
      if (end <= start) throw new HttpError(400, 'The end date must be after the start date.');
      if (end <= now) throw new HttpError(400, 'The end date is already in the past.');
      if ((end - start) / 86400000 > LIMITS.maxTermDays) throw new HttpError(400, 'A sponsorship can run for at most two years.');
      const exclusive = body.exclusive !== false;
      const note = clean(body.note, LIMITS.noteMax);

      await db.runTransaction(async tx => {
        const ref = col.doc(id);
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpError(404, 'Sponsorship not found.');
        const s = snap.data()!;
        if (s.status !== 'pending_review') throw new HttpError(409, 'Only a request under review can be approved.');
        const company = await tx.get(db.collection('companies').doc(s.companyId));
        if (!company.exists) throw new HttpError(409, 'The company no longer exists.');
        const others = await tx.get(col.where('arenaId', '==', s.arenaId).where('status', '==', 'approved'));
        for (const o of others.docs) {
          if (o.id === id) continue;
          const x = o.data();
          if (!x.startDate || !x.endDate) continue;
          const overlap = start < x.endDate.toMillis() && x.startDate.toMillis() < end;
          if (overlap && (exclusive || x.exclusive !== false)) {
            throw new HttpError(409, `${x.companyName || 'Another company'} already holds ${x.exclusive !== false ? 'an exclusive' : 'a'} sponsorship of this Arena for part of that period.`);
          }
        }
        tx.update(ref, {
          status: 'approved', exclusive,
          startDate: Timestamp.fromMillis(start), endDate: Timestamp.fromMillis(end),
          companyAdminUid: company.data()?.adminUid ?? s.companyAdminUid,
          approval: { by: uid, byName: adminName, at: Timestamp.fromMillis(now), note },
          brandingChangedSinceApproval: false,
          history: capHistory([...(s.history ?? []), historyEntry(uid, 'approved', note)]),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      return { ok: true, id, status: 'approved' };
    }

    case 'reject':
    case 'revoke': {
      await requirePlatformAdmin(db, uid);
      const id = idOf(body.id);
      const note = clean(body.note, LIMITS.noteMax);
      if (note.length < LIMITS.noteMin) throw new HttpError(400, 'Please give a short reason.');
      const ref = col.doc(id);
      const snap = await ref.get();
      if (!snap.exists) throw new HttpError(404, 'Sponsorship not found.');
      const s = snap.data()!;
      const from = action === 'reject' ? 'pending_review' : 'approved';
      if (s.status !== from) throw new HttpError(409, action === 'reject' ? 'Only a request under review can be rejected.' : 'Only an approved sponsorship can be revoked.');
      const status = action === 'reject' ? 'rejected' : 'revoked';
      await ref.update({ status, note, history: capHistory([...(s.history ?? []), historyEntry(uid, status, note)]), updatedAt: FieldValue.serverTimestamp() });
      return { ok: true, id, status };
    }

    case 'acknowledge': {
      await requirePlatformAdmin(db, uid);
      const id = idOf(body.id);
      const ref = col.doc(id);
      const snap = await ref.get();
      if (!snap.exists) throw new HttpError(404, 'Sponsorship not found.');
      await ref.update({ brandingChangedSinceApproval: false, history: capHistory([...(snap.data()!.history ?? []), historyEntry(uid, 'branding_reviewed')]), updatedAt: FieldValue.serverTimestamp() });
      return { ok: true, id };
    }

    default:
      throw new HttpError(400, 'Unknown action.');
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
    const result = await runAction(getFirestore(app), decoded.uid, req.body ?? {});
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(result);
  } catch (err: any) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (String(err?.code ?? '').startsWith('auth/')) return res.status(401).json({ error: 'Unauthorized' });
    console.error('arena-sponsorship error:', err?.code ?? err?.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
