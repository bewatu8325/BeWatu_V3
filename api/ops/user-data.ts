/**
 * api/ops/user-data.ts
 * POST /api/ops/user-data
 * ─────────────────────────────────────────────────────────────────────────────
 * The only sanctioned way for the ops console (bewatu-ops) to look at member
 * data. Replaces the console's old approach of streaming up to 500 full user
 * documents into the browser and offering CSV downloads of them.
 *
 * Why a server route: email, phone and location live in the owner-only
 * users/{uid}/private/contact record (firestore.rules). Staff don't get a
 * direct read on it, so every look at someone's contact details has to come
 * through here, where it is role-checked, rate-limited, requires a stated
 * reason, and is written to the audit log BEFORE any data is returned.
 *
 * Actions (body: { action, ... }):
 *
 *   search  { query?, cursor?, limit? }
 *     Masked member rows only (name, flags, plan, engagement state, and a
 *     masked email like a***@example.com). Never contact details.
 *     query: an email (exact), a uid, or a name prefix. No query = newest
 *     members first, paged by `cursor`.
 *
 *   reveal  { uid, reason }
 *     One member's email / phone / location. reason: 10-500 chars.
 *     Audited as user.pii_reveal; 30 per staffer per hour.
 *
 *   compliance_export  { uid, caseRef, reason }
 *     For legal demands. Builds one member's data bundle, encrypts it to the
 *     compliance team's PUBLIC key (hybrid RSA-OAEP + AES-256-GCM) and emails
 *     the ciphertext to the compliance mailbox. The plaintext is never
 *     returned to the requesting staffer, never stored, and only compliance,
 *     holding the private key, can open it. Audited; 10 per staffer per day.
 *     Needs env COMPLIANCE_PUBLIC_KEY (RSA >= 3072-bit PEM) and
 *     COMPLIANCE_EMAIL. Decrypt with scripts/decrypt-compliance-bundle.mjs.
 *
 * Auth: a real Firebase ID token for an active ops_staff member, same
 * pattern as api/ops/send-data-ready-email.ts, plus a per-action role check.
 *
 * Required env vars: FIREBASE_SERVICE_ACCOUNT_APP_SERVER (or
 * FIREBASE_SERVICE_ACCOUNT); RESEND_API_KEY for compliance_export.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { QueryDocumentSnapshot, DocumentSnapshot, QuerySnapshot } from 'firebase-admin/firestore';

// ── Policy ───────────────────────────────────────────────────────────────────
// Role names match bewatu-ops' ROLES / PERMISSIONS.users. Auditors can see the
// masked list but not reveal; compliance export is limited to the legal and
// admin tiers.
const SEARCH_ROLES = [
  'platform_admin', 'support_manager', 'trust_manager', 'legal_manager',
  'support_agent', 'trust_agent', 'legal_agent', 'auditor',
];
const REVEAL_ROLES     = SEARCH_ROLES.filter(r => r !== 'auditor');
const COMPLIANCE_ROLES = ['platform_admin', 'legal_manager'];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS  = 24 * HOUR_MS;
const REVEAL_MAX_PER_HOUR     = 30;
const COMPLIANCE_MAX_PER_DAY  = 10;
const SEARCH_PAGE_DEFAULT     = 25;
const SEARCH_PAGE_MAX         = 50;
const MIN_REASON = 10;
const MAX_REASON = 500;
const MAX_CASE_REF = 120;
const MAX_BUNDLE_BYTES = 10 * 1024 * 1024;
const SECTION_LIMIT = 200;
const MIN_RSA_BITS = 3072;
const GCM_TAG_BYTES = 16;

const PROD_ORIGINS = ['https://ops.bewatu.com', 'https://www.bewatu.com'];
const DEV_ORIGINS  = ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:3001', 'http://localhost:4173'];

// ── Helpers ──────────────────────────────────────────────────────────────────
function setCors(req: VercelRequest, res: VercelResponse) {
  const allowedOrigins = process.env.VERCEL_ENV === 'production' ? PROD_ORIGINS : [...PROD_ORIGINS, ...DEV_ORIGINS];
  const requested = req.headers.origin as string | undefined;
  // Echo a literal from the allowlist (never the request's own header value).
  const allowed = allowedOrigins.find(o => o === requested) ?? PROD_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER ?? process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
  return initializeApp({ credential: cert(JSON.parse(sa)) });
}

// Firebase Auth user LOOKUPS (email -> account, account -> sign-in email) need an Auth-read
// permission that the Firestore-only app-server service account deliberately does not have
// (the repo's "P0 7 least privilege" design). So they go through the Auth-scoped account when
// one is provisioned, else the shared key, exactly as api/factory-token.ts does for Auth work.
// verifyIdToken needs no IAM permission, so it stays on the main client.
function getLookupAuth() {
  const name = 'auth-lookup';
  let app = getApps().find(a => a.name === name);
  if (!app) {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT_AUTH_ONLY
      ?? process.env.FIREBASE_SERVICE_ACCOUNT
      ?? process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER;
    if (!sa) throw new Error('No Firebase service account configured');
    app = initializeApp({ credential: cert(JSON.parse(sa)) }, name);
  }
  return getAuth(app);
}

/** True when an Admin SDK error means "this credential is not allowed to do that". */
export function isPermissionError(err: any): boolean {
  const text = `${err?.code ?? ''} ${err?.message ?? ''} ${err?.errorInfo?.code ?? ''}`;
  return /insufficient-permission|permission[_ -]?denied|not authori[sz]ed|forbidden|\b403\b|caller does not have permission/i.test(text);
}

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

