// api/security/scan-complete.ts
// POST /api/security/scan-complete      (Authorization: Bearer BEWATU_SECURITY_TOKEN)
// ─────────────────────────────────────────────────────────────────────────────
// A scanner finished a scan of MAIN and says what it still sees. Every open finding from that scanner and repository that is no
// longer reported has been fixed: it is closed as verified, and its waiting approval is withdrawn (so nobody is nudged about it).
//
// Scanners only ever post what they find, never what has gone away, so without this a fixed finding stayed open forever and its
// approval kept being nudged daily. This closes that loop, carefully:
//   - only for MAIN (a pull request's branch is not the truth), only for scanners that report their full result set, and only
//     when the scanner says the list is complete (a truncated list closes nothing);
//   - a finding being worked on right now (executing) is left alone;
//   - SAFETY BRAKE: a scan that would close 10 or more findings and more than half of what is open is refused and an operator is
//     alerted. A scanner that crashed and reported "nothing" must never wipe the board.
//
// Body: { sensor: 'code-analysis' | 'dependency-risk', repo: 'bewatu_v3' | 'bewatu_ops' | 'bewatu_factory', ref: 'refs/heads/main',
//         present: [{ title, filePath }], truncated?: boolean }
// Self-contained on purpose: api/ routes cannot import each other.
// ─────────────────────────────────────────────────────────────────────────────
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { timingSafeEqual } from 'node:crypto';

