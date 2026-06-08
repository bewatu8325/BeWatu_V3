/**
 * api/skills-trajectory.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Classifies the user's skills by AI-impact trajectory (growing / stable /
 * declining) using WEF Future of Jobs framing.
 *
 * POST /api/skills-trajectory
 * Body: { skills: string[], industry?: string }
 * Returns: { trajectories: [{ skill, trajectory, rationale }], summary }
 *
 * Fixed:
 *  - Model name corrected to 'claude-sonnet-4-6' (was 'claude-sonnet-4-20250514'
 *    which is not a valid Anthropic model ID and caused FUNCTION_INVOCATION_FAILED)
 *  - Input sanitised server-side: non-string / empty entries are stripped before
 *    building the prompt, so undefined/null values from client don't crash the call
 *  - Returns 400 with a clear message when no valid skills remain after sanitising,
 *    rather than letting an empty prompt reach the Anthropic API
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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[skills-trajectory] ANTHROPIC_API_KEY is not set');
    return res.status(500).json({ error: 'Server configuration error — API key missing' });
  }

  // ── Input sanitisation ────────────────────────────────────────────────────
  // Client may send undefined/null entries if skills are stored as objects
  // and the name extraction produced undefined (e.g. s.name on a plain string).
  // Strip anything that isn't a non-empty string before touching the API.
  const rawSkills: unknown = (req.body ?? {}).skills;
  const industry: string = typeof (req.body ?? {}).industry === 'string'
    ? (req.body.industry as string).slice(0, 100)
    : 'general professional';

  if (!Array.isArray(rawSkills)) {
    return res.status(400).json({ error: 'skills must be an array' });
  }

  const skills: string[] = rawSkills
    .map((s: unknown) => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean);

  if (skills.length === 0) {
    return res.status(400).json({
      error: 'no_skills',
      message: 'No skills to analyse. Please add skills to your profile first.',
    });
  }

  const prompt = `Industry: ${industry}
Skills to classify:
${skills.map(s => `- ${s}`).join('\n')}`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',  // corrected from 'claude-sonnet-4-20250514'
      max_tokens: 1200,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content.find((b: any) => b.type === 'text')?.text ?? '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    // Validate the response has the expected shape before returning
    if (!Array.isArray(parsed.trajectories)) {
      throw new Error('Unexpected response shape from AI');
    }

    return res.status(200).json(parsed);

  } catch (err: any) {
    const message = err?.message ?? String(err);
    console.error('[skills-trajectory] error:', message);
    return res.status(500).json({ error: 'Analysis failed', detail: message });
  }
}
