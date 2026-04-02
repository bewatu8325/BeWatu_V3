// api/security/agent.ts
// POST /api/security/agent
// Autonomous security remediation agent powered by Claude.
// 1. Fetches the affected file(s) from GitHub
// 2. Sends code + finding to Claude for fix generation
// 3. Commits the fix to a new branch
// 4. Creates a PR
//
// Called by approve.ts after a human approves a finding.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { Octokit } from '@octokit/rest';

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

function getGHRepo(repo: string): { owner: string; repo: string } {
  const map: Record<string, { owner: string; repo: string }> = {
    bewatu_v3:      { owner: 'bewatu8325', repo: 'BeWatu_V3' },
    bewatu_factory: { owner: 'bewatu8325', repo: 'bewatu-factory-main-3' },
    bewatu_ops:     { owner: 'bewatu8325', repo: 'bewatu-ops' },
    shared:         { owner: 'bewatu8325', repo: 'BeWatu_V3' },
  };
  return map[repo] || map.shared;
}

// ── Step 1: Fetch file content from GitHub ────────────────────────────────────

async function fetchFileContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  filePath: string
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

// ── Step 2: Ask Claude to fix the code ───────────────────────────────────────

async function generateFix(
  finding: any,
  fileContent: string,
  filePath: string
): Promise<{ fixedContent: string; explanation: string; summary: string } | null> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    console.error('ANTHROPIC_API_KEY not set');
    return null;
  }

  const lineContext = finding.evidence?.lineNumber
    ? `The vulnerability is on or around line ${finding.evidence.lineNumber}.`
    : '';

  const snippetContext = finding.evidence?.snippet
    ? `The specific problematic code is:\n\`\`\`\n${finding.evidence.snippet}\n\`\`\``
    : '';

  const prompt = `You are a security engineer fixing a vulnerability in a production codebase.

## Finding
- Title: ${finding.title}
- Category: ${finding.category?.replace(/_/g, ' ')}
- Severity: ${finding.severity}
- Description: ${finding.description}
- Rule ID: ${finding.evidence?.ruleId || 'unknown'}
${lineContext}
${snippetContext}

## File to fix
Path: ${filePath}

\`\`\`typescript
${fileContent}
\`\`\`

## Instructions
1. Fix ONLY the specific vulnerability described. Do not refactor or change anything else.
2. Preserve all existing functionality exactly.
3. Keep the same code style, indentation, and conventions.
4. If the fix requires adding an import, add it with the existing imports.

Respond with a JSON object only — no markdown, no explanation outside the JSON:
{
  "fixedContent": "<the complete fixed file content>",
  "explanation": "<1-2 sentences explaining exactly what you changed and why it fixes the vulnerability>",
  "summary": "<10 words or less describing the change, for the PR title>"
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error('Claude API error:', response.status);
      return null;
    }

    const data    = await response.json() as any;
    const text    = data.content?.[0]?.text || '';
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed  = JSON.parse(cleaned);

    if (!parsed.fixedContent) {
      console.error('Claude returned no fixedContent');
      return null;
    }

    return parsed;
  } catch (e: any) {
    console.error('Claude fix generation failed:', e.message);
    return null;
  }
}

// ── Step 3: Commit fix and create PR ─────────────────────────────────────────

async function commitAndCreatePR(
  octokit: Octokit,
  owner: string,
  repo: string,
  finding: any,
  plan: any,
  filePath: string,
  fixedContent: string,
  explanation: string,
  summary: string,
  agentEmail: string
): Promise<{ prUrl: string; prNumber: number }> {
  const branchName = `security/fix-${finding.findingId?.toLowerCase()}`;

  // Get main SHA
  const mainRef = await octokit.git.getRef({ owner, repo, ref: 'heads/main' });
  const mainSha = mainRef.data.object.sha;

  // Delete stale branch if exists
  await octokit.git.deleteRef({ owner, repo, ref: `heads/${branchName}` }).catch(() => {});

  // Create blob with fixed content
  const blob = await octokit.git.createBlob({
    owner, repo,
    content:  Buffer.from(fixedContent).toString('base64'),
    encoding: 'base64',
  });

  // Get main tree
  const mainCommit = await octokit.git.getCommit({ owner, repo, commit_sha: mainSha });

  // Create new tree with the fixed file
  const newTree = await octokit.git.createTree({
    owner, repo,
    base_tree: mainCommit.data.tree.sha,
    tree: [{
      path:    filePath,
      mode:    '100644',
      type:    'blob',
      sha:     blob.data.sha,
    }],
  });

  // Create commit
  const newCommit = await octokit.git.createCommit({
    owner, repo,
    message: `[SECURITY] ${finding.findingId}: ${summary}`,
    tree:    newTree.data.sha,
    parents: [mainSha],
  });

  // Create branch pointing to new commit
  await octokit.git.createRef({
    owner, repo,
    ref: `refs/heads/${branchName}`,
    sha: newCommit.data.sha,
  });

  // Build PR body
  const prBody = `## Security Fix: ${finding.findingId}

**Severity:** ${finding.severity?.toUpperCase()}
**Risk Score:** ${finding.riskScore}/100
**Approved by:** ${agentEmail}

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
> Auto-generated by BeWatu Security Agent
> Finding: \`${finding.findingId}\`
`.trim();

  // Create PR
  const pr = await octokit.pulls.create({
    owner, repo,
    title: `[SECURITY] ${finding.severity?.toUpperCase()}: ${summary}`,
    head:  branchName,
    base:  'main',
    body:  prBody,
    draft: false,
  });

  // Add labels
  await octokit.issues.addLabels({
    owner, repo,
    issue_number: pr.data.number,
    labels:       ['security', finding.severity || 'medium', 'auto-fix'],
  }).catch(() => {});

  console.log(`Created PR #${pr.data.number}: ${pr.data.html_url}`);
  return { prUrl: pr.data.html_url, prNumber: pr.data.number };
}