interface Staff { uid: string; email: string; role: string }

async function verifyStaff(req: VercelRequest, auth: ReturnType<typeof getAuth>, db: ReturnType<typeof getFirestore>): Promise<Staff | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  try {
    const decoded = await auth.verifyIdToken(header.slice(7));
    const snap = await db.collection('ops_staff').doc(decoded.uid).get();
    const d = snap.data();
    if (!snap.exists || d?.isActive !== true || typeof d?.role !== 'string') return null;
    return { uid: decoded.uid, email: decoded.email ?? d.email ?? '', role: d.role };
  } catch {
    return null;
  }
}

function clientIp(req: VercelRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first || 'unknown';
}

export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf('@');
  if (at < 1) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

function iso(v: any): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  return null;
}

// Firestore Timestamps -> ISO strings, recursively, so the export is plain JSON.
function normalize(value: any): any {
  if (value === null || value === undefined) return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === 'object') {
    if (typeof value.path === 'string' && typeof value.firestore === 'object') return `ref:${value.path}`;
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v)]));
  }
  return value;
}

// Rolling-window limiter, transactional so concurrent calls can't slip past.
async function takeToken(db: ReturnType<typeof getFirestore>, key: string, windowMs: number, max: number, message: string) {
  const ref = db.collection('ops_reveal_rate_limits').doc(key);
  const now = Date.now();
  await db.runTransaction(async tx => {
    const cur = (await tx.get(ref)).data() as { windowStart?: number; count?: number } | undefined;
    const inWindow = !!cur?.windowStart && now - cur.windowStart < windowMs;
    const windowStart = inWindow ? cur!.windowStart! : now;
    const count = inWindow ? (cur?.count ?? 0) : 0;
    if (count >= max) throw new HttpError(429, message);
    tx.set(ref, { windowStart, count: count + 1, updatedAt: FieldValue.serverTimestamp() });
  });
}

function requireString(v: unknown, name: string, min: number, max: number): string {
  if (typeof v !== 'string') throw new HttpError(400, `${name} is required`);
  const s = v.trim();
  if (s.length < min) throw new HttpError(400, `${name} must be at least ${min} characters`);
  if (s.length > max) throw new HttpError(400, `${name} must be at most ${max} characters`);
  return s;
}

function requireUid(v: unknown): string {
  if (typeof v !== 'string' || !v || v.length > 128 || v.includes('/')) throw new HttpError(400, 'A valid uid is required');
  return v;
}

