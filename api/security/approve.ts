// api/security/approve.ts
// POST /api/security/approve

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

function initAdmin() {
  if (!getApps().length) {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
    initializeApp({ credential: cert(JSON.parse(sa)) });
  }
  return { db: getFirestore(), auth: getAuth() };
}

async function verifyOpsAgent(req: VercelRequest, db: ReturnType<typeof getFirestore>, auth: ReturnType<typeof getAuth>) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const decoded = await auth.verifyIdToken(authHeader.slice(7));
    const opsDoc  = await db.collection('ops_staff').doc(decoded.uid).get();
    if (!opsDoc.exists) return null;
    return decoded;
  } catch { return null; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { db, auth } = initAdmin();
    const agent = await verifyOpsAgent(req, db, auth);
    if (!agent) return res.status(403).json({ error: 'Ops access required' });

    const { approvalId, decision, note } = req.body;
    if (!approvalId || !decision) return res.status(400).json({ error: 'approvalId and decision required' });
    if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'decision must be approved or rejected' });

    const approvalRef = db.collection('approval_requests').doc(approvalId);
    const approval    = await approvalRef.get();
    if (!approval.exists) return res.status(404).json({ error: 'Approval not found' });
    if (approval.data()!.status !== 'pending') return res.status(409).json({ error: 'Already decided' });

    const { findingId, remediationPlanId: planId } = approval.data()!;

    await approvalRef.update({
      status: decision, decisionBy: agent.uid,
      decisionAt: FieldValue.serverTimestamp(), decisionNote: note ?? null,
    });

    await db.collection('security_findings').doc(findingId).update({
      status: decision === 'approved' ? 'executing' : 'triaged',
      updatedAt: FieldValue.serverTimestamp(),
    });

    await db.collection('audit_log').add({
      action: `security_remediation_${decision}`,
      actorUid: agent.uid, actorEmail: agent.email,
      approvalId, planId, findingId, note: note ?? null,
      timestamp: FieldValue.serverTimestamp(),
    });

    if (decision === 'approved') {
      const planDoc = await db.collection('remediation_plans').doc(planId).get();
      if (planDoc.data()?.automatable) {
        fetch('https://www.bewatu.com/api/security/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.BEWATU_SECURITY_TOKEN}` },
          body: JSON.stringify({ planId, approvedBy: agent.uid }),
        }).catch(e => console.error('Execute trigger error:', e));
      } else {
        await db.collection('remediation_plans').doc(planId).update({
          status: 'approved', approvedBy: agent.uid,
          approvedAt: FieldValue.serverTimestamp(),
        });
      }
    } else {
      await db.collection('remediation_plans').doc(planId).update({ status: 'failed' });
      await db.collection('security_findings').doc(findingId).update({
        status: 'accepted_risk', falsePositiveReason: note || 'Rejected by ops agent',
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    return res.status(200).json({ approvalId, decision, planId });

  } catch (err: any) {
    console.error('approve.ts error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
