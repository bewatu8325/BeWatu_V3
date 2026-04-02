// api/security/remediation.ts
// POST /api/security/remediation

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

const APPROVAL_EXPIRY_DAYS = 7;

function initAdmin() {
  if (!getApps().length) {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
    initializeApp({ credential: cert(JSON.parse(sa)) });
  }
  return { db: getFirestore() };
}

function validateServiceToken(req: VercelRequest): boolean {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return false;
  return auth.slice(7) === process.env.BEWATU_SECURITY_TOKEN;
}

function determineActions(category: string, affectedAssets: string[]): string[] {
  switch (category) {
    case 'secret_leak':       return ['rotate_secret', 'code_change'];
    case 'dependency_risk':   return ['patch_dependency'];
    case 'vulnerability':     return ['code_change'];
    case 'misconfiguration':  return affectedAssets.includes('firestore_rules') ? ['rules_update'] : ['config_change'];
    case 'runtime_anomaly':   return ['manual'];
    default:                  return ['manual'];
  }
}

function estimateEffort(actions: string[]): string {
  if (actions.includes('manual'))           return '1–4 hours (manual investigation required)';
  if (actions.includes('rotate_secret'))    return '30 minutes';
  if (actions.includes('patch_dependency')) return '1–2 hours';
  if (actions.includes('code_change'))      return '1–4 hours';
  return '2–4 hours';
}

function isAutomatable(actions: string[], finding: any): boolean {
  if (actions.includes('manual') || actions.includes('revoke_access')) return false;
  if (actions.includes('patch_dependency')) return true;
  if (actions.includes('code_change') && finding.evidence?.filePath) return true;
  return false;
}

function generateRollbackPlan(actions: string[]): string {
  if (actions.includes('patch_dependency'))  return 'Revert the dependency update PR. The previous version remains available.';
  if (actions.includes('rotate_secret'))     return 'If the new secret causes failures, restore the old secret in Vercel env vars and redeploy.';
  if (actions.includes('rules_update'))      return 'Revert firestore.rules to the previous commit and deploy.';
  if (actions.includes('config_change'))     return 'Revert the config change via Vercel dashboard rollback.';
  return 'Revert the associated PR or config change and verify platform functionality.';
}

function generateVerificationSteps(category: string): string[] {
  const base = ['Confirm the finding no longer appears in the next CI scan.'];
  if (category === 'dependency_risk')   return [...base, 'Run npm audit locally and confirm the CVE is no longer listed.'];
  if (category === 'secret_leak')       return ['Confirm the old secret is revoked.', 'Run Gitleaks and confirm no secrets found.'];
  if (category === 'misconfiguration')  return [...base, 'Confirm the posture check passes on next run.'];
  return [...base, 'Verify finding status is updated to verified.'];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!validateServiceToken(req)) return res.status(403).json({ error: 'Unauthorised' });

  try {
    const { db } = initAdmin();
    const { findingId } = req.body;
    if (!findingId) return res.status(400).json({ error: 'findingId required' });

    const findingDoc = await db.collection('security_findings').doc(findingId).get();
    if (!findingDoc.exists) return res.status(404).json({ error: 'Finding not found' });
    const finding = findingDoc.data()!;

    // Check if plan already exists
    const existing = await db.collection('remediation_plans')
      .where('findingId', '==', findingId)
      .where('status', 'not-in', ['completed', 'rolled_back', 'failed'])
      .limit(1).get();
    if (!existing.empty) return res.status(200).json({ planId: existing.docs[0].id, existing: true });

    const actions    = determineActions(finding.category, finding.affectedAssets || []);
    const automatable = isAutomatable(actions, finding);
    const summary    = `${finding.title} (risk: ${finding.riskScore}/100). Requires: ${actions.map((a:string) => a.replace(/_/g,' ')).join(', ')}.`;

    const planRef = db.collection('remediation_plans').doc();
    const plan = {
      id:               planRef.id,
      findingId,
      status:           'pending_approval',
      priority:         finding.riskScore >= 85 ? 1 : finding.riskScore >= 65 ? 2 : 3,
      actions,
      summary,
      rollbackPlan:     generateRollbackPlan(actions),
      verificationSteps: generateVerificationSteps(finding.category),
      estimatedEffort:  estimateEffort(actions),
      automatable,
      createdAt:        FieldValue.serverTimestamp(),
    };
    await planRef.set(plan);

    await findingDoc.ref.update({
      status: 'approval_pending', remediationPlanId: planRef.id,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + APPROVAL_EXPIRY_DAYS);

    const approvalRef = db.collection('approval_requests').doc();
    await approvalRef.set({
      id:                approvalRef.id,
      remediationPlanId: planRef.id,
      findingId,
      severity:          finding.severity,
      riskScore:         finding.riskScore,
      title:             finding.title,
      summary,
      rollbackPlan:      plan.rollbackPlan,
      affectedAssets:    finding.affectedAssets || [],
      estimatedEffort:   plan.estimatedEffort,
      status:            'pending',
      expiresAt:         Timestamp.fromDate(expiresAt),
      createdAt:         FieldValue.serverTimestamp(),
    });

    return res.status(201).json({ planId: planRef.id, approvalId: approvalRef.id, automatable });

  } catch (err: any) {
    console.error('remediation.ts error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
