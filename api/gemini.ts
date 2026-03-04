import { GoogleGenerativeAI } from '@google/genai';

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
    const ai = new GoogleGenerativeAI(apiKey);
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(body.prompt ?? body.contents);
    const text = result.response.text();
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

export const config = { runtime: 'edge' };