// ── Step 4: Fallback — create GitHub Issue if no file to fix ──────────────────

async function createFallbackIssue(
  octokit: Octokit,
  owner: string,
  repo: string,
  finding: any,
  plan: any,
  agentEmail: string
): Promise<{ issueUrl: string; issueNumber: number } | null> {
  try {
    const body = `## Security Finding: ${finding.findingId}

**Severity:** ${finding.severity?.toUpperCase()}
**Risk Score:** ${finding.riskScore}/100
**Approved by:** ${agentEmail}

${finding.aiExplanation ? `### Plain English\n${finding.aiExplanation}\n` : ''}

### Description
${finding.description}

### Actions required
${(plan.actions || []).map((a: string) => `- [ ] ${a.replace(/_/g, ' ')}`).join('\n')}

### Rollback plan
${plan.rollbackPlan}

---
> Generated by BeWatu Security Platform — no file location available for auto-fix
> Finding: \`${finding.findingId}\`
`.trim();

    const issue = await octokit.issues.create({
      owner, repo,
      title:  `[SECURITY] ${finding.severity?.toUpperCase()}: ${finding.title}`,
      body,
      labels: ['security', finding.severity || 'medium', 'manual-fix-required'],
    });

    console.log(`Created fallback issue #${issue.data.number}: ${issue.data.html_url}`);
    return { issueUrl: issue.data.html_url, issueNumber: issue.data.number };
  } catch (e: any) {
    console.error('Fallback issue creation failed:', e.message);
    return null;
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!validateServiceToken(req)) return res.status(403).json({ error: 'Unauthorised' });

  try {
    const { db }       = initAdmin();
    const { planId, findingId, agentEmail } = req.body;
    if (!planId || !findingId) return res.status(400).json({ error: 'planId and findingId required' });

    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) return res.status(500).json({ error: 'GITHUB_TOKEN not set' });

    const [planDoc, findingDoc] = await Promise.all([
      db.collection('remediation_plans').doc(planId).get(),
      db.collection('security_findings').doc(findingId).get(),
    ]);

    if (!planDoc.exists || !findingDoc.exists) {
      return res.status(404).json({ error: 'Plan or finding not found' });
    }

    const plan    = planDoc.data()!;
    const finding = findingDoc.data()!;
    const octokit = new Octokit({ auth: githubToken });
    const { owner, repo } = getGHRepo(finding.repo || 'shared');
    const filePath = finding.evidence?.filePath;

    // Update status to executing
    await Promise.all([
      planDoc.ref.update({ status: 'executing', executedAt: FieldValue.serverTimestamp() }),
      findingDoc.ref.update({ status: 'executing', updatedAt: FieldValue.serverTimestamp() }),
    ]);

    // If we have a file path, use Claude to generate and apply the fix
    if (filePath) {
      console.log(`Fetching file: ${filePath}`);
      const fileData = await fetchFileContent(octokit, owner, repo, filePath);

      if (fileData) {
        console.log(`Generating fix with Claude for ${filePath}`);
        const fix = await generateFix(finding, fileData.content, filePath);

        if (fix && fix.fixedContent !== fileData.content) {
          console.log(`Applying fix: ${fix.summary}`);
          const prResult = await commitAndCreatePR(
            octokit, owner, repo,
            finding, plan,
            filePath, fix.fixedContent,
            fix.explanation, fix.summary,
            agentEmail || 'ops@bewatu.com'
          );

          await Promise.all([
            planDoc.ref.update({
              status:    'completed',
              prUrl:     prResult.prUrl,
              prNumber:  prResult.prNumber,
              fixSummary: fix.summary,
              fixExplanation: fix.explanation,
            }),
            findingDoc.ref.update({
              status:    'remediation_pending',
              prUrl:     prResult.prUrl,
              updatedAt: FieldValue.serverTimestamp(),
            }),
          ]);

          return res.status(200).json({
            success: true, mode: 'auto-fix',
            prUrl: prResult.prUrl, prNumber: prResult.prNumber,
            fixSummary: fix.summary,
          });
        } else {
          console.log('Claude returned identical content or failed — falling back to issue');
        }
      }
    }

    // Fallback: no file path, or Claude couldn't generate a fix — create an Issue
    console.log('Creating fallback GitHub Issue');
    const issueResult = await createFallbackIssue(
      octokit, owner, repo, finding, plan, agentEmail || 'ops@bewatu.com'
    );

    await Promise.all([
      planDoc.ref.update({
        status:    'approved',
        ...(issueResult ? { issueUrl: issueResult.issueUrl, issueNumber: issueResult.issueNumber } : {}),
      }),
      findingDoc.ref.update({
        status:    'remediation_pending',
        updatedAt: FieldValue.serverTimestamp(),
        ...(issueResult ? { issueUrl: issueResult.issueUrl } : {}),
      }),
    ]);

    return res.status(200).json({
      success: true, mode: 'issue',
      ...(issueResult ? { issueUrl: issueResult.issueUrl, issueNumber: issueResult.issueNumber } : { warning: 'Issue creation also failed' }),
    });

  } catch (err: any) {
    console.error('agent.ts error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