async function audit(db: ReturnType<typeof getFirestore>, staff: Staff, ip: string, entry: {
  action: string; targetId: string; targetType: string; after?: any; reason: string;
}) {
  await db.collection('audit_log').add({
    action: entry.action,
    actorUid: staff.uid, actorEmail: staff.email, actorRole: staff.role,
    targetId: entry.targetId, targetType: entry.targetType,
    before: null, after: entry.after ?? null,
    reason: entry.reason, ip,
    requiresApproval: false, approved: false,
    ts: FieldValue.serverTimestamp(),
  });
}

// ── Engagement state (mirrors lib/engagementGate.ts) ─────────────────────────
const WEEK_MS = 7 * DAY_MS;
function engagementState(d: Record<string, any>): 'unlocked' | 'gated' | 'exempt' {
  if (d.engagementGateApplies !== true) return 'exempt';
  const created = d.createdAt?.toDate?.()?.getTime?.();
  const ageOk = Number.isFinite(created) && Date.now() - created >= WEEK_MS;
  const last = d.lastActiveAt ? new Date(d.lastActiveAt).getTime() : NaN;
  const activeOk = Number.isFinite(last) && Date.now() - last < WEEK_MS;
  return ageOk && activeOk ? 'unlocked' : 'gated';
}

// ── search ───────────────────────────────────────────────────────────────────
export async function doSearch(db: ReturnType<typeof getFirestore>, auth: Pick<ReturnType<typeof getAuth>, 'getUserByEmail'>, body: any) {
  const limit = Math.min(Math.max(parseInt(body.limit, 10) || SEARCH_PAGE_DEFAULT, 1), SEARCH_PAGE_MAX);
  const q = typeof body.query === 'string' ? body.query.trim().slice(0, 200) : '';
  let docs: QueryDocumentSnapshot[] | DocumentSnapshot[] = [];
  let nextCursor: string | null = null;

  if (q.includes('@')) {
    try {
      const u = await auth.getUserByEmail(q.toLowerCase());
      const snap = await db.collection('users').doc(u.uid).get();
      if (snap.exists) docs = [snap];
    } catch (err: any) {
      if (isPermissionError(err)) {
        throw new HttpError(503, 'Searching by email is unavailable: the server is not permitted to look up sign-in accounts. Search by name or user ID instead, and ask an engineer to grant the server Firebase Authentication read access.');
      }
      if (err?.code !== 'auth/user-not-found') throw err; // not found = empty result; anything else is a real fault
    }
  } else if (q && /^[A-Za-z0-9]{20,40}$/.test(q) && (await db.collection('users').doc(q).get()).exists) {
    docs = [await db.collection('users').doc(q).get()];
  } else if (q) {
    // Name prefix. Firestore ranges are case-sensitive, so try as typed and Capitalised.
    const variants = Array.from(new Set([q, q[0].toUpperCase() + q.slice(1)]));
    const seen = new Map<string, QueryDocumentSnapshot>();
    for (const v of variants) {
      const snap = await db.collection('users')
        .where('displayName', '>=', v).where('displayName', '<=', v + '').limit(limit).get();
      snap.docs.forEach(d => seen.set(d.id, d));
    }
    docs = Array.from(seen.values()).slice(0, limit);
  } else {
    let query = db.collection('users').orderBy('createdAt', 'desc').limit(limit);
    if (typeof body.cursor === 'string' && body.cursor && !body.cursor.includes('/')) {
      const cur = await db.collection('users').doc(body.cursor).get();
      if (cur.exists) query = query.startAfter(cur);
    }
    const snap = await query.get();
    docs = snap.docs;
    nextCursor = snap.docs.length === limit ? snap.docs[snap.docs.length - 1].id : null;
  }

  // Emails come from the owner-only contact record (Firestore, same account as the rest of this route),
  // falling back to a legacy copy on the profile, and are masked before they leave. Deliberately not
  // Firebase Auth: the list must keep working on a Firestore-only service account.
  const emails = new Map<string, string>();
  if (docs.length) {
    const contactSnaps = await db.getAll(...docs.map(d => db.collection('users').doc(d.id).collection('private').doc('contact')));
    docs.forEach((d, i) => {
      const e = contactSnaps[i].data()?.email ?? d.data()?.email;
      if (typeof e === 'string' && e) emails.set(d.id, e);
    });
  }

  const rows = docs.map(snap => {
    const d = snap.data() ?? {};
    return {
      id: snap.id,
      name: d.displayName ?? '',
      emailMasked: maskEmail(emails.get(snap.id)),
      accountStatus: d.accountStatus ?? 'active',
      recoveryState: d.recoveryState ?? 'ACTIVE',
      isVerified: d.isVerified === true,
      isRecruiter: d.isRecruiter === true,
      recruiterStatus: d.recruiterStatus ?? null,
      foundingMember: d.foundingMember === true,
      subscriptionTier: d.subscriptionTier ?? 'free',
      engagement: engagementState(d),
      createdAt: iso(d.createdAt),
      lastActiveAt: iso(d.lastActiveAt),
      onWatchlist: !!d.watchlistReason,
      watchlistCategory: d.watchlistCategory ?? null,
      credits: d.credits ?? null,
      reputation: d.reputation ?? null,
      industry: d.industry ?? null,
      availability: d.availability ?? null,
    };
  });
  return { rows, nextCursor };
}

