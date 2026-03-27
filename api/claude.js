/**
 * api/claude.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Vercel serverless function — Claude API proxy.
 * Place this file at the root of your BeWatu_V3 repo as api/claude.js
 * Vercel will expose it at https://www.bewatu.com/api/claude
 *
 * Add to Vercel dashboard → Settings → Environment Variables:
 *   ANTHROPIC_API_KEY = sk-ant-...
 * ─────────────────────────────────────────────────────────────────────────────
 */

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://www.bewatu.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

  const { system, prompt, maxTokens = 500 } = req.body ?? {};
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: maxTokens,
        system:     system ?? 'You are a concise career intelligence assistant for BeWatu.',
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    return res.json({ text: data.content?.[0]?.text ?? '' });

  } catch (err) {
    console.error('Claude proxy error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
