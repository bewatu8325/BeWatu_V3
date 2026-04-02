// api/security/seed.ts
// ONE-TIME USE — delete after seeding is confirmed in Firestore.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const ALLOWED_ORIGINS = [
  'https://ops.bewatu.com',
  'https://www.bewatu.com',
  'http://localhost:5173',
  'http://localhost:3000',
];

function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined;
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

const BEWATU_ASSETS = [
  { id: 'bewatu_v3_app',         type: 'react_app',            name: 'bewatu.com',                  criticality: 0.8,  dataSensitivity: 0.7,  internetFacing: true  },
  { id: 'bewatu_factory_app',    type: 'nextjs_app',           name: 'factory.bewatu.com',           criticality: 0.75, dataSensitivity: 0.7,  internetFacing: true  },
  { id: 'bewatu_ops_app',        type: 'react_app',            name: 'ops.bewatu.com',               criticality: 0.85, dataSensitivity: 0.9,  internetFacing: true  },
  { id: 'api_factory_token',     type: 'vercel_function',      name: 'api/factory-token',            criticality: 0.9,  dataSensitivity: 0.8,  internetFacing: true  },
  { id: 'api_claude',            type: 'vercel_function',      name: 'api/claude',                   criticality: 0.5,  dataSensitivity: 0.4,  internetFacing: true  },
  { id: 'api_inbound_email',     type: 'vercel_function',      name: 'api/inbound-email',            criticality: 0.7,  dataSensitivity: 0.8,  internetFacing: true  },
  { id: 'api_ticket_reply',      type: 'vercel_function',      name: 'api/ticket-reply',             criticality: 0.7,  dataSensitivity: 0.8,  internetFacing: false },
  { id: 'api_recruiter_otp',     type: 'vercel_function',      name: 'api/send-recruiter-otp',       criticality: 0.7,  dataSensitivity: 0.6,  internetFacing: true  },
  { id: 'firebase_auth',         type: 'firebase_auth',        name: 'Firebase Auth (bewatu-2d04e)', criticality: 1.0,  dataSensitivity: 1.0,  internetFacing: true  },
  { id: 'firestore_users',       type: 'firestore_collection', name: 'users collection',             criticality: 0.95, dataSensitivity: 1.0,  internetFacing: false },
  { id: 'firestore_messages',    type: 'firestore_collection', name: 'messages collection',          criticality: 0.8,  dataSensitivity: 0.9,  internetFacing: false },
  { id: 'firestore_tickets',     type: 'firestore_collection', name: 'support_tickets collection',   criticality: 0.85, dataSensitivity: 0.9,  internetFacing: false },
  { id: 'firestore_ops_staff',   type: 'firestore_collection', name: 'ops_staff collection',         criticality: 0.9,  dataSensitivity: 0.8,  internetFacing: false },
  { id: 'firestore_audit_log',   type: 'firestore_collection', name: 'audit_log collection',         criticality: 0.9,  dataSensitivity: 0.7,  internetFacing: false },
  { id: 'secret_firebase_admin', type: 'secret',               name: 'FIREBASE_SERVICE_ACCOUNT',     criticality: 1.0,  dataSensitivity: 1.0,  internetFacing: false },
  { id: 'secret_stripe',         type: 'secret',               name: 'STRIPE_SECRET_KEY',            criticality: 0.9,  dataSensitivity: 0.9,  internetFacing: false },
  { id: 'secret_resend',         type: 'secret',               name: 'RESEND_API_KEY',               criticality: 0.7,  dataSensitivity: 0.6,  internetFacing: false },
  { id: 'secret_anthropic',      type: 'secret',               name: 'ANTHROPIC_API_KEY',            criticality: 0.5,  dataSensitivity: 0.3,  internetFacing: false },
  { id: 'secret_otp',            type: 'secret',               name: 'OTP_SECRET',                   criticality: 0.7,  dataSensitivity: 0.6,  internetFacing: false },
  { id: 'ext_stripe',            type: 'external_service',     name: 'Stripe API',                   criticality: 0.8,  dataSensitivity: 0.9,  internetFacing: true  },
  { id: 'ext_resend',            type: 'external_service',     name: 'Resend API',                   criticality: 0.7,  dataSensitivity: 0.7,  internetFacing: true  },
  { id: 'ext_anthropic',         type: 'external_service',     name: 'Anthropic API',                criticality: 0.5,  dataSensitivity: 0.4,  internetFacing: true  },
  { id: 'role_platform_admin',   type: 'user_role',            name: 'isPlatformAdmin',              criticality: 1.0,  dataSensitivity: 1.0,  internetFacing: false },
  { id: 'role_ops_staff',        type: 'user_role',            name: 'ops_staff member',             criticality: 0.85, dataSensitivity: 0.9,  internetFacing: false },
];

