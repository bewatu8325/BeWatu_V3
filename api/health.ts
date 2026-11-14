/**
 * api/health.ts
 * GET /api/health
 * ────────────────────────────────────────────────────────────
 * A public heartbeat for an OUTSIDE watcher (a scheduled GitHub Actions job in bewatu-security).
 *
 * The uptime monitor lives inside the same Vercel project it watches, so if Vercel Cron stops firing, or the project is down, it
 * cannot say so. This endpoint reports whether the monitor has run recently and what it last found. A watcher on different
 * infrastructure fetches it and goes red if the answer is "stale", "failing" or "no answer": watching the watcher.
 *
 *   200  the monitor ran within the last 15 minutes and everything it checks is passing
 *   503  stale (monitor stopped), failing checks, alert channel broken, or state unreadable
 *
 * Reveals only: whether it is healthy, how old the last run is, and the NAMES of failing checks (public routes). No secrets,
 * no member data. Self-contained on purpose: api/ routes cannot import each other.
 * ────────────────────────────────────────────────────────────
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const HEARTBEAT_MAX_AGE_MS = 15 * 60 * 1000;

export interface Health { ok: boolean; reason: string; ageSec: number | null; failing: string[]; alertChannelOk: boolean | null }

/** What the stored monitor state says, as of `now`. Pure, so it can be tested. */
export function evaluate(state: Record<string, any> | undefined, now: number): Health {
  const last = typeof state?.lastRunAt === 'number' ? state.lastRunAt : null;
  const ageSec = last === null ? null : Math.max(0, Math.round((now - last) / 1000));
  const failing = Object.entries(state ?? {}).filter(([, v]) => v && typeof v === 'object' && typeof (v as any).failingSince === 'number').map(([k]) => k).sort();
  const alertChannelOk = typeof state?.alertChannelOk === 'boolean' ? state.alertChannelOk : null;
  if (last === null) return { ok: false, reason: 'the monitor has never reported', ageSec, failing, alertChannelOk };
  if (now - last > HEARTBEAT_MAX_AGE_MS) return { ok: false, reason: `the monitor has not run for ${Math.round((now - last) / 60000)} minutes`, ageSec, failing, alertChannelOk };
  if (failing.length) return { ok: false, reason: `${failing.length} check(s) failing`, ageSec, failing, alertChannelOk };
  if (alertChannelOk === false) return { ok: false, reason: 'alert emails are not being delivered', ageSec, failing, alertChannelOk };
  return { ok: true, reason: 'ok', ageSec, failing, alertChannelOk };
}

function openDb() {
  if (!getApps().length) {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER ?? process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!sa) throw new Error('no service account');
    initializeApp({ credential: cert(JSON.parse(sa)) });
  }
  return getFirestore();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const state = (await openDb().collection('_ops_internal').doc('uptime_state').get()).data();
    const h = evaluate(state, Date.now());
    return res.status(h.ok ? 200 : 503).json(h);
  } catch (e: any) {
    console.error('health: cannot read monitor state:', e?.message);
    return res.status(503).json({ ok: false, reason: 'the monitor state could not be read', ageSec: null, failing: [], alertChannelOk: null });
  }
}
