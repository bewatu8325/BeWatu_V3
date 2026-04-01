// api/security/graph.ts
// GET /api/security/graph?asset=<assetId>
// GET /api/security/graph?type=<assetType>
// GET /api/security/graph (returns full graph)
// Auth: Bearer ops agent ID token

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(
    JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!)
  )});
}

const db = admin.firestore();

async function verifyOpsAgent(req: VercelRequest): Promise<boolean> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return false;
  const token = auth.slice(7);

  // Accept service token
  if (token === process.env.BEWATU_SECURITY_TOKEN) return true;

  // Accept ops agent ID token
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const opsDoc  = await db.collection('ops_staff').doc(decoded.uid).get();
    return opsDoc.exists;
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const isAuthorised = await verifyOpsAgent(req);
  if (!isAuthorised) return res.status(403).json({ error: 'Ops access required' });

  const { asset, type } = req.query;

  try {
    if (asset && typeof asset === 'string') {
      // Single asset + its edges
      const assetDoc = await db.collection('asset_graph').doc(asset).get();
      if (!assetDoc.exists) return res.status(404).json({ error: 'Asset not found' });

      const outEdges = await db.collection('asset_edges').where('fromId', '==', asset).get();
      const inEdges  = await db.collection('asset_edges').where('toId',   '==', asset).get();

      // Active findings for this asset
      const findings = await db.collection('security_findings')
        .where('affectedAssets', 'array-contains', asset)
        .where('status', 'not-in', ['verified', 'false_positive', 'accepted_risk'])
        .get();

      return res.status(200).json({
        asset:    { id: assetDoc.id, ...assetDoc.data() },
        outEdges: outEdges.docs.map(d => d.data()),
        inEdges:  inEdges.docs.map(d => d.data()),
        activeFindings: findings.docs.map(d => ({
          id:        d.id,
          findingId: d.data().findingId,
          severity:  d.data().severity,
          riskScore: d.data().riskScore,
          title:     d.data().title,
          status:    d.data().status,
        })),
      });
    }

    if (type && typeof type === 'string') {
      // All assets of a given type
      const assets = await db.collection('asset_graph').where('type', '==', type).get();
      return res.status(200).json({
        assets: assets.docs.map(d => ({ id: d.id, ...d.data() })),
      });
    }

    // Full graph
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
    return res.status(500).json({ error: 'Internal error' });
  }
}
