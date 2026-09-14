/**
 * api/skills-trajectory.ts
 *
 * Root cause of FUNCTION_INVOCATION_FAILED:
 *   import Anthropic from '@anthropic-ai/sdk'  ← package not in project dependencies.
 *   Vercel crashes the function at module load before the handler runs.
 *
 * Fix: call the Anthropic REST API directly via fetch() — no SDK needed,
 * no package dependency, same pattern as every other working AI call in this project.
 *
 * POST /api/skills-trajectory
 * Body: { skills: string[], industry?: string }
 * Returns: { trajectories: [{ skill, trajectory, rationale }], summary }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

// P1 (cost-abuse / input validation): this endpoint proxies to a paid
// Anthropic model and had no authentication at all — anyone on the
// internet could call it indefinitely and spend BeWatu's Anthropic
// budget. Now requires a valid Firebase ID token, same pattern as
// factory-token.ts / api/claude.js.
//
// P0 7 (least privilege): only ever calls verifyIdToken — Auth-only
// service account, falling back to the shared key until the scoped
// one is provisioned.
function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT_AUTH_ONLY ?? process.env.FIREBASE_SERVICE_ACCOUNT!
  );
  return initializeApp({ credential: cert(serviceAccount) });
}

// Real callers send at most ~30 skills (a profile's full skill list);
// 100 leaves headroom while capping worst-case prompt/token cost.
const MAX_SKILLS = 100;

const SYSTEM = `You are a labor-market analyst using the World Economic Forum Future of Jobs
report and 2025-2026 AI labor research.

Classify each professional skill by demand trajectory through 2030:
- "growing": demand rising; AI augments rather than replaces; pairs technical fluency with
  durable human capability (judgment, creativity, complex problem-solving, AI orchestration,
  relationship-building, adaptability).
- "stable": durable, holding value; not rapidly rising or declining.
- "declining": being absorbed by AI — routine reading/writing/math, manual precision,
  pure attention-to-detail, repetitive data tasks, basic first-draft production.

For each skill return a trajectory and a concise one-line rationale (max 15 words) that helps
the person understand WHY. For declining skills, implicitly point toward the human layer.

Return ONLY valid JSON — no markdown fences, no preamble:
{
  "trajectories": [
    { "skill": "<exact skill name>", "trajectory": "growing|stable|declining", "rationale": "<= 15 words" }
  ],
  "summary": "<one honest, encouraging sentence about their overall skill mix and what to lean into>"
}`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  try {
    await getAuth(getAdminApp()).verifyIdToken(authHeader.slice('Bearer '.length));
  } catch (err: any) {
    console.error('[skills-trajectory] auth error:', err?.message ?? err);
    return res.status(401).json({ error: 'Invalid or expired ID token' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[skills-trajectory] ANTHROPIC_API_KEY not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Sanitise input — skills can be strings or {name, endorsements} objects
  // depending on how they were stored; strip anything that isn't a real string.
  const rawSkills: unknown = (req.body ?? {}).skills;
  const industry: string =
    typeof (req.body ?? {}).industry === 'string'
      ? (req.body.industry as string).slice(0, 100)
      : 'general professional';

  if (!Array.isArray(rawSkills)) {
    return res.status(400).json({ error: 'skills must be an array' });
  }

  const skills: string[] = rawSkills
    .map((s: unknown) => (typeof s === 'string' ? s.trim().slice(0, 200) : ''))
    .filter(Boolean)
    .slice(0, MAX_SKILLS);

  if (skills.length === 0) {
    return res.status(400).json({
      error: 'no_skills',
      message: 'No skills to analyse. Please add skills to your profile first.',
    });
  }

  const prompt = `Industry: ${industry}\nSkills to classify:\n${skills.map(s => `- ${s}`).join('\n')}`;

  try {
    const response = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 1200,
        system:     SYSTEM,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[skills-trajectory] Anthropic API error:', response.status, errText);
      return res.status(502).json({ error: 'AI service error', detail: errText });
    }

    const data: any = await response.json();
    const text: string = data?.content?.[0]?.text ?? '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    if (!Array.isArray(parsed.trajectories)) {
      throw new Error('Unexpected response shape from AI');
    }

    return res.status(200).json(parsed);

  } catch (err: any) {
    console.error('[skills-trajectory] error:', err?.message ?? err);
    return res.status(500).json({ error: 'Analysis failed', detail: err?.message });
  }
}
