/**
 * api/diag-gemini-model.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TEMPORARY diagnostic route to confirm the new default Gemini model
 * (gemini-3.5-flash-lite, replacing the shut-down gemini-2.0-flash-lite)
 * is actually accepted by Google's API in real production. Read-only,
 * makes one minimal-cost real call, never returns the API key.
 * REMOVE once confirmed.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(200).json({ ok: false, error: 'GEMINI_API_KEY not set' });

  try {
    const ai = new GoogleGenAI({ apiKey });
    const result = await ai.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents: [{ parts: [{ text: 'Reply with exactly one word: OK' }] }],
    });
    return res.status(200).json({ ok: true, text: result.text });
  } catch (err: any) {
    return res.status(200).json({ ok: false, error: err.message });
  }
}