// ── reveal ───────────────────────────────────────────────────────────────────
async function doReveal(db: ReturnType<typeof getFirestore>, auth: ReturnType<typeof getAuth>, staff: Staff, ip: string, body: any) {
  const uid = requireUid(body.uid);
  const reason = requireString(body.reason, 'reason', MIN_REASON, MAX_REASON);

  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists) throw new HttpError(404, 'User not found');

  await takeToken(db, `reveal_${staff.uid}`, HOUR_MS, REVEAL_MAX_PER_HOUR,
    'Reveal limit reached for this hour. Please try again later.');

  const contactSnap = await db.collection('users').doc(uid).collection('private').doc('contact').get();
  const contact = contactSnap.data() ?? {};
  const main = userSnap.data() ?? {};
  let authEmail: string | null = null;
  try { authEmail = (await auth.getUser(uid)).email ?? null; } catch { /* auth record gone */ }

  const location = contact.location
    || [main.city, main.state, main.country].filter(Boolean).join(', ')
    || null;
  const result = {
    email: authEmail ?? contact.email ?? main.email ?? null,
    phone: contact.phone ?? main.phone ?? null,
    location,
  };

  // Fail closed: if the audit entry can't be written, nothing is returned.
  await audit(db, staff, ip, {
    action: 'user.pii_reveal', targetId: uid, targetType: 'user',
    after: { fields: ['email', 'phone', 'location'] }, reason,
  });
  return { contact: result, hideAfterSeconds: 60 };
}

// ── compliance export ────────────────────────────────────────────────────────
export interface BundleEnvelope {
  format: 'bewatu-compliance-bundle';
  version: 1;
  alg: { wrap: 'RSA-OAEP-SHA256'; data: 'AES-256-GCM' };
  aad: string;          // base64 of the exact bytes authenticated alongside the data
  wrappedKey: string;   // AES key, encrypted to the compliance public key
  iv: string;
  tag: string;
  ciphertext: string;
}

