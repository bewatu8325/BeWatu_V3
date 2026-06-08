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
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// ── Firebase Admin init ───────────────────────────────────────────────────────

function getAdminDb() {
  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!)) });
  }
  return getFirestore();
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

async function analyseFrame(frameBase64: string, mediaType: string): Promise<VerificationResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [{
        type: 'image',
        source: { type: 'base64', media_type: mediaType as any, data: frameBase64 },
      }, {
        type: 'text',
        text: 'Assess whether this video frame shows a real person or AI-generated content.',
      }],
    }],
  });

  const text = response.content.find(b => b.type === 'text')?.text ?? '{}';
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

    const db = getAdminDb();

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
      const db = getAdminDb();
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
