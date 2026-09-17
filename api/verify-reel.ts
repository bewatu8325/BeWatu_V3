/**
 * api/verify-reel.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Vercel serverless endpoint. Called immediately after a video is uploaded.
 * Receives a base64 JPEG frame extracted from the video in the browser,
 * runs it through Claude Vision to assess AI-generation signals, and writes
 * the verdict to the reelVibes/{reelId} Firestore document.
 *
 * POST /api/verify-reel
 * Body: { reelId, authorUid, frameBase64, frameMediaType, context }
 *
 * context.type = 'microIntro' | 'reel'  — determines which Firestore doc to update
 * context.docPath = Firestore path to update (for microIntro: 'users/{uid}')
 *
 * Returns: { verdict, confidence, status }
 *
 * Auth (launch-readiness review, P1 rate-limiting/auth sweep): this endpoint
 * had no authentication at all — the same unauthenticated-paid-API-proxy
 * class already fixed for api/claude.js, api/gemini.ts, and
 * api/skills-trajectory.ts, but missed in that pass. Worse than a pure
 * budget-exhaustion risk here, though: with no ownership check, any caller
 * could pass an arbitrary reelId + authorUid and overwrite a *stranger's*
 * verification verdict — mark someone else's real video ai_generated, or
 * launder their own flagged upload by feeding a different frame under a
 * reelId they don't own. lib/videoUtils.ts's submitForVerification() is the
 * only real caller (App.tsx:762) and always sends authorUid: fbUser.uid —
 * an authenticated caller's own uid — confirming that's the intended shape,
 * not something this endpoint ever validated. Now requires a Firebase ID
 * token (Node runtime already, via firebase-admin/auth — no Edge/jose
 * workaround needed here), rejects if it doesn't match the claimed
 * authorUid, and rejects if the target reelVibes/{reelId} doc's own stored
 * authorUid doesn't match either — the second check is the one that
 * actually stops the cross-user overwrite, since the write is keyed on
 * reelId, not on the caller's own uid.
 *
 * Rate limit: auth alone stops impersonation, not a legitimate signed-in
 * user calling this in a loop to burn Claude Vision's budget — each call
 * runs a real vision inference. Capped per-uid, same inline Firestore-doc
 * sliding-window shape as api/contact.ts / api/send-recruiter-otp.ts.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const MIN_INTERVAL_MS      = 10 * 1000;      // 10s between submissions per uid
const WINDOW_MS            = 60 * 60 * 1000; // rolling 1-hour window
const MAX_PER_WINDOW       = 20;             // generous for real uploads, caps abuse

// ── Firebase Admin init ───────────────────────────────────────────────────────

function getAdmin() {
  if (!getApps().length) {
    // P0 7 (least privilege): only ever writes reelVibes/{reelId} and
    // users/{uid}, plus verifyIdToken (read-only against Auth) — no
    // Auth-admin writes, no Cloud Functions calls.
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER ?? process.env.FIREBASE_SERVICE_ACCOUNT!;
    initializeApp({ credential: cert(JSON.parse(sa)) });
  }
  return { db: getFirestore(), auth: getAuth() };
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Verdict  = 'real' | 'ai_generated' | 'uncertain';
type Confidence = 'high' | 'medium' | 'low';
type VerifStatus = 'pending' | 'real' | 'ai_generated' | 'uncertain' | 'appealed' | 'overturned';

interface VerificationResult {
  verdict:    Verdict;
  confidence: Confidence;
  reasoning:  string;   // stored server-side; shown to ops, never directly to user
  signals:    string[]; // short human-readable signal list for ops review
}

// ── Claude Vision analysis ────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a video authenticity analyst. You will be shown a single frame
extracted from a professional introduction video uploaded to a professional networking platform.

Your task is to assess whether the video appears to be:
1. A real human recording (authentic)
2. AI-generated or synthetic (deepfake, AI avatar, AI face generation)
3. Uncertain — you cannot determine with confidence

Look for these signals of AI generation:
- Unnatural skin texture (too smooth, waxy, plastic appearance)
- Odd eye behaviour (fixed gaze, unnatural blinking, too-perfect eyes)
- Hair anomalies (too uniform, lack of individual strands, merging with background)
- Lighting inconsistencies (light source doesn't match face shading)
- Facial boundary artefacts (soft or blurred edge where face meets hair/background)
- Temporal smoothness artefacts (even in a still frame, motion blur patterns may be too perfect)
- Background unnaturally clean or perfectly blurred in a way typical of AI compositing
- Microexpressions or facial muscle behaviour that doesn't follow natural patterns
- Unusual ear or neck rendering

Respond ONLY as JSON — no preamble, no markdown fences:
{
  "verdict": "real" | "ai_generated" | "uncertain",
  "confidence": "high" | "medium" | "low",
  "reasoning": "One concise paragraph explaining your assessment for a human reviewer",
  "signals": ["signal 1", "signal 2"]
}

If the image is too blurry, too dark, or does not contain a face, return:
{ "verdict": "uncertain", "confidence": "low", "reasoning": "Cannot assess — frame quality insufficient or no face visible", "signals": [] }`;

// Real bug fix: this called the @anthropic-ai/sdk client, but that package
// isn't in project dependencies — Vercel crashes the whole function at
// module load (FUNCTION_INVOCATION_FAILED) before the handler even runs, so
// every reel/micro-intro upload's AI verification has been failing at the
// infrastructure level, never even reaching this function's own graceful
// "uncertain, queue for manual review" fallback. Same root cause api/
// skills-trajectory.ts already hit and fixed the same way (see its own
// header comment) — call the Anthropic REST API directly via fetch(), no
// SDK, matching api/claude.js's established pattern. The request body is
// identical either way (the SDK is a thin wrapper over this same endpoint),
// so the vision content blocks are unchanged.
async function analyseFrame(frameBase64: string, mediaType: string): Promise<VerificationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [{
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: frameBase64 },
        }, {
          type: 'text',
          text: 'Assess whether this video frame shows a real person or AI-generated content.',
        }],
      }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errText}`);
  }

  const data: any = await response.json();
  const text: string = data?.content?.find((b: any) => b.type === 'text')?.text ?? '{}';
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean) as VerificationResult;
}

// ── Determine display status from verdict + confidence ────────────────────────

function toStatus(verdict: Verdict, confidence: Confidence): VerifStatus {
  if (verdict === 'ai_generated' && (confidence === 'high' || confidence === 'medium')) {
    return 'ai_generated'; // badge shown
  }
  if (verdict === 'real' && confidence === 'high') {
    return 'real'; // no badge
  }
  // ai_generated low confidence, uncertain any, real medium/low → ops manual review
  return 'uncertain';
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { reelId, authorUid, frameBase64, frameMediaType = 'image/jpeg', context } = req.body ?? {};

  if (!reelId || !authorUid || !frameBase64) {
    return res.status(400).json({ error: 'reelId, authorUid, and frameBase64 are required' });
  }

  const { db, auth } = getAdmin();

  // Verify the caller is a real, signed-in Firebase user, and that they're
  // the same person the request claims to be — not just anyone with a
  // valid account submitting on someone else's behalf.
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: missing bearer token' });
  }
  let callerUid: string;
  try {
    callerUid = (await auth.verifyIdToken(authHeader.slice(7))).uid;
  } catch {
    return res.status(401).json({ error: 'Unauthorized: invalid token' });
  }
  if (callerUid !== authorUid) {
    return res.status(403).json({ error: 'authorUid does not match the authenticated caller' });
  }

  // The check above only proves authorUid is honest about who's calling —
  // it says nothing about whether reelId actually belongs to them. The
  // write below is keyed on reelId, so this is the check that actually
  // stops a caller from overwriting a stranger's verification verdict.
  const reelSnap = await db.doc(`reelVibes/${reelId}`).get();
  if (!reelSnap.exists || reelSnap.data()?.authorUid !== callerUid) {
    return res.status(403).json({ error: 'reelId does not belong to the authenticated caller' });
  }

  const rateLimitRef = db.doc(`verify_reel_rate_limits/${callerUid}`);
  const now = Date.now();
  const rl = (await rateLimitRef.get()).data() as
    | { sendCount?: number; windowStart?: number; lastSentAt?: number }
    | undefined;

  if (rl?.lastSentAt && now - rl.lastSentAt < MIN_INTERVAL_MS) {
    return res.status(429).json({ error: 'Too many requests — please wait a moment.' });
  }
  const windowStart = rl?.windowStart && now - rl.windowStart < WINDOW_MS ? rl.windowStart : now;
  const sendCount    = windowStart === rl?.windowStart ? (rl?.sendCount ?? 0) : 0;
  if (sendCount >= MAX_PER_WINDOW) {
    return res.status(429).json({ error: 'Too many verification requests this hour — please try again later.' });
  }
  await rateLimitRef.set({
    lastSentAt: now, windowStart, sendCount: sendCount + 1,
    updatedAt: FieldValue.serverTimestamp(),
  });

  try {
    const result = await analyseFrame(frameBase64, frameMediaType);
    const status  = toStatus(result.verdict, result.confidence);

    const verificationDoc = {
      status,
      verdict:    result.verdict,
      confidence: result.confidence,
      reasoning:  result.reasoning,  // ops only
      signals:    result.signals,    // ops only
      checkedAt:  FieldValue.serverTimestamp(),
      appeal:     null,
    };

    // Update the reelVibes document
    await db.doc(`reelVibes/${reelId}`).update({
      aiVerification: verificationDoc,
    });

    // If this is also a microIntro (Vibe Clip on profile), update the user doc too
    if (context?.type === 'microIntro') {
      await db.doc(`users/${authorUid}`).update({
        microIntroVerification: verificationDoc,
      });
    }

    // Write to ops queue for manual review if uncertain or low-confidence ai_generated
    if (status === 'uncertain' || (result.verdict === 'ai_generated' && result.confidence === 'low')) {
      await db.collection('reel_verification_queue').add({
        reelId,
        authorUid,
        verdict:    result.verdict,
        confidence: result.confidence,
        reasoning:  result.reasoning,
        signals:    result.signals,
        status:     'pending_review',
        createdAt:  FieldValue.serverTimestamp(),
        type:       context?.type ?? 'reel',
      });
    }

    return res.status(200).json({ verdict: result.verdict, confidence: result.confidence, status });

  } catch (err: any) {
    console.error('[verify-reel]', err);
    // On any error, mark as uncertain + queue for manual review rather than blocking the upload
    try {
      await db.doc(`reelVibes/${reelId}`).update({
        aiVerification: {
          status:    'uncertain',
          verdict:   'uncertain',
          confidence: 'low',
          reasoning: 'Automated analysis failed — queued for manual review',
          signals:   [],
          checkedAt: FieldValue.serverTimestamp(),
          appeal:    null,
        },
      });
    } catch { /* best effort */ }
    return res.status(200).json({ verdict: 'uncertain', confidence: 'low', status: 'uncertain' });
  }
}
