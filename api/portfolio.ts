// api/portfolio.ts
// ─────────────────────────────────────────────────────────────────────────────
// "Share My Work": a member chooses what to show (summary, skills, projects, public Arena contributions, Prove reels, confirmed
// achievements, résumé, a way to get in touch), previews it, and shares it as a page anyone can open WITHOUT signing up.
//
// The page is rendered here, on the server (renderPortfolio), so a link preview is accurate, a visitor needs no app and no login,
// and nothing but the chosen material is ever sent. Styling and the few small behaviours are static files (public/portfolio/), so the
// page works under the site's strict Content-Security-Policy and loads no third party resource (no font, script or image host that
// could learn the link).
//
// Public (no login)
//   GET /w/<token>                   an unlisted link          (rewritten to /api/portfolio?t=<token>)
//   GET /be/<username>/work          the member's public portfolio, if they have published one   (?u=<username>)
//        ?resume=1                   the résumé, if the member enabled it for this share
//        ?print=1                    the same page, opened ready to print / save as PDF
//   POST { action: 'contact', ... }  the protected contact form (also accepts a plain form post)
// Signed in (Authorization: Bearer <idToken>), POST { action, ... }
//   sources  what this member can share, with what each item is (and is not)      list      my shared portfolios
//   save     create or update one share (the link stays the same on update)        preview   the page for an unsaved choice
//   revoke   switch a link off, on its own                                         delete    remove a revoked one
//
// What a shared portfolio is, and is not
//   - An unlisted link is OPEN TO ANYONE WHO HAS IT. It is not private to the person you sent it to, and the page says so. It is
//     noindex, never in a sitemap, and its social preview names nobody and shows nothing about the work.
//   - A public portfolio is the member's explicit choice, lives on their own /be/<username>/work address and may be indexed.
//   - Every selected item is re-checked against the member's own records, here, each time it is saved or (for a live link) viewed:
//     a reel must be theirs, an Arena contribution must be a link this server recorded, a project must be on their profile.
//   - Nothing is called verified because it was uploaded. Each item carries what it actually is: self-reported, submitted work,
//     confirmed by a named colleague, reviewed, or a verified outcome recorded by an Arena reviewer. See LEVELS.
//   - Visits are counted without storing who visited: no address, no user agent, no cookie. Link-preview robots and crawlers are
//     counted apart from people.
//
// Self-contained on purpose: api/ routes cannot import from lib/ on Vercel.
// Secret: PORTFOLIO_SECRET, else COMMS_UNSUBSCRIBE_SECRET (nothing works with neither).
// ─────────────────────────────────────────────────────────────────────────────
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const DAY = 86_400_000;
export const ORIGIN = 'https://www.bewatu.com';
export const LIMITS = {
  SHARES_PER_MEMBER: 10, SAVES_PER_HOUR: 60, PREVIEWS_PER_HOUR: 240,
  INTRO_MAX: 600, LABEL_MAX: 60, MAX_PER_SECTION: 12, MAX_SKILLS: 24,
  CONTACT_PER_IP_HOUR: 5, CONTACT_PER_SHARE_DAY: 20, CONTACT_MIN_AGE_MS: 3_000, CONTACT_MAX_AGE_MS: 2 * 3_600_000,
  NAME_MAX: 100, MESSAGE_MAX: 2000, RESUME_PROXY_MAX: 4_000_000,
};

// ── what an item is: the honest vocabulary ───────────────────────────────────
export type Level = 'self' | 'submitted' | 'confirmed' | 'reviewed' | 'verified';
export const LEVELS: Record<Level, { label: string; meaning: string }> = {
  self:      { label: 'Self-reported',          meaning: 'The member says so. Nobody has checked it.' },
  submitted: { label: 'Submitted work',         meaning: 'Work the member put forward. BeWatu has not judged its quality or authorship.' },
  confirmed: { label: 'Collaborator-confirmed', meaning: 'A colleague or named verifier has confirmed it. BeWatu has not independently checked it.' },
  reviewed:  { label: 'Reviewed',               meaning: 'Evidence was reviewed by BeWatu, or a submission was shortlisted by an Arena reviewer.' },
  verified:  { label: 'Verified outcome',       meaning: 'An Arena reviewer recorded this outcome (for example, selected as a winner).' },
};

export type SectionKey = 'summary' | 'skills' | 'projects' | 'arena' | 'reels' | 'achievements';
export const SECTION_KEYS: SectionKey[] = ['summary', 'skills', 'projects', 'arena', 'reels', 'achievements'];
export const SECTION_TITLES: Record<SectionKey, string> = {
  summary: 'About', skills: 'Expertise', projects: 'Selected work', arena: 'Arena contributions', reels: 'Prove reels', achievements: 'Confirmed achievements',
};
export type ContactMode = 'none' | 'email' | 'form';
export type Expiry = '7d' | '30d' | '90d' | 'never';

export interface ShareConfig {
  label: string; kind: 'unlisted' | 'public'; sections: SectionKey[];
  selection: { skills: string[]; projects: string[]; arena: string[]; reels: string[]; achievements: string[] };
  intro: string; resume: boolean; contact: { mode: ContactMode; email?: string };
  updatePolicy: 'live' | 'snapshot'; expiry: Expiry;
}

// ── small helpers ────────────────────────────────────────────────────────────
// eslint-disable-next-line no-control-regex
const CTRL = /[\u0000-\u0008\u000b-\u001f\u007f]+/g;
export const clean = (v: unknown, max: number) => (typeof v === 'string' ? v : '').replace(CTRL, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
export const cleanText = (v: unknown, max: number) => (typeof v === 'string' ? v : '').replace(/\r\n?/g, '\n').replace(CTRL, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const safeId = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v) ? v : '');
const hmac = (secret: string, data: string) => createHmac('sha256', secret).update(data).digest();
const first = (name: string) => name.trim().split(/\s+/)[0] || 'them';
/** An https address a visitor may follow or load; anything else (javascript:, data:, http:) is dropped. */
export function safeHttps(v: unknown, hosts?: RegExp): string | null {
  if (typeof v !== 'string' || v.length > 2000) return null;
  try { const u = new URL(v.trim()); return u.protocol === 'https:' && !u.username && !u.password && (!hosts || hosts.test(u.hostname)) ? u.toString() : null; } catch { return null; }
}
// Media may only come from the one storage host the site's content policy lets a page play from (vercel.json); a résumé is fetched by the server, so it may also come from the newer storage hosts.
const VIDEO_HOST = /^firebasestorage\.googleapis\.com$/;
const STORAGE_HOST = /(^|\.)firebasestorage\.googleapis\.com$|(^|\.)firebasestorage\.app$|^storage\.googleapis\.com$/;
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

// ── tokens: a random id and a signature (same scheme as invitations; the server can re-derive it, nothing is guessable) ──
const TOKEN_RE = /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}$/;
export const newShareId = () => randomBytes(12).toString('base64url');
export const tokenFor = (secret: string, id: string) => `${id}.${hmac(secret, 'portfolio-token:' + id).subarray(0, 16).toString('base64url')}`;
export function idFromToken(secret: string | undefined, token: unknown): string | null {
  if (!secret || typeof token !== 'string' || !TOKEN_RE.test(token)) return null;
  const id = token.slice(0, 16);
  const a = Buffer.from(tokenFor(secret, id)), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}
