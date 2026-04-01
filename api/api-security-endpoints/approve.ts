// api/security/approve.ts
// POST /api/security/approve
// Ops agent approves or rejects a remediation plan.
// On approval, triggers execution if the plan is automatable.
//
// Body: { approvalId: string, decision: 'approved' | 'rejected', note?: string }
// Auth: Bearer ops agent ID token

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(
    JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!)
  )});
}

const db = admin.firestore();

async function verifyOpsAgent(req: VercelRequest): Promise<admin.auth.DecodedIdToken | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const decoded = await admin.auth().verifyIdToken(authHeader.slice(7));
    const opsDoc  = await db.collection('ops_staff').doc(decoded.uid).get();
    if (!opsDoc.exists) return null;
    return decoded;
  } catch {
    return null;
  }
}

async function triggerExecution(planId: string, agentUid: string): Promise<void> {
  await fetch(`${process.env.VERCEL_URL || 'https://www.bewatu.com'}/api/security/execute`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.BEWATU_SECURITY_TOKEN}`,
    },
    body: JSON.stringify({ planId, approvedBy: agentUid }),
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const agent = await verifyOpsAgent(req);
  if (!agent) return res.status(403).json({ error: 'Ops access required' });

  const { approvalId, decision, note } = req.body;

  if (!approvalId || !decision) {
    return res.status(400).json({ error: 'approvalId and decision required' });
  }
  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be approved or rejected' });
  }

  try {
    const approvalRef = db.collection('approval_requests').doc(approvalId);
    const approval    = await approvalRef.get();

    if (!approval.exists)                     return res.status(404).json({ error: 'Approval not found' });
    if (approval.data()!.status !== 'pending') return res.status(409).json({ error: 'Already decided' });

    const findingId = approval.data()!.findingId;
    const planId    = approval.data()!.remediationPlanId;

    // Record decision on approval request
    await approvalRef.update({
      status:       decision,
      decisionBy:   agent.uid,
      decisionAt:   admin.firestore.FieldValue.serverTimestamp(),
      decisionNote: note ?? null,
    });

    // Update finding status
    await db.collection('security_findings').doc(findingId).update({
      status:    decision === 'approved' ? 'executing' : 'triaged',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Write immutable audit entry
    await db.collection('audit_log').add({
      action:      `security_remediation_${decision}`,
      actorUid:    agent.uid,
      actorEmail:  agent.email,
      approvalId,
      planId,
      findingId,
      note:        note ?? null,
      timestamp:   admin.firestore.FieldValue.serverTimestamp(),
    });

    // If approved, trigger execution
    if (decision === 'approved') {
      const planDoc = await db.collection('remediation_plans').doc(planId).get();
      if (planDoc.data()?.automatable) {
        await triggerExecution(planId, agent.uid);
      } else {
        // Manual plan — update status to approved so ops can track progress
        await db.collection('remediation_plans').doc(planId).update({
          status:     'approved',
          approvedBy: agent.uid,
          approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    } else {
      // Rejected — update plan status
      await db.collection('remediation_plans').doc(planId).update({
        status: 'failed',
      });
      await db.collection('security_findings').doc(findingId).update({
        status: 'accepted_risk',
        falsePositiveReason: note || 'Rejected by ops agent',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return res.status(200).json({ approvalId, decision, planId });

  } catch (err: any) {
    console.error('approve.ts error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
