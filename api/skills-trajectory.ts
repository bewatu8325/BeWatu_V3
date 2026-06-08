/**
 * api/skills-trajectory.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * FEATURE 2 — "Declining-vs-growing skills insight"
 *
 * Calls the Anthropic API directly (same pattern as verify-reel.ts which works).
 * Previous version tried to chain through /api/claude which fails server-side
 * because Vercel functions cannot reliably call sibling functions via HTTP.
 *
 * Requires: ANTHROPIC_API_KEY env var (already set for verify-reel.ts).
 *
 * POST /api/skills-trajectory
 * Body: { skills: string[], industry?: string }
 * Returns: { trajectories: [{ skill, trajectory, rationale }], summary }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { skills, industry } = req.body ?? {};
  if (!Array.isArray(skills) || skills.length === 0) {
    return res.status(400).json({ error: 'skills array required' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[skills-trajectory] ANTHROPIC_API_KEY is not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const prompt = `Industry: ${industry || 'general professional'}
Skills to classify:
${(skills as string[]).map(s => `- ${s}`).join('\n')}`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content.find((b: any) => b.type === 'text')?.text ?? '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return res.status(200).json(parsed);

  } catch (err: any) {
    console.error('[skills-trajectory] error:', err?.message ?? err);
    return res.status(500).json({ error: 'Analysis failed', detail: err?.message });
  }
}