// ── how an alert leaves the building ─────────────────────────────────────────
// One copy per route that raises alerts (api/ routes cannot import each other); test/monitor-depth fails if a copy differs
// from the one in api/cron/healthcheck.ts. Change it there, then paste the block into each file that has the markers.
// <alert-sender>
/** Email (Resend) and, if ALERT_WEBHOOK_URL is set, a second channel (slack | discord | ntfy). True if ANY channel delivered. */
export async function sendAlert(env: Record<string, string | undefined>, subject: string, text: string): Promise<boolean> {
  let delivered = false;
  if (env.RESEND_API_KEY) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.RESEND_API_KEY}` },
        body: JSON.stringify({ from: 'BeWatu Alerts <noreply@bewatu.com>', to: [env.SECURITY_ALERT_EMAIL || env.UPTIME_ALERT_EMAIL || 'support@bewatu.com'], subject, text }),
      });
      if (r.ok) delivered = true; else console.error('alert email refused by Resend:', r.status, await r.text());
    } catch (e: any) { console.error('alert email failed:', e?.message); }
  } else console.error('alert email not sent: RESEND_API_KEY is not set');
  const hook = env.ALERT_WEBHOOK_URL;
  if (hook && /^https:\/\//i.test(hook)) {
    try {
      const fmt = (env.ALERT_WEBHOOK_FORMAT || 'slack').toLowerCase();
      const init: RequestInit = fmt === 'ntfy'
        ? { method: 'POST', headers: { Title: subject.replace(/[^\x20-\x7E]/g, '').trim().slice(0, 120) || 'BeWatu alert', Priority: 'high' }, body: text.slice(0, 3500) }
        : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fmt === 'discord' ? { content: `**${subject}**\n${text}`.slice(0, 1900) } : { text: `*${subject}*\n${text}`.slice(0, 3500) }) };
      const r = await fetch(hook, { ...init, signal: AbortSignal.timeout(8000) });
      if (r.ok) delivered = true; else console.error('alert webhook refused:', r.status);
    } catch (e: any) { console.error('alert webhook failed:', e?.message); }
  }
  return delivered;
}
// </alert-sender>

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export const RECONCILABLE_SENSORS = ['code-analysis', 'dependency-risk'];
export const REPOS = ['bewatu_v3', 'bewatu_ops', 'bewatu_factory'];
const CLOSED = ['verified', 'false_positive', 'accepted_risk'];
export const BRAKE = { minCount: 10, maxShare: 0.5 };
export const MAX_PRESENT = 2000;
const key = (title: unknown, filePath: unknown) => `${String(title ?? '')}\u0000${String(filePath ?? '')}`;

export interface Deps { db: Firestore; now: number; alert(subject: string, body: string): Promise<boolean> }

export async function reconcile(d: Deps, body: any): Promise<{ open: number; closed: number; kept: number; skippedExecuting: number }> {
  const sensor = String(body?.sensor ?? ''), repo = String(body?.repo ?? '');
  if (!RECONCILABLE_SENSORS.includes(sensor)) throw new HttpError(400, 'This sensor does not report complete result sets');
  if (!REPOS.includes(repo)) throw new HttpError(400, 'Unknown repository');
  if (body?.ref !== 'refs/heads/main') throw new HttpError(400, 'Only a scan of main can close findings');
  if (body?.truncated === true) throw new HttpError(409, 'The scan result list was truncated; nothing was closed');
  if (!Array.isArray(body?.present) || body.present.length > MAX_PRESENT) throw new HttpError(400, 'present must be a list (at most 2000)');
  const present = new Set(body.present.map((p: any) => key(p?.title, p?.filePath ?? null)));

  const snap = await d.db.collection('security_findings').where('sensor', '==', sensor).where('repo', '==', repo).limit(1000).get();
  const open = snap.docs.filter(s => !CLOSED.includes(s.data().status));
  const executing = open.filter(s => s.data().status === 'executing');
  const gone = open.filter(s => s.data().status !== 'executing' && !present.has(key(s.data().title, s.data().evidence?.filePath ?? null)));

  // What the Security Center shows as this scanner's freshness for this repository (and what an admin confirms after a brake).
  const stateRef = d.db.collection('_ops_internal').doc('scan_state'), stateKey = `${sensor}:${repo}`;
  if (gone.length >= BRAKE.minCount && gone.length > open.length * BRAKE.maxShare) {
    await stateRef.set({ [stateKey]: { lastCompleteAt: d.now, present: body.present.length, refused: { gone: gone.length, open: open.length, at: d.now },
      pendingClose: { ids: gone.map(s => s.id), open: open.length, at: d.now } } }, { merge: true });
    await d.alert(`⚠️ Security scan wanted to close ${gone.length} of ${open.length} open findings: refused`,
      `A ${sensor} scan of ${repo} (main) reported that ${gone.length} of ${open.length} open findings are gone. That is more than the safety brake allows in one go, so nothing was closed.\n\nIf you really did fix them all, confirm it in the ops console (Security, Remediation: "Confirm closure"); that re-checks each one. If not, the scanner may have failed and reported nothing: check the latest "Security scan" run of ${repo}.`);
    throw new HttpError(409, `Refused: ${gone.length} of ${open.length} open findings would be closed at once (safety brake)`);
  }

  for (const f of gone) {
    const x = f.data();
    await f.ref.update({ status: 'verified', resolvedAt: FieldValue.serverTimestamp(), verifiedBy: 'scan', resolution: 'no longer reported by the scanner on main' });
    const waiting = await d.db.collection('approval_requests').where('findingId', '==', f.id).where('status', '==', 'pending').get();
    for (const a of waiting.docs) await a.ref.update({ status: 'superseded', supersededAt: FieldValue.serverTimestamp(), supersededReason: 'the finding is no longer reported' });
    if (x.remediationPlanId) await d.db.collection('remediation_plans').doc(String(x.remediationPlanId)).update({ status: 'superseded' }).catch(() => {});
    await d.db.collection('audit_log').add({ action: 'security_finding_resolved_by_scan', findingId: f.id, sensor, repo, title: x.title ?? null, timestamp: FieldValue.serverTimestamp() });
  }
  await stateRef.set({ [stateKey]: { lastCompleteAt: d.now, present: body.present.length, closed: gone.length, refused: FieldValue.delete(), pendingClose: FieldValue.delete() } }, { merge: true });
  return { open: open.length, closed: gone.length, kept: open.length - gone.length - executing.length, skippedExecuting: executing.length };
}

function safeEqual(a: string, b: string | undefined): boolean {
  if (!a || !b) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function openDb(): Firestore {
  if (!getApps().length) {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER ?? process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
    initializeApp({ credential: cert(JSON.parse(sa)) });
  }
  return getFirestore();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ') || !safeEqual(h.slice(7), process.env.BEWATU_SECURITY_TOKEN)) return res.status(403).json({ error: 'Unauthorised' });
  try {
    const out = await reconcile({ db: openDb(), now: Date.now(), alert: (s, t) => sendAlert(process.env, s, t) }, req.body ?? {});
    return res.status(200).json(out);
  } catch (e: any) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    console.error('scan-complete error:', e?.message);
    return res.status(500).json({ error: 'Internal error' });
  }
}