const BEWATU_EDGES = [
  { fromId: 'bewatu_v3_app',       toId: 'firebase_auth',         relationship: 'authenticates_via', dataFlow: 'internal' },
  { fromId: 'bewatu_v3_app',       toId: 'firestore_users',       relationship: 'reads_from',        dataFlow: 'pii'      },
  { fromId: 'bewatu_v3_app',       toId: 'api_factory_token',     relationship: 'calls',             dataFlow: 'internal' },
  { fromId: 'api_factory_token',   toId: 'secret_firebase_admin', relationship: 'reads_from',        dataFlow: 'internal' },
  { fromId: 'api_factory_token',   toId: 'firebase_auth',         relationship: 'writes_to',         dataFlow: 'internal' },
  { fromId: 'bewatu_factory_app',  toId: 'firebase_auth',         relationship: 'authenticates_via', dataFlow: 'internal' },
  { fromId: 'bewatu_factory_app',  toId: 'firestore_users',       relationship: 'reads_from',        dataFlow: 'pii'      },
  { fromId: 'bewatu_ops_app',      toId: 'firestore_ops_staff',   relationship: 'reads_from',        dataFlow: 'internal' },
  { fromId: 'bewatu_ops_app',      toId: 'firestore_tickets',     relationship: 'reads_from',        dataFlow: 'pii'      },
  { fromId: 'bewatu_ops_app',      toId: 'api_ticket_reply',      relationship: 'calls',             dataFlow: 'pii'      },
  { fromId: 'api_ticket_reply',    toId: 'secret_resend',         relationship: 'reads_from',        dataFlow: 'internal' },
  { fromId: 'api_ticket_reply',    toId: 'firestore_tickets',     relationship: 'writes_to',         dataFlow: 'pii'      },
  { fromId: 'api_ticket_reply',    toId: 'secret_firebase_admin', relationship: 'reads_from',        dataFlow: 'internal' },
  { fromId: 'api_recruiter_otp',   toId: 'secret_otp',            relationship: 'reads_from',        dataFlow: 'internal' },
  { fromId: 'api_recruiter_otp',   toId: 'secret_resend',         relationship: 'reads_from',        dataFlow: 'internal' },
  { fromId: 'api_claude',          toId: 'secret_anthropic',      relationship: 'reads_from',        dataFlow: 'internal' },
  { fromId: 'role_platform_admin', toId: 'firestore_users',       relationship: 'owns',              dataFlow: 'pii'      },
  { fromId: 'role_platform_admin', toId: 'firebase_auth',         relationship: 'owns',              dataFlow: 'internal' },
  { fromId: 'role_ops_staff',      toId: 'firestore_tickets',     relationship: 'reads_from',        dataFlow: 'pii'      },
  { fromId: 'role_ops_staff',      toId: 'firestore_audit_log',   relationship: 'reads_from',        dataFlow: 'internal' },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!sa) return res.status(500).json({ error: 'FIREBASE_SERVICE_ACCOUNT env var not set' });

    if (!getApps().length) {
      initializeApp({ credential: cert(JSON.parse(sa)) });
    }

    const firestore = getFirestore();
    const auth      = getAuth();

    // Verify platform admin
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(403).json({ error: 'No auth token' });

    const decoded = await auth.verifyIdToken(authHeader.slice(7));

    // Check ops_staff collection (ops portal session)
    const opsDoc     = await firestore.collection('ops_staff').doc(decoded.uid).get();
    const isOpsAdmin = opsDoc.exists && opsDoc.data()?.role === 'platform_admin';

    // Also check users collection (bewatu.com session)
    const userDoc     = await firestore.collection('users').doc(decoded.uid).get();
    const isUserAdmin = userDoc.exists && userDoc.data()?.isPlatformAdmin === true;

    if (!isOpsAdmin && !isUserAdmin) return res.status(403).json({ error: 'Platform admin required' });

    if (!req.body?.confirm) return res.status(400).json({ error: 'Pass { confirm: true } in body' });

    // Seed assets and edges
    const batch = firestore.batch();

    for (const asset of BEWATU_ASSETS) {
      batch.set(firestore.collection('asset_graph').doc(asset.id), {
        ...asset, dependencies: [], dependents: [], secrets: [], tags: [],
        lastScanned: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    for (const edge of BEWATU_EDGES) {
      const edgeId = `${edge.fromId}__${edge.relationship}__${edge.toId}`;
      batch.set(firestore.collection('asset_edges').doc(edgeId), { id: edgeId, ...edge }, { merge: true });
    }

    await batch.commit();

    await firestore.collection('security_config').doc('rules').set({
      semgrepEnabled: true, gitleaksEnabled: true, dependencyAuditEnabled: true,
      firestoreRulesLintEnabled: true, postureCheckEnabled: true, runtimeAnomalyEnabled: true,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await firestore.collection('security_config').doc('suppression').set({
      suppressions: [], updatedAt: FieldValue.serverTimestamp(),
    });

    return res.status(200).json({
      success: true, assets: BEWATU_ASSETS.length, edges: BEWATU_EDGES.length,
      message: 'Seeded. Delete api/security/seed.ts now.',
    });

  } catch (err: any) {
    console.error('Seed error:', err);
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