export const urlFor = (secret: string, share: { kind: string; id: string }, username?: string | null) =>
  share.kind === 'public' ? (username ? `${ORIGIN}/be/${username}/work` : null) : `${ORIGIN}/w/${tokenFor(secret, share.id)}`;

// A signed timestamp on the contact form: a bot that fills it in instantly, or replays an old page, is refused.
export const formStamp = (secret: string, now: number, shareId: string) => `${now}.${hmac(secret, `portfolio-form:${shareId}:${now}`).subarray(0, 12).toString('base64url')}`;
export function formStampAge(secret: string, stamp: unknown, shareId: string, now: number): number | null {
  if (typeof stamp !== 'string') return null;
  const m = stamp.match(/^(\d{10,14})\.([A-Za-z0-9_-]{16})$/);
  if (!m) return null;
  const ts = Number(m[1]);
  const a = Buffer.from(formStamp(secret, ts, shareId)), b = Buffer.from(stamp);
  return a.length === b.length && timingSafeEqual(a, b) ? now - ts : null;
}

// ── edges ────────────────────────────────────────────────────────────────────
export interface Mail { to: string; subject: string; html: string; text: string; replyTo?: string }
export interface Deps {
  db: Firestore; secret: string | undefined; now: number;
  mail: (m: Mail) => Promise<boolean>;
  /** The member's own email (private contact record, else their sign-in address). Never shown on a page. */
  ownerEmail?: (uid: string) => Promise<string | null>;
  /** Fetches the résumé file for download (host-checked by the caller). */
  fetchFile?: (url: string) => Promise<{ ok: boolean; type: string; length: number; body: Buffer } | null>;
}
const need = (d: Deps) => { if (!d.secret) throw new HttpError(503, 'Sharing is not available right now.'); return d.secret; };

export async function hit(db: Firestore, key: string, max: number, windowMs: number, now: number): Promise<boolean> {
  const ref = db.collection('portfolio_rate_limits').doc(key.replace(/[^A-Za-z0-9_:.-]/g, '_').slice(0, 200));
  return db.runTransaction(async tx => {
    const s = (await tx.get(ref)).data() as { count?: number; windowStart?: number } | undefined;
    const fresh = !s?.windowStart || now - s.windowStart >= windowMs;
    const count = fresh ? 0 : (s?.count ?? 0);
    if (count >= max) return false;
    tx.set(ref, { count: count + 1, windowStart: fresh ? now : s!.windowStart, updatedAt: now });
    return true;
  });
}
const ipKey = (secret: string, ip: string) => hmac(secret, 'portfolio-ip:' + ip).toString('hex').slice(0, 32);

// ═════════════════════════════════════════════════════════════════════════════
// what a member can share, and what each thing is
// ═════════════════════════════════════════════════════════════════════════════
export interface SkillItem { name: string; level: Level; endorsers: number; note: string | null }
export interface ProjectItem { id: string; title: string; description: string; tech: string[]; outcome: string; url: string | null; level: Level }
export interface ArenaItem { id: string; title: string; industry: string; contribution: string; skills: string[]; outcome: 'submitted' | 'shortlisted' | 'winner'; checkedAt: number | null; level: Level }
export interface ReelItem { id: string; videoUrl: string; poster: string | null; caption: string; skills: string[]; duration: number | null; level: Level }
export interface AchievementItem { id: string; text: string; verifier: string; level: Level }
export interface Sources { owner: Record<string, any>; skills: SkillItem[]; projects: ProjectItem[]; arena: ArenaItem[]; reels: ReelItem[]; achievements: AchievementItem[]; resumeUrl: string | null }

/** The level a recorded Arena outcome earns. Only what the reviewer recorded counts; a plain submission is "submitted work". */
export const arenaLevel = (outcome: unknown): { outcome: ArenaItem['outcome']; level: Level } =>
  outcome === 'winner' ? { outcome: 'winner', level: 'verified' } : outcome === 'shortlisted' ? { outcome: 'shortlisted', level: 'reviewed' } : { outcome: 'submitted', level: 'submitted' };

export async function loadSources(db: Firestore, uid: string): Promise<Sources | null> {
  const us = await db.collection('users').doc(uid).get();
  if (!us.exists) return null;
  const u = us.data()!;

  // skills: self-reported, unless a colleague endorsed it, or BeWatu reviewed evidence for it
  const endorsements: any[] = Array.isArray(u.endorsements) ? u.endorsements : [];
  const verified = new Map<string, string>((Array.isArray(u.verifiedSkills) ? u.verifiedSkills : []).filter((s: any) => s?.name).map((s: any) => [String(s.name).toLowerCase(), clean(s.proficiency, 20)]));
  const seen = new Set<string>();
  const skills: SkillItem[] = [];
  for (const s of Array.isArray(u.skills) ? u.skills : []) {
    const name = clean(typeof s === 'string' ? s : s?.name, 60);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const e = endorsements.find(x => String(x?.skillName ?? '').toLowerCase() === name.toLowerCase());
    const endorsers = (Array.isArray(e?.endorsedBy) ? e.endorsedBy.length : 0) + (Array.isArray(e?.unclaimedEndorsers) ? e.unclaimedEndorsers.length : 0);
    const reviewed = verified.has(name.toLowerCase());
    skills.push({ name, endorsers, level: reviewed ? 'reviewed' : endorsers > 0 ? 'confirmed' : 'self', note: reviewed ? (verified.get(name.toLowerCase()) || null) : null });
  }

  const projects: ProjectItem[] = (Array.isArray(u.portfolio) ? u.portfolio : []).map((p: any, i: number) => ({
    id: safeId(String(p?.id ?? i)) || String(i), title: clean(p?.title, 120), description: cleanText(p?.description || p?.aiGeneratedSummary, 700),
    tech: (Array.isArray(p?.technologies) ? p.technologies : []).map((t: any) => clean(t, 40)).filter(Boolean).slice(0, 12),
    outcome: clean(p?.outcome, 300), url: safeHttps(p?.url), level: 'submitted' as Level,
  })).filter((p: ProjectItem) => p.title);

  const reelSnap = await db.collection('reels').where('authorUid', '==', uid).limit(60).get();
  const reels: ReelItem[] = [], arena: ArenaItem[] = [];
  for (const s of reelSnap.docs) {
    const r = s.data();
    const videoUrl = safeHttps(r.videoUrl, VIDEO_HOST);
    if (videoUrl) reels.push({ id: s.id, videoUrl, poster: safeHttps(r.thumbnailUrl), caption: clean(r.pitch, 280), skills: (Array.isArray(r.skills) ? r.skills : []).map((x: any) => clean(x, 40)).filter(Boolean).slice(0, 8), duration: Number.isFinite(r.duration) ? Math.round(r.duration) : null, level: 'submitted' });
    const l = r.arenaLink;
    if (l?.challengeId && l.challengeTitle) {
      const a = arenaLevel(l.outcome);
      arena.push({ id: s.id, title: clean(l.challengeTitle, 140), industry: clean(l.industry, 40), contribution: clean(l.contribution, 280), skills: (Array.isArray(l.skills) ? l.skills : []).map((x: any) => clean(x, 40)).filter(Boolean).slice(0, 8), checkedAt: typeof l.checkedAt?.toMillis === 'function' ? l.checkedAt.toMillis() : (typeof l.checkedAt === 'number' ? l.checkedAt : null), ...a });
    }
  }

  const achievements: AchievementItem[] = (Array.isArray(u.verifiedAchievements) ? u.verifiedAchievements : []).map((a: any, i: number) => ({
    id: safeId(String(a?.id ?? i)) || String(i), text: clean(a?.achievement, 300),
    verifier: [clean(a?.verifierName, 80), clean(a?.verifierTitle, 80), clean(a?.verifierCompany, 80)].filter(Boolean).join(', '), level: 'confirmed' as Level,
  })).filter((a: AchievementItem) => a.text && a.verifier);

  return { owner: u, skills, projects, arena, reels, achievements, resumeUrl: safeHttps(u.resumeUrl, STORAGE_HOST) };
}

