// api/security/approve.ts
// POST /api/security/approve

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { Octokit } from '@octokit/rest';

const ALLOWED_ORIGINS = ['https://ops.bewatu.com', 'https://www.bewatu.com'];

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

async function verifyOpsAgent(
  req: VercelRequest,
  db: ReturnType<typeof getFirestore>,
  auth: ReturnType<typeof getAuth>
) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const decoded = await auth.verifyIdToken(authHeader.slice(7));
    const opsDoc  = await db.collection('ops_staff').doc(decoded.uid).get();
    if (!opsDoc.exists) return null;
    return decoded;
  } catch { return null; }
}

function getGHRepo(repo: string): { owner: string; repo: string } {
  const map: Record<string, { owner: string; repo: string }> = {
    bewatu_v3:      { owner: 'bewatu8325', repo: 'BeWatu_V3' },
    bewatu_factory: { owner: 'bewatu8325', repo: 'bewatu-factory-main-3' },
    bewatu_ops:     { owner: 'bewatu8325', repo: 'bewatu-ops' },
    shared:         { owner: 'bewatu8325', repo: 'BeWatu_V3' },
  };
  return map[repo] || map.shared;
}

// ── Claude-powered fix generation ────────────────────────────────────────────

async function fetchFileContent(
  octokit: Octokit, owner: string, repo: string, filePath: string
): Promise<{ content: string; sha: string } | null> {
  try {
    const res = await octokit.repos.getContent({ owner, repo, path: filePath });
    if ('content' in res.data) {
      return {
        content: Buffer.from(res.data.content, 'base64').toString('utf-8'),
        sha:     res.data.sha,
      };
    }
    return null;
  } catch (e: any) {
    console.error(`Failed to fetch ${filePath}:`, e.message);
    return null;
  }
}

async function generateFix(
  finding: any, fileContent: string, filePath: string
): Promise<{ fixedContent: string; explanation: string; summary: string } | null> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return null;

  const prompt = `You are a security engineer fixing a vulnerability in a production codebase.

## Finding
- Title: ${finding.title}
- Category: ${finding.category?.replace(/_/g, ' ')}
- Severity: ${finding.severity}
- Description: ${finding.description}
- Rule ID: ${finding.evidence?.ruleId || 'unknown'}
${finding.evidence?.lineNumber ? `- Line: ${finding.evidence.lineNumber}` : ''}
${finding.evidence?.snippet ? `- Problematic code:\n\`\`\`\n${finding.evidence.snippet}\n\`\`\`` : ''}

## File to fix: ${filePath}
\`\`\`typescript
${fileContent.slice(0, 6000)}
\`\`\`

Fix ONLY the specific vulnerability. Do not refactor or change anything else.
Preserve all existing functionality, style, and conventions.

IMPORTANT CONSTRAINTS:
- NEVER add integrity or crossorigin attributes to third-party CDN scripts (Stripe, Tailwind, Google, Firebase, etc.) — these scripts change frequently and SRI will break them
- NEVER modify script tags loading from stripe.com, tailwindcss.com, googleapis.com, gstatic.com, or any other third-party CDN
- Only apply SRI to scripts you control (same domain or your own CDN)
- If the vulnerability is about missing SRI on third-party scripts, mark it as accepted_risk in your response instead of applying a fix
- If you cannot fix the vulnerability without breaking functionality, return the original content unchanged

Respond with JSON only:
{
  "fixedContent": "<complete fixed file>",
  "explanation": "<1-2 sentences: what changed and why it fixes the vulnerability>",
  "summary": "<10 words max for PR title>"
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key':    anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) return null;
    const data    = await response.json() as any;
    const text    = data.content?.[0]?.text || '';
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e: any) {
    console.error('Claude fix generation failed:', e.message);
    return null;
  }
}

async function commitFixAndCreatePR(
  octokit: Octokit, owner: string, repo: string,
  finding: any, plan: any, filePath: string,
  fixedContent: string, explanation: string, summary: string,
  agentEmail: string
): Promise<{ prUrl: string; prNumber: number }> {
  const branchName = `security/fix-${finding.findingId?.toLowerCase()}`;

  const mainRef    = await octokit.git.getRef({ owner, repo, ref: 'heads/main' });
  const mainSha    = mainRef.data.object.sha;
  const mainCommit = await octokit.git.getCommit({ owner, repo, commit_sha: mainSha });

  await octokit.git.deleteRef({ owner, repo, ref: `heads/${branchName}` }).catch(() => {});

  const blob = await octokit.git.createBlob({
    owner, repo,
    content: Buffer.from(fixedContent).toString('base64'),
    encoding: 'base64',
  });

  const newTree = await octokit.git.createTree({
    owner, repo,
    base_tree: mainCommit.data.tree.sha,
    tree: [{ path: filePath, mode: '100644', type: 'blob', sha: blob.data.sha }],
  });

  const newCommit = await octokit.git.createCommit({
    owner, repo,
    message: `[SECURITY] ${finding.findingId}: ${summary}`,
    tree:    newTree.data.sha,
    parents: [mainSha],
  });

  await octokit.git.createRef({
    owner, repo,
    ref: `refs/heads/${branchName}`,
    sha: newCommit.data.sha,
  });

  const pr = await octokit.pulls.create({
    owner, repo,
    title: `[SECURITY] ${finding.severity?.toUpperCase()}: ${summary}`,
    head:  branchName,
    base:  'main',
    body: `## Security Fix: ${finding.findingId}

