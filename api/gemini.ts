import { GoogleGenAI } from '@google/genai';

// Whitelist of approved models — update here when Google deprecates models
const APPROVED_MODELS = [
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-pro',
];

const DEFAULT_MODEL = 'gemini-2.0-flash-lite';

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response('API key not configured', { status: 500 });
  }

  try {
    const body = await req.json();

    // Always use server-controlled model — ignore anything the client sends
    const model = DEFAULT_MODEL;

    const ai = new GoogleGenAI({ apiKey });
    const result = await ai.models.generateContent({
      model,
      contents: body.contents ?? [{ parts: [{ text: body.prompt }] }],
    });

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

export const config = { runtime: 'edge' };
