/**
 * api/skills-trajectory.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * FEATURE 2 — "Declining-vs-growing skills insight"
 *
 * Backend proxy (avoids exposing the API key client-side — the platform's
 * established pattern). Takes a user's skills, returns a trajectory
 * classification for each: growing | stable | declining, with a one-line
 * rationale grounded in WEF Future of Jobs framing.
 *
 * POST /api/skills-trajectory
 * Body: { skills: string[], industry?: string }
 * Returns: { trajectories: [{ skill, trajectory, rationale }], summary }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

const SYSTEM = `You are a labor-market analyst using the framing from the World Economic Forum
Future of Jobs report and 2025-2026 AI labor research.

You classify professional skills by their demand trajectory through 2030:
- "growing": demand rising; AI augments rather than replaces; pairs technical fluency with
  durable human capability (judgment, creativity, complex problem-solving, AI orchestration,
  relationship-building, adaptability).
- "stable": durable, holding value; not rapidly rising or declining.
- "declining": being absorbed by AI first — routine reading/writing/math, manual precision,
  pure attention-to-detail, repetitive data tasks, basic first-draft production.

For each skill provided, return its trajectory and a concise, specific one-line rationale
(max 15 words) that helps the person understand WHY — and, for declining skills, implicitly
points toward the human layer to lean into.

Respond ONLY as JSON, no markdown fences:
{
  "trajectories": [
    { "skill": "<exact skill name>", "trajectory": "growing|stable|declining", "rationale": "<= 15 words" }
  ],
  "summary": "<one encouraging, honest sentence about their overall skill mix and what to lean into>"
}`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { skills, industry } = req.body ?? {};
  if (!Array.isArray(skills) || skills.length === 0) {
    return res.status(400).json({ error: 'skills array required' });
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: `Industry: ${industry || 'general professional'}\nSkills to classify:\n${skills.map((s: string) => `- ${s}`).join('\n')}`,
      }],
    });

    const text = response.content.find((b: any) => b.type === 'text')?.text ?? '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return res.status(200).json(parsed);
  } catch (err: any) {
    console.error('[skills-trajectory]', err);
    return res.status(500).json({ error: 'Analysis failed' });
  }
}
