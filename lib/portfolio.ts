/**
 * lib/portfolio.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Browser side of "Share My Work" (api/portfolio.ts does the real work and re-checks every choice). Kept free of the UI so it can be
 * tested: what a first choice looks like, moving things up and down, what must be filled in before the next step, how a link is
 * described, and the email that goes with it.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export type SectionKey = 'summary' | 'skills' | 'projects' | 'arena' | 'reels' | 'achievements';
export const SECTION_KEYS: SectionKey[] = ['summary', 'skills', 'projects', 'arena', 'reels', 'achievements'];
export const SECTION_LABEL: Record<SectionKey, string> = {
  summary: 'Professional summary', skills: 'Skills and expertise', projects: 'Selected projects', arena: 'Public Arena contributions', reels: 'Prove reels', achievements: 'Confirmed achievements',
};
export const SECTION_HINT: Record<SectionKey, string> = {
  summary: 'A short introduction in your own words',
  skills: 'Each shows whether it is self-reported, confirmed by colleagues or reviewed',
  projects: 'Work you have submitted to your profile, with the link as evidence',
  arena: 'Challenges you took part in. Shared pages show the field and the reviewer\'s outcome, never the challenge name',
  reels: 'Your Prove videos, with captions',
  achievements: 'Outcomes a named person has confirmed',
};
export type ContactMode = 'none' | 'email' | 'form';
export type Expiry = '7d' | '30d' | '90d' | 'never';
export type Level = 'self' | 'submitted' | 'confirmed' | 'reviewed' | 'verified';

export interface ShareConfig {
  label: string; kind: 'unlisted' | 'public'; sections: SectionKey[];
  selection: { skills: string[]; projects: string[]; arena: string[]; reels: string[]; achievements: string[] };
  intro: string; resume: boolean; contact: { mode: ContactMode; email?: string };
  updatePolicy: 'live' | 'snapshot'; expiry: Expiry;
}
export type ItemSection = Exclude<SectionKey, 'summary'>;

export interface Sources {
  profile: { name: string; headline: string; bio: string; username: string | null; isPublic: boolean };
  email: string | null;
  skills: { name: string; level: Level; endorsers: number; note: string | null }[];
  projects: { id: string; title: string; summary: string }[];
  arena: { id: string; title: string; outcome: 'submitted' | 'shortlisted' | 'winner'; level: Level }[];
  reels: { id: string; caption: string; poster: string | null; duration: number | null }[];
  achievements: { id: string; text: string; verifier: string }[];
  resume: boolean; levels: Record<Level, { label: string; meaning: string }>;
}

export interface ShareView {
  id: string; kind: 'unlisted' | 'public'; label: string; status: 'ok' | 'revoked' | 'expired'; url: string | null;
  createdAt: number; updatedAt: number; expiresAt: number | null; updatePolicy: 'live' | 'snapshot'; snapshotAt: number | null;
  views: { human: number; preview: number; bot: number }; lastViewedAt: number | null; contactCount: number; config: ShareConfig;
}

/** A first choice that already makes sense: what they have, in the usual order, nothing risky switched on. */
export function defaultConfig(src: Sources): ShareConfig {
  const sections: SectionKey[] = ['summary'];
  const selection = { skills: [] as string[], projects: [] as string[], arena: [] as string[], reels: [] as string[], achievements: [] as string[] };
  if (src.skills.length) { sections.push('skills'); selection.skills = src.skills.slice(0, 8).map(s => s.name); }
  if (src.projects.length) { sections.push('projects'); selection.projects = src.projects.slice(0, 4).map(p => p.id); }
  if (src.arena.length) { sections.push('arena'); selection.arena = src.arena.slice(0, 3).map(a => a.id); }
  if (src.reels.length) { sections.push('reels'); selection.reels = src.reels.slice(0, 3).map(r => r.id); }
  if (src.achievements.length) { sections.push('achievements'); selection.achievements = src.achievements.slice(0, 3).map(a => a.id); }
  return { label: '', kind: 'unlisted', sections, selection, intro: (src.profile.bio || '').slice(0, 600), resume: false, contact: { mode: 'none' }, updatePolicy: 'live', expiry: '30d' };
}