// ═════════════════════════════════════════════════════════════════════════════
// the model a page is drawn from (built from the member's own records, only what was selected)
// ═════════════════════════════════════════════════════════════════════════════
export interface Section { key: SectionKey; title: string; items: any[] }
export interface Model {
  owner: { name: string; headline: string; photoUrl: string | null; industry: string; username: string | null };
  intro: string; sections: Section[]; resume: boolean; contact: { mode: ContactMode; emailSet: boolean }; builtAt: number;
}
const pick = <T extends { id?: string; name?: string }>(all: T[], ids: string[], by: 'id' | 'name' = 'id'): T[] => {
  const out: T[] = [];
  for (const want of ids) { const hit = all.find(x => (by === 'id' ? x.id : x.name?.toLowerCase()) === (by === 'id' ? want : want.toLowerCase())); if (hit && !out.includes(hit)) out.push(hit); }
  return out;
};

export function buildModel(src: Sources, cfg: ShareConfig, now: number): Model {
  const u = src.owner;
  const sections: Section[] = [];
  for (const key of cfg.sections) {
    if (!SECTION_KEYS.includes(key) || sections.some(s => s.key === key)) continue;
    let items: any[] = [];
    if (key === 'skills') items = pick(src.skills as any, cfg.selection.skills, 'name');
    else if (key === 'projects') items = pick(src.projects, cfg.selection.projects);
    else if (key === 'arena') items = pick(src.arena, cfg.selection.arena);
    else if (key === 'reels') items = pick(src.reels, cfg.selection.reels);
    else if (key === 'achievements') items = pick(src.achievements, cfg.selection.achievements);
    if (key === 'summary') { if (cfg.intro) sections.push({ key, title: SECTION_TITLES[key], items: [] }); continue; }
    if (items.length) sections.push({ key, title: SECTION_TITLES[key], items });
  }
  return {
    owner: { name: clean(u.displayName, 100) || 'A BeWatu member', headline: clean(u.headline, 160), photoUrl: safeHttps(u.photoURL), industry: clean(u.industry, 60), username: typeof u.username === 'string' ? u.username : null },
    intro: cfg.sections.includes('summary') ? cfg.intro : '', sections, resume: cfg.resume && !!src.resumeUrl,
    contact: { mode: cfg.contact.mode, emailSet: cfg.contact.mode === 'email' && !!cfg.contact.email }, builtAt: now,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// validating what the member sent
// ═════════════════════════════════════════════════════════════════════════════
export function parseConfig(body: any, src: Sources): ShareConfig {
  const c = body?.config ?? body ?? {};
  const kind = c.kind === 'public' ? 'public' : 'unlisted';
  const sections = (Array.isArray(c.sections) ? c.sections : []).filter((k: any) => SECTION_KEYS.includes(k)).filter((k: string, i: number, a: string[]) => a.indexOf(k) === i) as SectionKey[];
  const sel = c.selection ?? {};
  const list = (v: unknown, max: number) => (Array.isArray(v) ? v : []).map(x => (typeof x === 'string' ? x : typeof x === 'number' ? String(x) : '')).map(x => x.trim()).filter(Boolean).slice(0, max);
  const selection = { skills: list(sel.skills, LIMITS.MAX_SKILLS), projects: list(sel.projects, LIMITS.MAX_PER_SECTION), arena: list(sel.arena, LIMITS.MAX_PER_SECTION), reels: list(sel.reels, LIMITS.MAX_PER_SECTION), achievements: list(sel.achievements, LIMITS.MAX_PER_SECTION) };
  // A pick that is not the member's own is refused loudly, never skipped quietly: nothing outside their own records can be shared.
  const own = (ids: string[], all: { id?: string; name?: string }[], by: 'id' | 'name', what: string) => {
    for (const id of ids) if (!all.some(x => (by === 'id' ? x.id === id : x.name?.toLowerCase() === id.toLowerCase()))) throw new HttpError(400, `That ${what} isn't one of yours to share.`);
  };
  own(selection.skills, src.skills, 'name', 'skill'); own(selection.projects, src.projects, 'id', 'project'); own(selection.arena, src.arena, 'id', 'Arena contribution');
  own(selection.reels, src.reels, 'id', 'reel'); own(selection.achievements, src.achievements, 'id', 'achievement');
  const mode: ContactMode = c.contact?.mode === 'email' ? 'email' : c.contact?.mode === 'form' ? 'form' : 'none';
  const email = clean(c.contact?.email, 254).toLowerCase();
  if (mode === 'email' && !/^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/.test(email)) throw new HttpError(400, 'Enter the email address you want people to see.');
  const wantsContent = sections.length > 0 && (sections.some(k => k !== 'summary') || !!cleanText(c.intro, LIMITS.INTRO_MAX));
  if (!wantsContent) throw new HttpError(400, 'Choose something to share first.');
  if (c.resume === true && !src.resumeUrl) throw new HttpError(400, 'Upload a résumé on your profile first.');
  return {
    label: clean(c.label, LIMITS.LABEL_MAX) || (kind === 'public' ? 'Public portfolio' : 'Shared portfolio'), kind, sections, selection,
    intro: cleanText(c.intro, LIMITS.INTRO_MAX), resume: c.resume === true, contact: mode === 'email' ? { mode, email } : { mode },
    updatePolicy: c.updatePolicy === 'snapshot' ? 'snapshot' : 'live', expiry: (['7d', '30d', '90d', 'never'] as Expiry[]).includes(c.expiry) ? c.expiry : '30d',
  };
}
const EXPIRY_MS: Record<Expiry, number | null> = { '7d': 7 * DAY, '30d': 30 * DAY, '90d': 90 * DAY, never: null };

export interface ShareDoc {
  ownerUid: string; kind: 'unlisted' | 'public'; status: 'active' | 'revoked'; config: ShareConfig; createdAt: number; updatedAt: number;
  expiresAt: number | null; revokedAt?: number | null; snapshot?: Model | null; snapshotAt?: number | null;
  views?: { human?: number; preview?: number; bot?: number }; lastViewedAt?: number | null; contactCount?: number;
}
export type Access = 'ok' | 'revoked' | 'expired';
export const accessOf = (s: Pick<ShareDoc, 'status' | 'expiresAt'>, now: number): Access => s.status === 'revoked' ? 'revoked' : s.expiresAt != null && s.expiresAt <= now ? 'expired' : 'ok';

function shareView(d: Deps, id: string, s: ShareDoc, username: string | null) {
  const access = accessOf(s, d.now);
  return {
    id, kind: s.kind, label: s.config.label, status: access, url: access === 'revoked' ? null : urlFor(d.secret!, { kind: s.kind, id }, username),
    createdAt: s.createdAt, updatedAt: s.updatedAt, expiresAt: s.expiresAt, updatePolicy: s.config.updatePolicy, snapshotAt: s.snapshotAt ?? null,
    views: { human: s.views?.human ?? 0, preview: s.views?.preview ?? 0, bot: s.views?.bot ?? 0 }, lastViewedAt: s.lastViewedAt ?? null, contactCount: s.contactCount ?? 0, config: s.config,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// signed-in actions
// ═════════════════════════════════════════════════════════════════════════════
export async function runAction(d: Deps, uid: string, body: any): Promise<Record<string, unknown>> {
  if (!uid) throw new HttpError(401, 'Unauthorized');
  const secret = need(d);
  const col = d.db.collection('portfolio_shares');
  const usernameOf = async () => ((await d.db.collection('users').doc(uid).get()).data()?.username as string | undefined) ?? null;

  switch (body?.action) {
    case 'sources': {
      const src = await loadSources(d.db, uid);
      if (!src) throw new HttpError(404, 'Account not found.');
      const u = src.owner;
      return {
        profile: { name: clean(u.displayName, 100), headline: clean(u.headline, 160), bio: cleanText(u.bio, LIMITS.INTRO_MAX), username: u.username ?? null, isPublic: u.isPublic !== false && u.privacySettings?.profileVisibility !== 'private' && u.privacySettings?.profileVisibility !== 'connections' },
        email: (await d.ownerEmail?.(uid)) ?? null,
        skills: src.skills, projects: src.projects.map(p => ({ id: p.id, title: p.title, summary: p.description.slice(0, 140) })),
        arena: src.arena.map(a => ({ id: a.id, title: a.title, outcome: a.outcome, level: a.level })),
        reels: src.reels.map(r => ({ id: r.id, caption: r.caption, poster: r.poster, duration: r.duration })),
        achievements: src.achievements.map(a => ({ id: a.id, text: a.text, verifier: a.verifier })),
        resume: !!src.resumeUrl, levels: LEVELS,
      };
    }

    case 'list': {
      const snap = await col.where('ownerUid', '==', uid).limit(50).get();
      const username = await usernameOf();
      return { shares: snap.docs.map(s => shareView(d, s.id, s.data() as ShareDoc, username)).sort((a, b) => b.updatedAt - a.updatedAt) };
    }

    case 'preview': {
      if (!(await hit(d.db, `preview:${uid}`, LIMITS.PREVIEWS_PER_HOUR, 3_600_000, d.now))) throw new HttpError(429, 'Too many previews. Try again in a little while.');
      const src = await loadSources(d.db, uid);
      if (!src) throw new HttpError(404, 'Account not found.');
      const cfg = parseConfig(body, src);
      const model = buildModel(src, cfg, d.now);
      return { html: renderPortfolio(model, { kind: cfg.kind, preview: true, url: null, label: cfg.label, formStamp: null }), items: model.sections.reduce((n, s) => n + (s.items.length || 1), 0) };
    }

    case 'save': {
      if (!(await hit(d.db, `save:${uid}`, LIMITS.SAVES_PER_HOUR, 3_600_000, d.now))) throw new HttpError(429, 'You have saved a lot just now. Try again in a little while.');
      const src = await loadSources(d.db, uid);
      if (!src) throw new HttpError(404, 'Account not found.');
      const cfg = parseConfig(body, src);
      const username = (src.owner.username as string | undefined) ?? null;

      if (cfg.kind === 'public') {
        if (!username) throw new HttpError(409, 'Choose your BeWatu profile address first; the public page lives on it.');
        if (src.owner.isPublic === false || ['private', 'connections'].includes(src.owner.privacySettings?.profileVisibility)) throw new HttpError(409, 'Your profile is not public. Make it public first, or share an unlisted link instead.');
      }
      const id = cfg.kind === 'public' ? `public_${uid}` : (safeId(body.id) || newShareId());
      const ref = col.doc(id);
      const existing = (await ref.get()).data() as ShareDoc | undefined;
      if (existing && existing.ownerUid !== uid) throw new HttpError(404, 'Share not found.');
      if (existing && existing.kind !== cfg.kind) throw new HttpError(400, 'A link cannot change between unlisted and public. Make a new one.');
      if (!existing) {
        if (body.id && cfg.kind === 'unlisted' && !/^[A-Za-z0-9_-]{16}$/.test(body.id)) throw new HttpError(400, 'Share not found.');
        const mine = await col.where('ownerUid', '==', uid).get();
        if (mine.docs.filter(s => s.data().status === 'active').length >= LIMITS.SHARES_PER_MEMBER) throw new HttpError(409, `You can have ${LIMITS.SHARES_PER_MEMBER} active links. Switch one off to make another.`);
      }
      const wasRevoked = existing?.status === 'revoked';
      const ttl = cfg.kind === 'public' ? null : EXPIRY_MS[cfg.expiry];
      // A link keeps its expiry on a plain edit; it is only reset when the member picks a different one (or revives a switched-off link).
      const expiresAt = existing && !wasRevoked && existing.config.expiry === cfg.expiry ? existing.expiresAt : (ttl == null ? null : d.now + ttl);
      const doc: ShareDoc = {
        ownerUid: uid, kind: cfg.kind, status: 'active', config: cfg, createdAt: existing?.createdAt ?? d.now, updatedAt: d.now, expiresAt, revokedAt: null,
        snapshot: cfg.updatePolicy === 'snapshot' ? buildModel(src, cfg, d.now) : null, snapshotAt: cfg.updatePolicy === 'snapshot' ? d.now : null,
        views: existing?.views ?? { human: 0, preview: 0, bot: 0 }, lastViewedAt: existing?.lastViewedAt ?? null, contactCount: existing?.contactCount ?? 0,
      };
      await ref.set(doc);
      return { share: shareView(d, id, doc, username), created: !existing };
    }

    case 'revoke': {
      const id = safeId(body.id); if (!id) throw new HttpError(400, 'Choose a link.');
      const ref = col.doc(id); const s = (await ref.get()).data() as ShareDoc | undefined;
      if (!s || s.ownerUid !== uid) throw new HttpError(404, 'Share not found.');
      if (s.status !== 'revoked') await ref.update({ status: 'revoked', revokedAt: d.now, updatedAt: d.now });
      return { share: shareView(d, id, { ...s, status: 'revoked', revokedAt: d.now }, await usernameOf()) };
    }

    case 'delete': {
      const id = safeId(body.id); if (!id) throw new HttpError(400, 'Choose a link.');
      const ref = col.doc(id); const s = (await ref.get()).data() as ShareDoc | undefined;
      if (!s || s.ownerUid !== uid) throw new HttpError(404, 'Share not found.');
      if (s.status !== 'revoked') throw new HttpError(409, 'Switch the link off before deleting it.');
      await ref.delete();
      return { ok: true };
    }
    default: throw new HttpError(400, 'Unknown action.');
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// a visitor
// ═════════════════════════════════════════════════════════════════════════════
const PREVIEW_BOT = /facebookexternalhit|facebot|slackbot|slack-imgproxy|whatsapp|twitterbot|linkedinbot|discordbot|telegrambot|skypeuripreview|embedly|pinterest|redditbot|applebot|iMessage|bingpreview|googleother|google-read-aloud|mastodon|signal|viber/i;
const CRAWLER = /bot|crawl|spider|slurp|headless|curl|wget|python|go-http|java\/|httpclient|monitor|uptime|lighthouse/i;
export type VisitKind = 'human' | 'preview' | 'bot';
/** Link-preview robots and crawlers are not people. A missing or tiny user agent is not a person either. */
export const visitKind = (ua: unknown): VisitKind => typeof ua !== 'string' || ua.length < 8 ? 'bot' : PREVIEW_BOT.test(ua) ? 'preview' : CRAWLER.test(ua) ? 'bot' : 'human';

export interface Found { id: string; share: ShareDoc; username: string | null }
export async function findShare(d: Deps, q: { t?: unknown; u?: unknown }): Promise<Found | null> {
  const secret = need(d);
  if (q.t != null) {
    const id = idFromToken(secret, q.t);
    if (!id) return null;
    const s = await d.db.collection('portfolio_shares').doc(id).get();
    if (!s.exists || s.data()!.kind !== 'unlisted') return null;
    return { id, share: s.data() as ShareDoc, username: null };
  }
  const uname = typeof q.u === 'string' && /^[a-z0-9_-]{1,40}$/i.test(q.u) ? q.u.toLowerCase() : '';
  if (!uname) return null;
  const us = await d.db.collection('users').where('username', '==', uname).limit(1).get();
  if (us.empty) return null;
  const s = await d.db.collection('portfolio_shares').doc(`public_${us.docs[0].id}`).get();
  return s.exists ? { id: s.id, share: s.data() as ShareDoc, username: uname } : null;
}

/** Only a visitor's own first words and a count are kept: nothing that says who they are. */
async function countVisit(d: Deps, id: string, kind: VisitKind) {
  const day = new Date(d.now).toISOString().slice(0, 10);
  try { await d.db.collection('portfolio_shares').doc(id).update({ [`views.${kind}`]: FieldValue.increment(1), [`daily.${day}.${kind}`]: FieldValue.increment(1), ...(kind === 'human' ? { lastViewedAt: d.now } : {}) }); } catch { /* a count never breaks a page */ }
}

export interface PageResult { status: number; headers: Record<string, string>; html: string }
const BASE_HEADERS = (cache: string): Record<string, string> => ({
  'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': cache, 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
});

/** The page for a visitor: found, still open, built from the member's records (or the snapshot they chose), counted once. */
export async function servePage(d: Deps, q: { t?: unknown; u?: unknown }, ua: unknown, opts: { print?: boolean } = {}): Promise<PageResult> {
  const secret = need(d);
  const gone = (status: number, title: string, text: string): PageResult => ({ status, headers: { ...BASE_HEADERS('no-store'), 'X-Robots-Tag': 'noindex, nofollow, noarchive' }, html: renderGone(title, text) });
  const found = await findShare(d, q);
  if (!found) return gone(404, 'This page isn\'t available', 'The link may be incomplete, or the person who shared it has taken it down.');
  const { id, share } = found;
  const access = accessOf(share, d.now);
  if (access !== 'ok') return gone(410, access === 'expired' ? 'This link has expired' : 'This link has been switched off', 'Ask the person who shared it for a new link.');
  const src = await loadSources(d.db, share.ownerUid);
  if (!src) return gone(404, 'This page isn\'t available', 'The link may be incomplete, or the person who shared it has taken it down.');
  if (share.kind === 'public' && (src.owner.isPublic === false || ['private', 'connections'].includes(src.owner.privacySettings?.profileVisibility))) return gone(404, 'This page isn\'t available', 'The person who shared it has taken it down.');

  const model = share.config.updatePolicy === 'snapshot' && share.snapshot ? share.snapshot : buildModel(src, share.config, d.now);
  // The résumé and the contact option follow the member's latest choices even on a snapshot: they are not "content" and must be revocable.
  model.resume = share.config.resume && !!src.resumeUrl;
  model.contact = { mode: share.config.contact.mode, emailSet: share.config.contact.mode === 'email' && !!share.config.contact.email };
  const kind = visitKind(ua);
  await countVisit(d, id, kind);
  const html = renderPortfolio(model, {
    kind: share.kind, preview: false, url: urlFor(secret, { kind: share.kind, id }, found.username), label: share.config.label,
    formStamp: share.config.contact.mode === 'form' ? formStamp(secret, d.now, id) : null, emailEnc: share.config.contact.mode === 'email' ? Buffer.from(share.config.contact.email ?? '').toString('base64') : null,
    autoPrint: !!opts.print, expiresAt: share.expiresAt,
  });
  return {
    status: 200, html,
    headers: { ...BASE_HEADERS(share.kind === 'public' ? 'public, s-maxage=60, stale-while-revalidate=300' : 'private, no-store'), ...(share.kind === 'public' ? {} : { 'X-Robots-Tag': 'noindex, nofollow, noarchive' }) },
  };
}

/** The résumé, for an open link that has it enabled. The file's own address is never given to the visitor when it can be avoided. */
export async function serveResume(d: Deps, q: { t?: unknown; u?: unknown }): Promise<{ status: number; redirect?: string; file?: { type: string; body: Buffer; name: string }; error?: string }> {
  const found = await findShare(d, q);
  if (!found || accessOf(found.share, d.now) !== 'ok' || !found.share.config.resume) return { status: 404, error: 'This résumé isn\'t available.' };
  const src = await loadSources(d.db, found.share.ownerUid);
  if (!src?.resumeUrl) return { status: 404, error: 'This résumé isn\'t available.' };
  const f = d.fetchFile ? await d.fetchFile(src.resumeUrl).catch(() => null) : null;
  if (f?.ok && f.length <= LIMITS.RESUME_PROXY_MAX) {
    const ext = /pdf/i.test(f.type) ? 'pdf' : /wordprocessingml/i.test(f.type) ? 'docx' : /msword/i.test(f.type) ? 'doc' : 'pdf';
    return { status: 200, file: { type: f.type || 'application/octet-stream', body: f.body, name: `${clean(src.owner.displayName, 60).replace(/[^A-Za-z0-9 _-]/g, '').replace(/\s+/g, '-') || 'resume'}-resume.${ext}` } };
  }
  // Too large (or unreachable) to pass along here: send the visitor to the file itself rather than fail.
  return { status: 302, redirect: src.resumeUrl };
}

// ── the protected contact form ───────────────────────────────────────────────
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;
export async function submitContact(d: Deps, body: any, ip: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  const secret = need(d);
  const fail = (status: number, error: string) => ({ ok: false, status, error });
  const found = await findShare(d, { t: body?.t, u: body?.u });
  if (!found || accessOf(found.share, d.now) !== 'ok' || found.share.config.contact.mode !== 'form') return fail(404, 'This contact form isn\'t available.');
  // The honeypot is a field people never see; a bot fills it. We say "sent" and send nothing.
  if (typeof body.website === 'string' && body.website.trim()) return { ok: true };
  const age = formStampAge(secret, body.ft, found.id, d.now);
  if (age == null) return fail(400, 'Please reload the page and try again.');
  if (age < LIMITS.CONTACT_MIN_AGE_MS) return fail(429, 'That was quick. Please take a moment and send it again.');
  if (age > LIMITS.CONTACT_MAX_AGE_MS) return fail(400, 'This form has timed out. Please reload the page and try again.');
  const name = clean(body.name, LIMITS.NAME_MAX), email = clean(body.email, 254).toLowerCase(), message = cleanText(body.message, LIMITS.MESSAGE_MAX);
  if (!name) return fail(400, 'Please add your name.');
  if (!EMAIL_RE.test(email)) return fail(400, 'Please enter a valid email address so they can reply.');
  if (message.length < 10) return fail(400, 'Please write a short message.');
  if (!(await hit(d.db, `contact-ip:${ipKey(secret, ip)}`, LIMITS.CONTACT_PER_IP_HOUR, 3_600_000, d.now))) return fail(429, 'Too many messages from here. Please try again later.');
  if (!(await hit(d.db, `contact-share:${found.id}`, LIMITS.CONTACT_PER_SHARE_DAY, DAY, d.now))) return fail(429, 'This person has received a lot of messages today. Please try again tomorrow.');
  const to = await d.ownerEmail?.(found.share.ownerUid);
  if (!to) return fail(503, 'This message couldn\'t be delivered right now.');
  const sent = await d.mail({
    to, replyTo: email, subject: `A message for you from your BeWatu portfolio`,
    html: `<div style="font-family:Inter,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px 22px;color:#1c1917"><div style="font-weight:800;color:#1a4a3a;font-size:18px;margin-bottom:14px">BeWatu</div><p style="font-size:14px;line-height:1.6;margin:0 0 12px">Someone wrote to you through your portfolio link <strong>${esc(found.share.config.label)}</strong>. Reply to this email to answer them directly.</p><p style="font-size:14px;margin:4px 0"><strong>From:</strong> ${esc(name)} &lt;${esc(email)}&gt;</p><div style="margin-top:12px;padding:14px 16px;background:#f5f5f4;border-radius:10px;white-space:pre-wrap;font-size:14px;line-height:1.6">${esc(message)}</div><p style="color:#a8a29e;font-size:11px;margin-top:18px">We passed this message on and did not keep it. You can switch the contact form off any time from Share My Work.</p></div>`,
    text: `Someone wrote to you through your portfolio link "${found.share.config.label}". Reply to answer them directly.\n\nFrom: ${name} <${email}>\n\n${message}\n\nWe passed this on and did not keep it.`,
  });
  if (!sent) return fail(502, 'The message couldn\'t be sent. Please try again.');
  try { await d.db.collection('portfolio_shares').doc(found.id).update({ contactCount: FieldValue.increment(1) }); } catch { /* ignore */ }
  return { ok: true };
}

// ═════════════════════════════════════════════════════════════════════════════
// the page
// ═════════════════════════════════════════════════════════════════════════════
export interface RenderOpts {
  kind: 'unlisted' | 'public'; preview: boolean; url: string | null; label: string; formStamp: string | null; emailEnc?: string | null;
  autoPrint?: boolean; expiresAt?: number | null;
}

const initials = (n: string) => n.split(/\s+/).map(x => x[0]).join('').toUpperCase().slice(0, 2) || 'BW';
const badge = (l: Level) => `<span class="pf-badge pf-badge--${l}" title="${esc(LEVELS[l].meaning)}">${esc(LEVELS[l].label)}</span>`;
const chips = (xs: string[]) => xs.length ? `<ul class="pf-chips">${xs.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
const mins = (s: number | null) => (s == null ? '' : s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`);

function sectionHtml(s: Section, m: Model): string {
  const h = `<h2 class="pf-h2">${esc(s.title)}</h2>`;
  switch (s.key) {
    case 'summary': return `<section class="pf-section" aria-labelledby="s-summary"><h2 class="pf-h2" id="s-summary">About</h2><p class="pf-lead">${esc(m.intro).replace(/\n/g, '<br>')}</p></section>`;
    case 'skills': return `<section class="pf-section" aria-labelledby="s-skills"><h2 class="pf-h2" id="s-skills">${esc(s.title)}</h2><ul class="pf-skills">${s.items.map((x: SkillItem) =>
      `<li class="pf-skill"><span class="pf-skill-name">${esc(x.name)}</span>${badge(x.level)}${x.level === 'confirmed' ? `<span class="pf-skill-note">Confirmed by ${x.endorsers} ${x.endorsers === 1 ? 'colleague' : 'colleagues'}</span>` : x.note ? `<span class="pf-skill-note">${esc(x.note)}</span>` : ''}</li>`).join('')}</ul></section>`;
    case 'projects': return `<section class="pf-section" aria-labelledby="s-projects"><h2 class="pf-h2" id="s-projects">${esc(s.title)}</h2><div class="pf-cards">${s.items.map((p: ProjectItem) =>
      `<article class="pf-card"><div class="pf-card-top">${badge(p.level)}</div><h3 class="pf-h3">${esc(p.title)}</h3>${p.description ? `<p class="pf-p">${esc(p.description).replace(/\n/g, '<br>')}</p>` : ''}${p.outcome ? `<p class="pf-outcome"><span>Outcome, as stated by the member</span>${esc(p.outcome)}</p>` : ''}${chips(p.tech)}${p.url ? `<p class="pf-link"><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer nofollow">View the work · ${esc(hostOf(p.url))}<span class="pf-ext" aria-hidden="true"> ↗</span></a></p>` : ''}</article>`).join('')}</div></section>`;
    case 'arena': return `<section class="pf-section" aria-labelledby="s-arena"><h2 class="pf-h2" id="s-arena">${esc(s.title)}</h2><div class="pf-cards">${s.items.map((a: ArenaItem) =>
      `<article class="pf-card"><div class="pf-card-top">${badge(a.level)}<span class="pf-meta">${a.outcome === 'winner' ? 'Selected as a winner' : a.outcome === 'shortlisted' ? 'Shortlisted' : 'Submitted'}${a.industry ? ' · ' + esc(a.industry) : ''}</span></div><h3 class="pf-h3">${esc(a.title)}</h3>${a.contribution ? `<p class="pf-p">${esc(a.contribution)}</p>` : ''}${chips(a.skills)}<p class="pf-fine">${a.outcome === 'submitted' ? 'BeWatu confirmed this member submitted to the challenge.' : 'Outcome recorded by the challenge reviewer'}${a.checkedAt ? ', last checked ' + esc(new Date(a.checkedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })) : ''}.</p></article>`).join('')}</div></section>`;
    case 'reels': return `<section class="pf-section" aria-labelledby="s-reels"><h2 class="pf-h2" id="s-reels">${esc(s.title)}</h2><div class="pf-reels">${s.items.map((r: ReelItem) =>
      `<figure class="pf-reel"><video class="pf-video" controls preload="none" playsinline controlsList="nodownload"${r.poster ? ` poster="${esc(r.poster)}"` : ''} src="${esc(r.videoUrl)}" aria-label="${esc(r.caption || 'Prove reel')}"></video><figcaption>${badge(r.level)}${r.duration ? `<span class="pf-meta">${esc(mins(r.duration))}</span>` : ''}${r.caption ? `<span class="pf-cap">${esc(r.caption)}</span>` : ''}${chips(r.skills)}</figcaption></figure>`).join('')}</div></section>`;
    case 'achievements': return `<section class="pf-section" aria-labelledby="s-ach"><h2 class="pf-h2" id="s-ach">${esc(s.title)}</h2><ul class="pf-ach">${s.items.map((a: AchievementItem) =>
      `<li class="pf-card pf-card--flat"><div class="pf-card-top">${badge(a.level)}</div><p class="pf-p">${esc(a.text)}</p><p class="pf-fine">Confirmed by ${esc(a.verifier)}. BeWatu has not independently checked this.</p></li>`).join('')}</ul></section>`;
  }
  return h;
}

function actionsHtml(m: Model, o: RenderOpts): string {
  const f = first(m.owner.name);
  const parts: string[] = [];
  if (m.resume && !o.preview) parts.push(`<a class="pf-btn pf-btn--ghost" href="?resume=1" rel="nofollow">Download résumé</a>`);
  else if (m.resume) parts.push(`<span class="pf-btn pf-btn--ghost pf-btn--off">Download résumé</span>`);
  if (m.contact.mode === 'email') parts.push(o.preview || !o.emailEnc ? `<span class="pf-btn pf-btn--off">Email ${esc(f)}</span>` : `<button type="button" class="pf-btn" data-reveal="${esc(o.emailEnc)}">Email ${esc(f)}</button>`);
  if (m.contact.mode === 'form') parts.push(o.preview ? `<span class="pf-btn pf-btn--off">Contact ${esc(f)}</span>` : `<a class="pf-btn" href="#contact" data-open-contact>Contact ${esc(f)}</a>`);
  parts.push(o.preview ? '' : `<button type="button" class="pf-btn pf-btn--ghost" data-print>Save as PDF</button>`);
  return parts.filter(Boolean).join('');
}

function contactForm(o: RenderOpts, m: Model): string {
  if (m.contact.mode !== 'form' || o.preview || !o.formStamp) return '';
  return `<section class="pf-section pf-contact" id="contact" aria-labelledby="s-contact"><h2 class="pf-h2" id="s-contact">Get in touch</h2>
<form method="post" action="/api/portfolio" class="pf-form" data-contact-form novalidate>
<input type="hidden" name="action" value="contact"><input type="hidden" name="t" value="${esc(o.url?.includes('/w/') ? o.url.split('/w/')[1] : '')}"><input type="hidden" name="u" value="${esc(o.kind === 'public' ? m.owner.username ?? '' : '')}"><input type="hidden" name="ft" value="${esc(o.formStamp)}">
<div class="pf-field"><label for="c-name">Your name</label><input id="c-name" name="name" autocomplete="name" maxlength="100" required></div>
<div class="pf-field"><label for="c-email">Your email, so ${esc(first(m.owner.name))} can reply</label><input id="c-email" name="email" type="email" autocomplete="email" maxlength="254" required></div>
<div class="pf-field"><label for="c-msg">Message</label><textarea id="c-msg" name="message" rows="5" maxlength="2000" required></textarea></div>
<div class="pf-hp" aria-hidden="true"><label>Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label></div>
<p class="pf-fine">Your message goes to ${esc(first(m.owner.name))} by email. ${esc(first(m.owner.name))}'s address isn't shown, and BeWatu doesn't keep your message.</p>
<p class="pf-status" role="status" aria-live="polite" data-status></p>
<button class="pf-btn" type="submit">Send message</button></form></section>`;
}

export function renderPortfolio(m: Model, o: RenderOpts): string {
  const pub = o.kind === 'public' && !o.preview;
  const name = m.owner.name;
  const hasSummary = m.sections.some(s => s.key === 'summary');
  const title = pub ? `${name}${m.owner.headline ? ' · ' + m.owner.headline : ''} | BeWatu portfolio` : 'A portfolio shared on BeWatu';
  const desc = pub ? (m.intro || m.owner.headline || `${name}'s selected work on BeWatu.`).slice(0, 180) : 'A professional portfolio shared with you on BeWatu. Anyone with this link can view it.';
  const canonical = pub && o.url ? o.url : null;
  const image = pub && m.owner.photoUrl ? m.owner.photoUrl : `${ORIGIN}/android-chrome-512x512.png`;
  const head = [
    `<meta charset="utf-8">`, `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">`, `<meta name="referrer" content="no-referrer">`, `<meta name="color-scheme" content="light">`,
    `<meta name="robots" content="${pub ? 'index,follow' : 'noindex,nofollow,noarchive'}">`,
    `<title>${esc(title)}</title>`, `<meta name="description" content="${esc(desc)}">`,
    `<meta property="og:site_name" content="BeWatu">`, `<meta property="og:type" content="${pub ? 'profile' : 'website'}">`, `<meta property="og:title" content="${esc(title)}">`, `<meta property="og:description" content="${esc(desc)}">`, `<meta property="og:image" content="${esc(image)}">`,
    ...(canonical ? [`<meta property="og:url" content="${esc(canonical)}">`, `<link rel="canonical" href="${esc(canonical)}">`] : []),
    `<meta name="twitter:card" content="${pub && m.owner.photoUrl ? 'summary' : 'summary'}">`, `<meta name="twitter:title" content="${esc(title)}">`, `<meta name="twitter:description" content="${esc(desc)}">`,
    `<link rel="icon" href="/favicon-32x32.png" type="image/png">`, `<link rel="stylesheet" href="/portfolio/portfolio.css">`,
  ];
  if (pub) {
    const skills = (m.sections.find(s => s.key === 'skills')?.items ?? []).map((s: SkillItem) => s.name);
    head.push(`<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'ProfilePage', mainEntity: { '@type': 'Person', name, ...(m.owner.headline ? { jobTitle: m.owner.headline } : {}), ...(m.intro ? { description: m.intro } : {}), ...(m.owner.photoUrl ? { image: m.owner.photoUrl } : {}), ...(skills.length ? { knowsAbout: skills } : {}), ...(canonical ? { url: canonical } : {}) } }).replace(/</g, '\\u003c')}</script>`);
  }
  const body = m.sections.filter(s => s.key !== 'summary').map(s => sectionHtml(s, m)).join('');
  const nothing = m.sections.length === 0;
  const unlistedNote = o.kind === 'unlisted' ? `<p class="pf-notice">This is an unlisted link: anyone who has it can open this page. It isn't private to one person${o.expiresAt ? ` and it stops working on ${esc(new Date(o.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }))}` : ''}.</p>` : '';
  return `<!doctype html><html lang="en"><head>${head.join('\n')}</head><body class="pf"${o.autoPrint ? ' data-autoprint' : ''}>
<a class="pf-skip" href="#main">Skip to the work</a>
<header class="pf-top"><span class="pf-brand">BeWatu</span><span class="pf-top-note">${o.preview ? 'Preview' : 'Portfolio'}</span></header>
<main id="main" class="pf-main">
<section class="pf-hero" aria-label="${esc(name)}">
${m.owner.photoUrl ? `<img class="pf-avatar" src="${esc(m.owner.photoUrl)}" alt="" width="96" height="96" referrerpolicy="no-referrer">` : `<div class="pf-avatar pf-avatar--init" aria-hidden="true">${esc(initials(name))}</div>`}
<div class="pf-hero-text"><h1 class="pf-h1">${esc(name)}</h1>${m.owner.headline ? `<p class="pf-headline">${esc(m.owner.headline)}</p>` : ''}${m.owner.industry ? `<p class="pf-industry">${esc(m.owner.industry)}</p>` : ''}</div>
</section>
${hasSummary && m.intro ? `<p class="pf-lead pf-lead--hero">${esc(m.intro).replace(/\n/g, '<br>')}</p>` : ''}
<div class="pf-actions">${actionsHtml(m, o)}</div>
${nothing ? `<p class="pf-empty">Nothing has been added to this portfolio yet.</p>` : ''}
${body}
${contactForm(o, m)}
</main>
<footer class="pf-foot">
<details class="pf-legend"><summary>How to read the labels</summary><dl>${(Object.keys(LEVELS) as Level[]).map(l => `<div><dt>${badge(l)}</dt><dd>${esc(LEVELS[l].meaning)}</dd></div>`).join('')}</dl></details>
${unlistedNote}
<p class="pf-fine">Shared with BeWatu. <a href="https://www.bewatu.com" rel="noopener">What is BeWatu?</a></p>
</footer>
<script src="/portfolio/portfolio.js" defer></script></body></html>`;
}

export function renderGone(title: string, text: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow,noarchive"><title>${esc(title)} | BeWatu</title><link rel="stylesheet" href="/portfolio/portfolio.css"></head><body class="pf"><header class="pf-top"><span class="pf-brand">BeWatu</span></header><main class="pf-main pf-main--narrow"><h1 class="pf-h1">${esc(title)}</h1><p class="pf-lead">${esc(text)}</p><p class="pf-actions"><a class="pf-btn" href="https://www.bewatu.com" rel="noopener">Go to BeWatu</a></p></main></body></html>`;
}

// ═════════════════════════════════════════════════════════════════════════════
// HTTP
// ═════════════════════════════════════════════════════════════════════════════
const ALLOWED_ORIGINS = ['https://www.bewatu.com', 'https://bewatu.com'];
function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER ?? process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
  return initializeApp({ credential: cert(JSON.parse(sa)) });
}
async function resendMail(m: Mail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ from: 'BeWatu <noreply@bewatu.com>', to: [m.to], subject: m.subject, html: m.html, text: m.text, ...(m.replyTo ? { reply_to: m.replyTo } : {}) }) });
  if (!r.ok) console.error('Resend error:', await r.text());
  return r.ok;
}
const ipOf = (req: VercelRequest) => { const f = req.headers['x-forwarded-for']; return ((Array.isArray(f) ? f[0] : f)?.split(',')[0].trim()) || req.socket?.remoteAddress || 'unknown'; };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requested = String(req.headers.origin ?? '');
  const localDev = process.env.VERCEL_ENV !== 'production' && /^http:\/\/localhost:\d+$/.test(requested);
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS.find(o => o === requested) ?? (localDev ? requested : ALLOWED_ORIGINS[0]));
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const q = (k: string) => { const v = req.query?.[k]; return Array.isArray(v) ? v[0] : v; };

  try {
    const app = getAdminApp();
    const d: Deps = {
      db: getFirestore(app), secret: process.env.PORTFOLIO_SECRET ?? process.env.COMMS_UNSUBSCRIBE_SECRET, now: Date.now(), mail: resendMail,
      ownerEmail: async uid => {
        const c = (await getFirestore(app).collection('users').doc(uid).collection('private').doc('contact').get()).data();
        if (typeof c?.email === 'string' && c.email) return c.email;
        try { return (await getAuth(app).getUser(uid)).email ?? null; } catch { return null; }
      },
      fetchFile: async url => { const r = await fetch(url); if (!r.ok) return null; const body = Buffer.from(await r.arrayBuffer()); return { ok: true, type: r.headers.get('content-type') ?? '', length: body.length, body }; },
    };

    if (req.method === 'GET') {
      const target = { t: q('t'), u: q('u') };
      if (q('resume')) {
        const out = await serveResume(d, target);
        res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
        if (out.file) { res.setHeader('Content-Type', out.file.type); res.setHeader('Content-Disposition', `attachment; filename="${out.file.name}"`); res.setHeader('X-Robots-Tag', 'noindex'); return res.status(200).send(out.file.body); }
        if (out.redirect) return res.redirect(302, out.redirect);
        return res.status(out.status).setHeader('Content-Type', 'text/plain; charset=utf-8').send(out.error ?? 'Not available.');
      }
      const page = await servePage(d, target, req.headers['user-agent'], { print: q('print') === '1' });
      for (const [k, v] of Object.entries(page.headers)) res.setHeader(k, v);
      return res.status(page.status).send(page.html);
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const body = req.body ?? {};
    if (body.action === 'contact') {
      const asForm = !String(req.headers['content-type'] ?? '').includes('json');
      const r = await submitContact(d, body, ipOf(req));
      if (asForm) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Robots-Tag', 'noindex');
        return res.status(r.ok ? 200 : (r.status ?? 400)).send(renderGone(r.ok ? 'Message sent' : 'Message not sent', r.ok ? 'Thank you. Your message is on its way.' : (r.error ?? 'Something went wrong.')));
      }
      return r.ok ? res.status(200).json({ ok: true }) : res.status(r.status ?? 400).json({ error: r.error });
    }

    res.setHeader('Cache-Control', 'no-store');
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = await getAuth(app).verifyIdToken(h.slice(7));
    return res.status(200).json(await runAction(d, decoded.uid, body));
  } catch (e: any) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    if (e?.code === 'auth/argument-error' || e?.code === 'auth/id-token-expired' || e?.code === 'auth/invalid-id-token') return res.status(401).json({ error: 'Please sign in again.' });
    console.error('portfolio error:', e?.code ?? e?.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
