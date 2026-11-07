/**
 * lib/arenaSponsorshipService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads sponsorships from Firestore and sends changes to api/arena-sponsorship.ts.
 * Browsers never write these records; see firestore.rules.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from './firebase';
import {
  LIMITS, safeImage, toSponsorshipRecord, activeSponsorship,
  type SponsorshipRecord, type SponsorBranding,
} from './arenaSponsorship';

// ── Reads ────────────────────────────────────────────────────────────────────

let approvedCache: { at: number; list: SponsorshipRecord[] } | null = null;
const CACHE_MS = 60_000;

/** Approved sponsorships (any date). Callers decide what is *active* with activeSponsorship(). */
export async function fetchApprovedSponsorships(force = false): Promise<SponsorshipRecord[]> {
  if (!force && approvedCache && Date.now() - approvedCache.at < CACHE_MS) return approvedCache.list;
  const snap = await getDocs(query(collection(db, 'arena_sponsorships'), where('status', '==', 'approved')));
  const list = snap.docs.map(d => toSponsorshipRecord(d.id, d.data()));
  approvedCache = { at: Date.now(), list };
  return list;
}
export const clearSponsorshipCache = () => { approvedCache = null; };

/** Every record for companies this person administers, newest first (pending and past ones included). */
export async function fetchMySponsorships(uid: string): Promise<SponsorshipRecord[]> {
  const snap = await getDocs(query(collection(db, 'arena_sponsorships'), where('companyAdminUid', '==', uid)));
  return snap.docs.map(d => toSponsorshipRecord(d.id, d.data())).sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
}

/** Platform admins only (the rules refuse everyone else). */
export async function fetchAllSponsorships(): Promise<(SponsorshipRecord & { arenaName?: string; history?: { atMs: number; action: string; note?: string }[] })[]> {
  const snap = await getDocs(collection(db, 'arena_sponsorships'));
  return snap.docs.map(d => ({ ...toSponsorshipRecord(d.id, d.data()), arenaName: d.data().arenaName, history: d.data().history ?? [] }))
    .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
}

export async function fetchSponsorshipBanner(id: string): Promise<string | null> {
  try {
    const snap = await getDoc(doc(db, 'arena_sponsorship_assets', id));
    return snap.exists() ? safeImage(snap.data()?.banner, LIMITS.bannerBytes) : null;
  } catch { return null; }
}

/** The company this person administers, if any (first one), for "Become a sponsor". */
export async function fetchCompaniesIAdminister(uid: string): Promise<{ id: string; name: string; logoUrl?: string }[]> {
  const snap = await getDocs(query(collection(db, 'companies'), where('adminUid', '==', uid)));
  return snap.docs.map(d => ({ id: d.id, name: String(d.data().name ?? 'Company'), logoUrl: d.data().logoUrl }));
}

export { activeSponsorship };

// ── Writes (through the server) ──────────────────────────────────────────────

export class SponsorshipError extends Error {}

export async function sponsorshipApi(body: Record<string, unknown>): Promise<any> {
  const user = auth.currentUser;
  if (!user) throw new SponsorshipError('Please sign in again.');
  let res: Response;
  try {
    res = await fetch('/api/arena-sponsorship', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
      body: JSON.stringify(body),
    });
  } catch { throw new SponsorshipError('Could not reach BeWatu. Check your connection and try again.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new SponsorshipError(data?.error ?? 'Something went wrong. Please try again.');
  clearSponsorshipCache();
  return data;
}

export type BrandingInput = Omit<SponsorBranding, 'hasBanner'>;

// ── Images: re-encode in the browser so only plain raster data is ever stored ─

const LOGO_BOX = 256;
const BANNER_W = 1600, BANNER_H = 400;   // 4:1

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new SponsorshipError('That file could not be read as an image.')); };
    img.src = url;
  });
}

/**
 * Turns an uploaded PNG / JPEG / WebP into a small, clean data URL.
 * Logos are scaled to fit a 256px box (transparency kept); banners are cropped to 4:1.
 * Quality and size step down until the result fits the cap the server enforces.
 */
export async function prepareSponsorImage(file: File, kind: 'logo' | 'banner'): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new SponsorshipError('Use a PNG, JPEG or WebP image.');
  if (file.size > 8 * 1024 * 1024) throw new SponsorshipError('That image is too large. Use one under 8 MB.');
  const img = await loadImage(file);
  const cap = kind === 'logo' ? LIMITS.logoBytes : LIMITS.bannerBytes;

  const sizes = kind === 'logo' ? [1, 0.75, 0.5] : [1, 0.75, 0.5, 0.35];
  for (const scale of sizes) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new SponsorshipError('Your browser cannot process images here.');
    if (kind === 'logo') {
      const r = Math.min(1, (LOGO_BOX * scale) / Math.max(img.width, img.height));
      canvas.width = Math.max(1, Math.round(img.width * r)); canvas.height = Math.max(1, Math.round(img.height * r));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    } else {
      canvas.width = Math.round(BANNER_W * scale); canvas.height = Math.round(BANNER_H * scale);
      const target = canvas.width / canvas.height, source = img.width / img.height;
      let sw = img.width, sh = img.height, sx = 0, sy = 0;
      if (source > target) { sw = img.height * target; sx = (img.width - sw) / 2; } else { sh = img.width / target; sy = (img.height - sh) / 2; }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    }
    for (const q of [0.9, 0.8, 0.7, 0.55]) {
      let out = canvas.toDataURL('image/webp', q);
      if (!out.startsWith('data:image/webp')) out = kind === 'logo' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', q);
      if (safeImage(out, cap)) return out;
    }
  }
  throw new SponsorshipError('That image is too detailed to shrink enough. Try a simpler or smaller one.');
}
