import { GoogleGenAI } from '@google/genai';

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
    const ai = new GoogleGenAI({ apiKey });
    const result = await ai.models.generateContent({
  model: 'gemini-2.0-flash',
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
