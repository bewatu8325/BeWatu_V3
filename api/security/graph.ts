// api/security/graph.ts
// GET /api/security/graph

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

function initAdmin() {
  if (!getApps().length) {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
    initializeApp({ credential: cert(JSON.parse(sa)) });
  }
  return { db: getFirestore(), auth: getAuth() };
}

async function verifyOpsAgent(req: VercelRequest, db: ReturnType<typeof getFirestore>, auth: ReturnType<typeof getAuth>): Promise<boolean> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  if (token === process.env.BEWATU_SECURITY_TOKEN) return true;
  try {
    const decoded = await auth.verifyIdToken(token);
    const opsDoc  = await db.collection('ops_staff').doc(decoded.uid).get();
    return opsDoc.exists;
  } catch { return false; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { db, auth } = initAdmin();
    const isAuthorised = await verifyOpsAgent(req, db, auth);
    if (!isAuthorised) return res.status(403).json({ error: 'Ops access required' });

    const { asset, type } = req.query;

    if (asset && typeof asset === 'string') {
      const assetDoc = await db.collection('asset_graph').doc(asset).get();
      if (!assetDoc.exists) return res.status(404).json({ error: 'Asset not found' });
      const [outEdges, inEdges, findings] = await Promise.all([
        db.collection('asset_edges').where('fromId', '==', asset).get(),
        db.collection('asset_edges').where('toId',   '==', asset).get(),
        db.collection('security_findings')
          .where('affectedAssets', 'array-contains', asset)
          .where('status', 'not-in', ['verified', 'false_positive', 'accepted_risk'])
          .get(),
      ]);
      return res.status(200).json({
        asset:    { id: assetDoc.id, ...assetDoc.data() },
        outEdges: outEdges.docs.map(d => d.data()),
        inEdges:  inEdges.docs.map(d => d.data()),
        activeFindings: findings.docs.map(d => ({
          id: d.id, findingId: d.data().findingId,
          severity: d.data().severity, riskScore: d.data().riskScore,
          title: d.data().title, status: d.data().status,
        })),
      });
    }

    if (type && typeof type === 'string') {
      const assets = await db.collection('asset_graph').where('type', '==', type).get();
      return res.status(200).json({ assets: assets.docs.map(d => ({ id: d.id, ...d.data() })) });
    }

    const [assetsSnap, edgesSnap] = await Promise.all([
      db.collection('asset_graph').get(),
      db.collection('asset_edges').get(),
    ]);
    return res.status(200).json({
      assets: assetsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      edges:  edgesSnap.docs.map(d => d.data()),
    });

  } catch (err: any) {
    console.error('graph.ts error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
