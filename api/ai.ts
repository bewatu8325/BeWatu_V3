/**
 * api/ai.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * One internal AI endpoint, one active provider underneath. Replaces
 * api/claude.js and api/gemini.ts (both deleted in the same change).
 *
 * Why: the app had two separate proxies, each with its own auth check, its
 * own rate limiter, and its own request/response shape leaking into the
 * client (4 components called Claude's `{system, prompt, maxTokens}` /
 * `{text}` shape directly; the 5th, AIChat.tsx, called Gemini's native
 * `contents`/`GenerateContentResponse` shape directly). That's twice the
 * surface to secure and monitor for one feature set, and every call site
 * was coupled to its provider's specific request/response format -- moving
 * either feature to the other provider meant rewriting the component, not
 * changing a config value.
 *
 * This collapses both into one endpoint with one normalized contract
 * (`{ prompt, system?, maxTokens?, history? } -> { text }`), with the
 * active provider chosen by the AI_PROVIDER env var (defaults to "claude",
 * since 4 of the 5 real call sites already used it; AIChat.tsx was the one
 * Gemini caller). Switching providers going forward is an env var change,
 * not a rewrite of every caller -- as long as a feature doesn't lean on one
 * provider's unique capability (tool use, multimodal input, etc.), which
 * none of these do today.
 *
 * Fixes a real, previously-unknown bug found while building this:
 * api/gemini.ts used to `res.json(result)` the raw
 * `GenerateContentResponse` straight from the @google/genai SDK. Its `.text`
 * is a class getter (`get text()`), not a plain data property --
 * `JSON.stringify` only serializes an object's own enumerable properties,
 * so a prototype getter is silently dropped on the way out. Confirmed with
 * a one-line reproduction: `JSON.stringify(new (class { get text(){return
 * "x"} })())` -> `"{}"`. AIChat.tsx's `data.text` has been `undefined` on
 * every single response since this endpoint was authenticated. Fixed here
 * by normalizing to `{ text: result.text ?? '' }` on the server, where
 * `.text` is still a real getter and actually returns the string.
 *
 * Required env vars:
 *   AI_PROVIDER          — "claude" (default) or "gemini"
 *   ANTHROPIC_API_KEY    — required if AI_PROVIDER=claude
 *   GEMINI_API_KEY       — required if AI_PROVIDER=gemini
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Firestore } from 'firebase-admin/firestore';

type ChatTurn = { role: 'user' | 'assistant'; text: string };

interface AIRequestBody {
  prompt:    string;
  system?:   string;
  maxTokens?: number;
  history?:  ChatTurn[]; // prior turns, oldest first; omit for a single-shot prompt
}

interface AIResult {
  text: string;
}

const PROVIDER = (process.env.AI_PROVIDER || 'claude').toLowerCase();

// P0 7 (least privilege): only ever calls verifyIdToken — Auth-only
// service account, same pattern as the two endpoints this replaces.
function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT_AUTH_ONLY ?? process.env.FIREBASE_SERVICE_ACCOUNT!
  );
  return initializeApp({ credential: cert(serviceAccount) });
}

// Rate-limit state needs real Firestore access, which the auth-only app
// above deliberately doesn't have — a second, separately-named app using
// the broader key, same least-privilege reasoning as every other
// server-side collection in this review.
function getRateLimitDb() {
  const name = 'rateLimitApp';
  const app = getApps().some(a => a.name === name)
    ? getApp(name)
    : initializeApp(
        { credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_APP_SERVER ?? process.env.FIREBASE_SERVICE_ACCOUNT!)) },
        name
      );
  return getFirestore(app);
}

const RL_MIN_INTERVAL_MS = 3 * 1000;       // 3s between calls per uid
const RL_WINDOW_MS       = 60 * 60 * 1000; // rolling 1-hour window
const RL_MAX_PER_WINDOW  = 40;             // generous for real chat use, caps abuse

async function checkAndBumpRateLimit(db: Firestore, collection: string, uid: string): Promise<string | null> {
  const ref = db.doc(`${collection}/${uid}`);
  const now = Date.now();
  const rl = (await ref.get()).data() as { sendCount?: number; windowStart?: number; lastSentAt?: number } | undefined;
  if (rl?.lastSentAt && now - rl.lastSentAt < RL_MIN_INTERVAL_MS) {
    return 'Too many requests — please slow down.';
  }
  const windowStart = rl?.windowStart && now - rl.windowStart < RL_WINDOW_MS ? rl.windowStart : now;
  const sendCount    = windowStart === rl?.windowStart ? (rl?.sendCount ?? 0) : 0;
  if (sendCount >= RL_MAX_PER_WINDOW) {
    return 'Too many requests this hour — please try again later.';
  }
  await ref.set({ lastSentAt: now, windowStart, sendCount: sendCount + 1, updatedAt: FieldValue.serverTimestamp() });
  return null;
}

// Highest maxTokens any real caller asks for today is 900
// (SkillResume.tsx) — 2500 leaves headroom without an unbounded cap.
const MAX_TOKENS_CEILING = 2500;
function clampedMaxTokens(requested: unknown): number {
  const n = Number(requested);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), MAX_TOKENS_CEILING) : 500;
}

async function callClaude(body: AIRequestBody): Promise<AIResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const messages = [
    ...(body.history ?? []).map(h => ({ role: h.role, content: h.text })),
    { role: 'user', content: body.prompt },
  ];

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: clampedMaxTokens(body.maxTokens),
      system:     body.system ?? 'You are a concise, helpful assistant for BeWatu, a professional network.',
      messages,
    }),
  });

  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  return { text: data.content?.[0]?.text ?? '' };
}

async function callGemini(body: AIRequestBody): Promise<AIResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });

  const contents = [
    ...(body.history ?? []).map(h => ({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.text }],
    })),
    { role: 'user', parts: [{ text: body.prompt }] },
  ];

  const result = await ai.models.generateContent({
    model: 'gemini-3.5-flash-lite',
    contents,
    config: {
      systemInstruction: body.system,
      maxOutputTokens:   clampedMaxTokens(body.maxTokens),
    },
  });

  // result.text is a getter — read it here, on the server, where it's
  // still attached to the real class instance. Never forward `result`
  // itself to res.json(); see the file header for why.
  return { text: result.text ?? '' };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.bewatu.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  let callerUid: string;
  try {
    callerUid = (await getAuth(getAdminApp()).verifyIdToken(authHeader.slice('Bearer '.length))).uid;
  } catch (err: any) {
    console.error('ai proxy auth error:', err?.message ?? err);
    return res.status(401).json({ error: 'Invalid or expired ID token' });
  }

  const rateLimitError = await checkAndBumpRateLimit(getRateLimitDb(), 'ai_rate_limits', callerUid);
  if (rateLimitError) return res.status(429).json({ error: rateLimitError });

  const body = (req.body ?? {}) as AIRequestBody;
  if (!body.prompt || typeof body.prompt !== 'string') {
    return res.status(400).json({ error: 'prompt is required' });
  }

  try {
    const result = PROVIDER === 'gemini' ? await callGemini(body) : await callClaude(body);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error(`AI proxy error (provider=${PROVIDER}):`, err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? 'Internal error' });
  }
}