/** Hybrid-encrypt `plaintext` so only the holder of the matching private key can read it. */
export function encryptBundle(plaintext: Buffer, publicKeyPem: string, header: Record<string, string>): BundleEnvelope {
  const pub = crypto.createPublicKey(publicKeyPem);
  const bits = (pub.asymmetricKeyDetails as any)?.modulusLength as number | undefined;
  if (pub.asymmetricKeyType !== 'rsa' || !bits || bits < MIN_RSA_BITS) {
    throw new HttpError(503, `Compliance public key must be RSA of at least ${MIN_RSA_BITS} bits`);
  }
  const dataKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const aad = Buffer.from(JSON.stringify(header));
  const cipher = crypto.createCipheriv('aes-256-gcm', dataKey, iv, { authTagLength: GCM_TAG_BYTES });
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const wrappedKey = crypto.publicEncrypt(
    { key: pub, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, dataKey);
  dataKey.fill(0);
  return {
    format: 'bewatu-compliance-bundle', version: 1,
    alg: { wrap: 'RSA-OAEP-SHA256', data: 'AES-256-GCM' },
    aad: aad.toString('base64'),
    wrappedKey: wrappedKey.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

async function gatherBundle(db: ReturnType<typeof getFirestore>, auth: ReturnType<typeof getAuth>, uid: string) {
  const section = async <T,>(fn: () => Promise<T>) => {
    try { return await fn(); } catch (e: any) { return { error: `could not be read: ${e?.code ?? 'error'}` }; }
  };
  const docs = (snap: QuerySnapshot) => snap.docs.map(d => ({ id: d.id, ...normalize(d.data()) }));
  const userRef = db.collection('users').doc(uid);

  return {
    profile: await section(async () => normalize((await userRef.get()).data() ?? null)),
    contact: await section(async () => normalize((await userRef.collection('private').doc('contact').get()).data() ?? null)),
    authRecord: await section(async () => {
      const u = await auth.getUser(uid);
      return {
        uid: u.uid, email: u.email ?? null, emailVerified: u.emailVerified, phoneNumber: u.phoneNumber ?? null,
        providers: u.providerData.map(p => p.providerId), disabled: u.disabled,
        createdAt: u.metadata.creationTime, lastSignInAt: u.metadata.lastSignInTime,
      };
    }),
    securityEvents: await section(async () => docs(await userRef.collection('securityEvents').orderBy('timestamp', 'desc').limit(SECTION_LIMIT).get())),
    supportTickets: await section(async () => docs(await db.collection('support_tickets').where('userId', '==', uid).limit(SECTION_LIMIT).get())),
    reportsFiledByUser: await section(async () => docs(await db.collection('content_reports').where('reportedBy', '==', uid).limit(SECTION_LIMIT).get())),
    feedbackSent: await section(async () => docs(await db.collection('platform_feedback').where('uid', '==', uid).limit(SECTION_LIMIT).get())),
    staffActionsOnAccount: await section(async () => docs(await db.collection('audit_log').where('targetId', '==', uid).limit(SECTION_LIMIT).get())),
    adminActionsOnAccount: await section(async () => docs(await db.collection('adminAuditLog').where('targetId', '==', uid).limit(SECTION_LIMIT).get())),
  };
}

async function doComplianceExport(db: ReturnType<typeof getFirestore>, auth: ReturnType<typeof getAuth>, staff: Staff, ip: string, body: any) {
  const uid = requireUid(body.uid);
  const caseRef = requireString(body.caseRef, 'caseRef', 3, MAX_CASE_REF);
  const reason = requireString(body.reason, 'reason', MIN_REASON, MAX_REASON);

  const publicKey = (process.env.COMPLIANCE_PUBLIC_KEY ?? '').replace(/\\n/g, '\n').trim();
  const toEmail = (process.env.COMPLIANCE_EMAIL ?? '').trim();
  const resendKey = process.env.RESEND_API_KEY;
  if (!publicKey || !toEmail || !resendKey) {
    throw new HttpError(503, 'Compliance export is not configured on this environment.');
  }

  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists) throw new HttpError(404, 'User not found');

  await takeToken(db, `compliance_${staff.uid}`, DAY_MS, COMPLIANCE_MAX_PER_DAY,
    'Compliance export limit reached for today.');

  const bundleId = `BW-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
  const createdAt = new Date().toISOString();
  const bundle = {
    bundleId, caseRef, createdAt, subjectUid: uid,
    requestedBy: { uid: staff.uid, email: staff.email, role: staff.role },
    data: await gatherBundle(db, auth, uid),
  };
  const plaintext = Buffer.from(JSON.stringify(bundle, null, 2));
  if (plaintext.length > MAX_BUNDLE_BYTES) throw new HttpError(413, 'Bundle is too large to send; split the request.');

  // Fail closed: the audit entry and the export record exist before anything is sent.
  await audit(db, staff, ip, {
    action: 'user.compliance_export', targetId: uid, targetType: 'user',
    after: { bundleId, caseRef }, reason,
  });
  const recordRef = db.collection('compliance_exports').doc(bundleId);
  await recordRef.set({
    bundleId, caseRef, subjectUid: uid, reason,
    requestedByUid: staff.uid, requestedByEmail: staff.email, requestedByRole: staff.role,
    status: 'pending', createdAt: FieldValue.serverTimestamp(),
  });

  const envelope = encryptBundle(plaintext, publicKey, { bundleId, caseRef, createdAt });
  const envelopeJson = JSON.stringify(envelope);
  const sha256 = crypto.createHash('sha256').update(envelopeJson).digest('hex');

  const mail = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
    body: JSON.stringify({
      from: 'BeWatu <noreply@bewatu.com>',
      to: [toEmail],
      subject: `[Compliance] Encrypted data bundle ${bundleId} (${caseRef})`,
      text: [
        `An encrypted data bundle was prepared for case "${caseRef}".`,
        '',
        `Bundle ID: ${bundleId}`,
        `Requested by: ${staff.email} (${staff.role})`,
        `SHA-256 of the attachment: ${sha256}`,
        '',
        'The attachment is encrypted to the compliance public key and contains no readable personal data.',
        'Decrypt it with scripts/decrypt-compliance-bundle.mjs and the compliance private key.',
      ].join('\n'),
      attachments: [{ filename: `${bundleId}.bwenc.json`, content: Buffer.from(envelopeJson).toString('base64') }],
    }),
  });
  if (!mail.ok) {
    console.error('compliance_export: Resend error:', mail.status, await mail.text());
    await recordRef.update({ status: 'failed', updatedAt: FieldValue.serverTimestamp() });
    throw new HttpError(502, 'The encrypted bundle could not be delivered. Nothing was sent.');
  }
  await recordRef.update({ status: 'delivered', sha256, bytes: envelopeJson.length, deliveredTo: toEmail, updatedAt: FieldValue.serverTimestamp() });

  return { bundleId, sha256, bytes: envelopeJson.length, deliveredTo: maskEmail(toEmail) };
}

// ── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const adminApp = getAdminApp();
    const auth = getAuth(adminApp);
    const lookup = getLookupAuth();
    const db = getFirestore(adminApp);

    const staff = await verifyStaff(req, auth, db);
    if (!staff) return res.status(401).json({ error: 'Unauthorized' });

    const body = req.body ?? {};
    const ip = clientIp(req);

    switch (body.action) {
      case 'search':
        if (!SEARCH_ROLES.includes(staff.role)) throw new HttpError(403, 'Your role cannot look up members');
        return res.status(200).json(await doSearch(db, lookup, body));
      case 'reveal':
        if (!REVEAL_ROLES.includes(staff.role)) throw new HttpError(403, 'Your role cannot reveal contact details');
        return res.status(200).json(await doReveal(db, lookup, staff, ip, body));
      case 'compliance_export':
        if (!COMPLIANCE_ROLES.includes(staff.role)) throw new HttpError(403, 'Your role cannot run compliance exports');
        return res.status(200).json(await doComplianceExport(db, lookup, staff, ip, body));
      default:
        throw new HttpError(400, 'Unknown action');
    }
  } catch (err: any) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error('ops/user-data error:', err);
    // Only staff reach this point, and an error CODE (never a message or data) is what makes a fault diagnosable.
    const code = err?.code !== undefined && String(err.code).length <= 80 ? ` (ref: ${String(err.code)})` : '';
    return res.status(500).json({ error: `Something went wrong. Please try again.${code}` });
  }
}