**Severity:** ${finding.severity?.toUpperCase()} | **Risk Score:** ${finding.riskScore}/100
**Approved by:** ${agentEmail} | **Auto-fixed by:** BeWatu Security Agent

### What was fixed
${explanation}

${finding.aiExplanation ? `### Plain English\n${finding.aiExplanation}\n` : ''}
### File changed
\`${filePath}\`

### Rollback
${plan.rollbackPlan}

### Verification
${(plan.verificationSteps || []).map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}

---
> Auto-generated by BeWatu Security Agent · Finding: \`${finding.findingId}\``.trim(),
    draft: false,
  });

  await octokit.issues.addLabels({
    owner, repo, issue_number: pr.data.number,
    labels: ['security', finding.severity || 'medium', 'auto-fix'],
  }).catch(() => {});

  console.log(`✅ Created PR #${pr.data.number}: ${pr.data.html_url}`);
  return { prUrl: pr.data.html_url, prNumber: pr.data.number };
}

async function createFallbackIssue(
  octokit: Octokit, owner: string, repo: string,
  finding: any, plan: any, agentEmail: string
): Promise<{ issueUrl: string; issueNumber: number } | null> {
  try {
    const issue = await octokit.issues.create({
      owner, repo,
      title: `[SECURITY] ${finding.severity?.toUpperCase()}: ${finding.title}`,
      body: `## Security Finding: ${finding.findingId}

**Severity:** ${finding.severity?.toUpperCase()} | **Risk Score:** ${finding.riskScore}/100
**Approved by:** ${agentEmail}

${finding.aiExplanation ? `### Plain English\n${finding.aiExplanation}\n` : ''}
### Description
${finding.description}

### Actions required
${(plan.actions || []).map((a: string) => `- [ ] ${a.replace(/_/g, ' ')}`).join('\n')}

### Rollback
${plan.rollbackPlan}

---
> BeWatu Security Platform · Finding: \`${finding.findingId}\``.trim(),
      labels: ['security', finding.severity || 'medium', 'manual-fix-required'],
    });
    console.log(`Created issue #${issue.data.number}: ${issue.data.html_url}`);
    return { issueUrl: issue.data.html_url, issueNumber: issue.data.number };
  } catch (e: any) {
    console.error('Issue creation failed:', e.message);
    return null;
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { db, auth } = initAdmin();
    const agent = await verifyOpsAgent(req, db, auth);
    if (!agent) return res.status(403).json({ error: 'Ops access required' });

    const { approvalId, decision, note } = req.body;
    if (!approvalId || !decision) return res.status(400).json({ error: 'approvalId and decision required' });
    if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'Invalid decision' });

    const approvalRef = db.collection('approval_requests').doc(approvalId);
    const approval    = await approvalRef.get();
    if (!approval.exists)                      return res.status(404).json({ error: 'Approval not found' });
    if (approval.data()!.status !== 'pending') return res.status(409).json({ error: 'Already decided' });

    const { findingId, remediationPlanId: planId } = approval.data()!;

    await approvalRef.update({
      status: decision, decisionBy: agent.uid,
      decisionAt: FieldValue.serverTimestamp(), decisionNote: note ?? null,
    });

    await db.collection('audit_log').add({
      action: `security_remediation_${decision}`,
      actorUid: agent.uid, actorEmail: agent.email,
      approvalId, planId, findingId, note: note ?? null,
      timestamp: FieldValue.serverTimestamp(),
    });

    if (decision === 'rejected') {
      await db.collection('remediation_plans').doc(planId).update({ status: 'failed' });
      await db.collection('security_findings').doc(findingId).update({
        status: 'accepted_risk',
        falsePositiveReason: note || 'Rejected by ops agent',
        updatedAt: FieldValue.serverTimestamp(),
      });
      return res.status(200).json({ approvalId, decision, planId });
    }

    // Approved — run the agent
    const [planDoc, findingDoc] = await Promise.all([
      db.collection('remediation_plans').doc(planId).get(),
      db.collection('security_findings').doc(findingId).get(),
    ]);

    const plan    = planDoc.data()!;
    const finding = findingDoc.data()!;

    await Promise.all([
      planDoc.ref.update({ status: 'executing', approvedBy: agent.uid, approvedAt: FieldValue.serverTimestamp(), executedAt: FieldValue.serverTimestamp() }),
      findingDoc.ref.update({ status: 'executing', updatedAt: FieldValue.serverTimestamp() }),
    ]);

    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      return res.status(500).json({ error: 'GITHUB_TOKEN not set — cannot create PR or issue' });
    }

    const octokit = new Octokit({ auth: githubToken });
    const { owner, repo } = getGHRepo(finding.repo || 'shared');
    const filePath = finding.evidence?.filePath;

    // ── Path A: file path known → Claude generates the fix ───────────────────
    if (filePath) {
      console.log(`Agent: fetching ${filePath}`);
      const fileData = await fetchFileContent(octokit, owner, repo, filePath);

      if (fileData) {
        console.log(`Agent: generating fix with Claude`);
        const fix = await generateFix(finding, fileData.content, filePath);

        if (fix?.fixedContent && fix.fixedContent !== fileData.content) {
          console.log(`Agent: committing fix — ${fix.summary}`);
          const prResult = await commitFixAndCreatePR(
            octokit, owner, repo, finding, plan,
            filePath, fix.fixedContent, fix.explanation, fix.summary,
            agent.email || 'ops@bewatu.com'
          );

          await Promise.all([
            planDoc.ref.update({ status: 'completed', prUrl: prResult.prUrl, prNumber: prResult.prNumber, fixSummary: fix.summary }),
            findingDoc.ref.update({ status: 'remediation_pending', prUrl: prResult.prUrl, updatedAt: FieldValue.serverTimestamp() }),
          ]);

          return res.status(200).json({
            approvalId, decision: 'approved', mode: 'auto-fix',
            prUrl: prResult.prUrl, prNumber: prResult.prNumber,
            fixSummary: fix.summary,
          });
        }
        console.log('Agent: Claude returned identical content — falling back to issue');
      }
    }

    // ── Path B: no file path, or Claude couldn't fix → GitHub Issue ──────────
    console.log('Agent: creating GitHub Issue (no file to auto-fix)');
    const issueResult = await createFallbackIssue(
      octokit, owner, repo, finding, plan, agent.email || 'ops@bewatu.com'
    );

    await Promise.all([
      planDoc.ref.update({ status: 'approved', ...(issueResult ? { issueUrl: issueResult.issueUrl, issueNumber: issueResult.issueNumber } : {}) }),
      findingDoc.ref.update({ status: 'remediation_pending', updatedAt: FieldValue.serverTimestamp(), ...(issueResult ? { issueUrl: issueResult.issueUrl } : {}) }),
    ]);

    return res.status(200).json({
      approvalId, decision: 'approved', mode: 'issue',
      ...(issueResult ? { issueUrl: issueResult.issueUrl, issueNumber: issueResult.issueNumber } : { warning: 'Issue creation failed' }),
    });

  } catch (err: any) {
    console.error('approve.ts error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
