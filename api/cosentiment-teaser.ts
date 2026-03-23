/**
 * api/cosentiment-teaser.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Vercel Edge Function — fetches CoSentiment teaser score for a company domain.
 *
 * Caching strategy:
 *   - Check Firestore `cosentiment_cache/{domain}` first
 *   - If cached and < 24 hours old, return cached data immediately
 *   - Otherwise fetch from CoSentiment API and cache the result
 *   - If CoSentiment returns no data, cache the null result for 1 hour
 *     (to avoid hammering their API for unknown companies)
 *
 * Usage:
 *   GET /api/cosentiment-teaser?domain=apple.com
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const config = { runtime: 'edge' };

const COSENTIMENT_API   = 'https://www.cosentiment.com/api/bewatu';
const CACHE_TTL_MS      = 24 * 60 * 60 * 1000; // 24 hours for successful results
const EMPTY_CACHE_TTL_MS =  1 * 60 * 60 * 1000; // 1 hour for null results

// ── Firestore REST helpers ────────────────────────────────────────────────────
function firestoreBase() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const apiKey    = process.env.FIREBASE_API_KEY;
  if (!projectId || !apiKey) throw new Error('Missing Firebase env vars');
  return { projectId, apiKey };
}

async function getCachedTeaser(domain: string): Promise<{ data: any; cachedAt: number } | null> {
  const { projectId, apiKey } = firestoreBase();
  const docKey = domain.replace(/\./g, '_'); // Firestore keys can't contain dots
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/cosentiment_cache/${docKey}?key=${apiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const doc = await res.json();
    const fields = doc.fields;
    if (!fields) return null;

    const cachedAt = parseInt(fields.cachedAt?.integerValue ?? '0');
    const dataStr  = fields.data?.stringValue ?? 'null';
    return { data: JSON.parse(dataStr), cachedAt };
  } catch {
    return null;
  }
}

async function setCachedTeaser(domain: string, data: any): Promise<void> {
  const { projectId, apiKey } = firestoreBase();
  const docKey = domain.replace(/\./g, '_');
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/cosentiment_cache/${docKey}?key=${apiKey}`;

  const fields: Record<string, any> = {
    domain:   { stringValue: domain },
    data:     { stringValue: JSON.stringify(data) },
    cachedAt: { integerValue: String(Date.now()) },
    hasData:  { booleanValue: data !== null && data?.teaser?.has_data === true },
  };

  await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const url    = new URL(req.url);
  const domain = url.searchParams.get('domain')?.toLowerCase().replace(/^https?:\/\//, '').split('/')[0] ?? '';

  if (!domain) {
    return new Response(JSON.stringify({ error: 'domain is required' }), { status: 400 });
  }

  const apiKey = process.env.COSENTIMENT_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'CoSentiment API key not configured' }), { status: 500 });
  }

  // ── Check cache ─────────────────────────────────────────────────────────────
  try {
    const cached = await getCachedTeaser(domain);
    if (cached) {
      const age    = Date.now() - cached.cachedAt;
      const ttl    = cached.data !== null ? CACHE_TTL_MS : EMPTY_CACHE_TTL_MS;
      if (age < ttl) {
        return new Response(JSON.stringify(cached.data), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Cache': 'HIT',
            'X-Cache-Age': String(Math.round(age / 1000)),
          },
        });
      }
    }
  } catch {
    // Cache read failure — proceed to fetch from API
  }

  // ── Fetch from CoSentiment ──────────────────────────────────────────────────
  try {
    const res = await fetch(`${COSENTIMENT_API}/score/${encodeURIComponent(domain)}`, {
      headers: {
        'Content-Type': 'application/json',
        'x-bewatu-api-key': apiKey,
      },
    });

    const data = res.ok ? await res.json() : null;

    // Cache the result (fire and forget)
    setCachedTeaser(domain, data).catch(() => {});

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Cache': 'MISS',
      },
    });
  } catch (err) {
    console.error('CoSentiment fetch error:', err);
    return new Response(JSON.stringify(null), {
      status: 200, // Return 200 with null — CoSentiment is additive, never blocking
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
