// api/security/finding.ts
// POST /api/security/finding

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const ALLOWED_ORIGINS = [
  'https://ops.bewatu.com',
  'https://www.bewatu.com',
];

function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined;
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function initAdmin() {
  if (!getApps().length) {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
    initializeApp({ credential: cert(JSON.parse(sa)) });
  }
  return { db: getFirestore(), auth: getAuth() };
}

function generateFindingId(year: number, seq: number): string {
  return `BW-SEC-${year}-${String(seq).padStart(4, '0')}`;
}

async function getNextSequence(db: ReturnType<typeof getFirestore>): Promise<number> {
  const counter = db.collection('security_config').doc('counters');
  return db.runTransaction(async t => {
    const doc = await t.get(counter);
    const current = doc.data()?.findingSeq || 0;
    t.set(counter, { findingSeq: current + 1 }, { merge: true });
    return current + 1;
  });
}

function validateSensor(token: string): boolean {
  const securityToken = process.env.BEWATU_SECURITY_TOKEN;
  return !!securityToken && token === securityToken;
}

function normaliseIncomingFinding(body: any) {
  return {
    sensor:         body.sensor || 'unknown',
    category:       body.category || 'vulnerability',
    severity:       body.severity || 'medium',
    title:          String(body.title || 'Untitled finding').slice(0, 200),
    description:    String(body.description || '').slice(0, 2000),
    affectedAssets: Array.isArray(body.affectedAssets) ? body.affectedAssets : [],
    cveId:          body.cveId || null,
    cweId:          body.cweId || null,
    evidence: {
      filePath:   body.evidence?.filePath   || null,
      lineNumber: body.evidence?.lineNumber || null,
      snippet:    body.evidence?.snippet?.slice(0, 500) || null,
      ruleId:     body.evidence?.ruleId     || null,
      cvssScore:  body.evidence?.cvssScore  || null,
      commitSha:  body.evidence?.commitSha  || null,
      logLine:    body.evidence?.logLine    || null,
    },
    repo: body.repo || 'shared',
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { db, auth } = initAdmin();

    // Auth — accept CI service token or ops agent ID token
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(403).json({ error: 'Unauthorised' });
    const token = authHeader.slice(7);

    let agentUid = 'ci-sensor';
    if (!validateSensor(token)) {
      try {
        const decoded = await auth.verifyIdToken(token);
        const opsDoc  = await db.collection('ops_staff').doc(decoded.uid).get();
        if (!opsDoc.exists) return res.status(403).json({ error: 'Unauthorised' });
        agentUid = decoded.uid;
      } catch {
        return res.status(403).json({ error: 'Unauthorised' });
      }
    }

    const partial = normaliseIncomingFinding(req.body);

    // Deduplicate — same title + sensor that's still open
    const recent = await db.collection('security_findings')
      .where('title',  '==', partial.title)
      .where('sensor', '==', partial.sensor)
      .where('status', 'not-in', ['verified', 'false_positive', 'accepted_risk'])
      .limit(1)
      .get();

    if (!recent.empty) {
      await recent.docs[0].ref.update({ updatedAt: FieldValue.serverTimestamp() });
      return res.status(200).json({ id: recent.docs[0].id, deduplicated: true });
    }

    const seq  = await getNextSequence(db);
    const year = new Date().getFullYear();
    const id   = db.collection('security_findings').doc().id;

    const finding = {
      id,
      findingId:        generateFindingId(year, seq),
      ...partial,
      riskScore:        0,
      exploitability:   0,
      exposure:         0,
      blastRadius:      0,
      dataSensitivity:  0,
      assetCriticality: 0,
      status:           'open',
      detectedAt:       FieldValue.serverTimestamp(),
      updatedAt:        FieldValue.serverTimestamp(),
    };

    await db.collection('security_findings').doc(id).set(finding);

    // Trigger risk scoring async
    fetch(`https://www.bewatu.com/api/security/risk-score`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.BEWATU_SECURITY_TOKEN}`,
      },
      body: JSON.stringify({ findingId: id }),
    }).catch(e => console.error('Risk score trigger error:', e));

    return res.status(201).json({ id, findingId: finding.findingId });

  } catch (err: any) {
    console.error('finding.ts error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
