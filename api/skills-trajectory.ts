/**
 * api/skills-trajectory.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * FEATURE 2 — "Declining-vs-growing skills insight"
 *
 * Calls the existing /api/claude proxy (same pattern as handleGenerateSkillsGraph
 * in App.tsx) rather than importing @anthropic-ai/sdk directly. This avoids the
 * env-var / runtime dependency issue that caused the 500 error.
 *
 * POST /api/skills-trajectory
 * Body: { skills: string[], industry?: string }
 * Returns: { trajectories: [{ skill, trajectory, rationale }], summary }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

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

  const prompt = `Industry: ${industry || 'general professional'}
Skills to classify:
${skills.map((s: string) => `- ${s}`).join('\n')}`;

  try {
    // Use the platform's existing Claude proxy — same pattern as App.tsx handleGenerateSkillsGraph
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    const claudeRes = await fetch(`${baseUrl}/api/claude`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: SYSTEM,
        prompt,
        maxTokens: 1200,
      }),
    });

    if (!claudeRes.ok) {
      throw new Error(`/api/claude returned ${claudeRes.status}`);
    }

    const { text } = await claudeRes.json();
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return res.status(200).json(parsed);

  } catch (err: any) {
    console.error('[skills-trajectory]', err);
    return res.status(500).json({ error: 'Analysis failed', detail: err.message });
  }
}