/** Moves one entry of a list by one place (or not at all, at an end). Never mutates. */
export function move<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return [...list];
  const out = [...list]; [out[index], out[to]] = [out[to], out[index]]; return out;
}
/** Turns a section on (at the end) or off, keeping the order of the rest. */
export function toggleSection(sections: readonly SectionKey[], key: SectionKey, on: boolean): SectionKey[] {
  const rest = sections.filter(s => s !== key);
  return on ? [...rest, key] : rest;
}
/** Moves one section up or down among the others. The summary always stays at the top, as the introduction. */
export function moveSection(sections: readonly SectionKey[], key: SectionKey, delta: -1 | 1): SectionKey[] {
  const hasSummary = sections.includes('summary');
  const rest: SectionKey[] = sections.filter(s => s !== 'summary');
  const moved = move(rest, rest.indexOf(key), delta);
  return hasSummary ? ['summary', ...moved] : moved;
}
/** Adds or removes one picked item; the order of the rest is kept. */
export function togglePick(ids: readonly string[], id: string, on: boolean, max = 12): string[] {
  const rest = ids.filter(x => x !== id);
  if (!on) return rest;
  // At the limit nothing is added (and nothing else is dropped behind the member's back); the picker says why.
  return !ids.includes(id) && ids.length >= max ? [...ids] : [...rest, id];
}

/** What is missing before the member can go on. A message in plain words, or null. */
export function problem(cfg: ShareConfig, src: Sources | null): string | null {
  const picked = (['skills', 'projects', 'arena', 'reels', 'achievements'] as ItemSection[]).filter(k => cfg.sections.includes(k) && cfg.selection[k].length > 0);
  const hasIntro = cfg.sections.includes('summary') && cfg.intro.trim().length > 0;
  if (picked.length === 0 && !hasIntro) return 'Choose something to share, or write a short summary.';
  if (cfg.contact.mode === 'email' && !/^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/.test((cfg.contact.email ?? '').trim())) return 'Add the email address you want people to see.';
  if (cfg.resume && src && !src.resume) return 'Upload a résumé on your profile first, or switch it off.';
  if (cfg.kind === 'public' && src && !src.profile.username) return 'Choose your BeWatu profile address first; your public page lives on it.';
  if (cfg.kind === 'public' && src && !src.profile.isPublic) return 'Your profile isn\'t public. Make it public first, or share an unlisted link.';
  return null;
}

export const EXPIRIES: { id: Expiry; label: string }[] = [
  { id: '7d', label: '7 days' }, { id: '30d', label: '30 days' }, { id: '90d', label: '90 days' }, { id: 'never', label: 'No expiry' },
];

/** A link, described in a few words: "Open · expires 12 Dec", "Switched off", "Expired 3 Nov". */
export function describeShare(s: Pick<ShareView, 'status' | 'kind' | 'expiresAt'>, fmt: (ms: number) => string = ms => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })): string {
  if (s.status === 'revoked') return 'Switched off';
  if (s.status === 'expired') return s.expiresAt ? `Expired ${fmt(s.expiresAt)}` : 'Expired';
  return s.kind === 'public' ? 'Public' : s.expiresAt ? `Open · expires ${fmt(s.expiresAt)}` : 'Open · no expiry';
}

/** How many people looked, without pretending a link-preview robot is a person. */
export function describeViews(v: ShareView['views']): string {
  const p = v.human === 1 ? '1 visit' : `${v.human} visits`;
  const other = v.preview + v.bot;
  return other > 0 ? `${p} · ${other} from link previews and crawlers` : p;
}

/** The email that carries the link: honest about what the link is. */
export function mailtoFor(o: { url: string; name: string; label?: string; kind: 'unlisted' | 'public' }): string {
  const subject = `${o.name}: selected work`;
  const body = `Hello,\n\nHere is a selection of my work${o.label ? ` (${o.label})` : ''}:\n${o.url}\n\n${o.kind === 'unlisted' ? 'The link is unlisted, so please don\'t forward it beyond the people who need to see it. ' : ''}You don't need an account to open it.\n\nThank you,\n${o.name}`;
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
export const printUrl = (url: string) => url + (url.includes('?') ? '&' : '?') + 'print=1';

// ── talking to the server ────────────────────────────────────────────────────
export async function portfolio<T = any>(body: Record<string, unknown>): Promise<T> {
  const { auth } = await import('./firebase');
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in again.');
  let res: Response;
  try {
    res = await fetch('/api/portfolio', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` }, body: JSON.stringify(body) });
  } catch { throw new Error('Could not reach BeWatu. Check your connection and try again.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e: any = new Error(data?.error ?? 'Something went wrong. Please try again.'); e.status = res.status; throw e; }
  return data;
}
