// src/services/claudeService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Replaces geminiService.ts — all AI features now powered by Claude.
// Routes through /api/claude (Vercel serverless proxy) to keep the API key
// server-side only. Drop-in replacement: same exports, same signatures.
// ─────────────────────────────────────────────────────────────────────────────

import { AppData, User, Job, VerifiedSkill, CandidateSearchResult } from '../types';

// ── Base caller ───────────────────────────────────────────────────────────────

async function callClaude(prompt: string, system?: string, maxTokens = 1500): Promise<string> {
  const response = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, system, maxTokens }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('Claude API error:', err);
    throw new Error('AI service unavailable. Please try again.');
  }

  const data = await response.json();
  return (data.text ?? data.content ?? '').trim();
}

async function callClaudeJson<T>(prompt: string, system?: string): Promise<T> {
  const text = await callClaude(prompt, system ?? 'Return only valid JSON. No markdown. No explanation.', 2000);
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean) as T;
}

// ── generateProfessionalNetworkData ──────────────────────────────────────────
// Used for seeding demo data — kept for compatibility but returns empty AppData
// in production since we use real Firestore data.

export const generateProfessionalNetworkData = async (): Promise<AppData> => {
  return {
    users: [], posts: [], jobs: [], companies: [], messages: [],
    notifications: [], connectionRequests: [], followRequests: [],
    circles: [], articles: [],
  } as any;
};

// ── analyzeSynergy ────────────────────────────────────────────────────────────

export const analyzeSynergy = async (currentUser: User, otherUser: User): Promise<string> => {
  const prompt = `You are a career co-pilot on BeWatu, a professional network. Analyze the professional synergy between two people and provide actionable insights in markdown format.

**Person A (viewing this analysis):**
- Name: ${currentUser.name}
- Headline: ${currentUser.headline || 'Not specified'}
- Bio: ${currentUser.bio || 'Not specified'}
- Skills: ${currentUser.skills?.map((s: any) => typeof s === 'string' ? s : s.name).join(', ') || 'Not listed'}
- Goals: ${currentUser.professionalGoals?.join(', ') || 'Not specified'}
- Values: ${currentUser.values?.join(', ') || 'Not specified'}

**Person B:**
- Name: ${otherUser.name}
- Headline: ${otherUser.headline || 'Not specified'}
- Bio: ${otherUser.bio || 'Not specified'}
- Skills: ${otherUser.skills?.map((s: any) => typeof s === 'string' ? s : s.name).join(', ') || 'Not listed'}
- Goals: ${otherUser.professionalGoals?.join(', ') || 'Not specified'}
- Values: ${otherUser.values?.join(', ') || 'Not specified'}

Provide a concise synergy analysis covering:
## Key Complementary Skills
## Potential Collaboration Areas
## Shared Values & Goals
## Conversation Starter`;

  try {
    return await callClaude(prompt, 'You are a helpful career co-pilot. Respond in markdown.');
  } catch {
    return "Sorry, I couldn't perform the synergy analysis right now. Please try again.";
  }
};

// ── analyzeJobMatch ───────────────────────────────────────────────────────────

export const analyzeJobMatch = async (user: User, job: Job, companyName: string): Promise<string> => {
  const prompt = `You are a career co-pilot. Analyze how well this candidate matches this job and produce a markdown report.

**Candidate:**
- Name: ${user.name}
- Headline: ${user.headline || ''}
- Bio: ${user.bio || ''}
- Skills: ${user.skills?.map((s: any) => typeof s === 'string' ? s : s.name).join(', ') || ''}
- Values: ${user.values?.join(', ') || ''}

**Job:**
- Title: ${job.title}
- Company: ${companyName}
- Description: ${job.description}
- Experience level: ${(job as any).experienceLevel || 'Not specified'}

Provide:
## Overall Fit
## Key Strengths
## Potential Gaps to Address
## Suggested Interview Questions`;

  try {
    return await callClaude(prompt, 'You are a helpful career co-pilot. Respond in markdown.');
  } catch {
    return "Sorry, I couldn't analyze the job match right now. Please try again.";
  }
};

// ── generateJobPostings ───────────────────────────────────────────────────────

export const generateJobPostings = async (searchTerm: string, location: string): Promise<Job[]> => {
  const prompt = `Generate 5 realistic job postings for a professional network for the keyword "${searchTerm}" in "${location}".

Return a JSON array where each object has:
{ "id": number, "title": string, "description": string, "companyId": number, "recruiterId": number,
  "location": string, "salary": string, "experienceLevel": "Entry"|"Mid"|"Senior",
  "skills": string[], "status": "Active", "liveDate": string, "expiryDate": string }

Use realistic titles, descriptions and salaries. Set liveDate to today and expiryDate 30 days from now.`;

  try {
    return await callClaudeJson<Job[]>(prompt);
  } catch {
    return [];
  }
};

// ── generatePost ──────────────────────────────────────────────────────────────

export const generatePost = async (topic: string, user: User): Promise<string> => {
  const prompt = `Draft a professional social media post for ${user.name} (${user.headline || 'professional'}) on BeWatu about: "${topic}".

Write 2-3 paragraphs, end with an open-ended question, and include 3-5 relevant hashtags. Match their tone based on their bio: "${user.bio || 'professional and thoughtful'}".`;

  try {
    return await callClaude(prompt, 'You write engaging, professional social media posts. No preamble — just the post text.');
  } catch {
    return `I had some trouble drafting that. Could you try a different topic? Original topic: "${topic}"`;
  }
};

// ── generateSkillsGraph ───────────────────────────────────────────────────────

export const generateSkillsGraph = async (resume: string, digitalFootprint: string, references: string): Promise<VerifiedSkill[]> => {
  const prompt = `Analyze this professional's background and return a JSON array of verified skills.

Resume: ${resume || 'Not provided'}
Digital presence: ${digitalFootprint || 'Not provided'}
References: ${references || 'Not provided'}

Return JSON array where each object is:
{ "name": string, "proficiency": "Beginner"|"Intermediate"|"Proficient"|"Expert", "evidence": string, "endorsements": 0, "source": "resume"|"portfolio"|"reference" }`;

  try {
    return await callClaudeJson<VerifiedSkill[]>(prompt);
  } catch {
    throw new Error('Failed to generate skills graph. Please try again.');
  }
};

// ── generateJobDescription ────────────────────────────────────────────────────

export const generateJobDescription = async (title: string, keywords: string): Promise<string> => {
  const prompt = `Write a professional, inclusive job description for: "${title}"
Core responsibilities/keywords: ${keywords}

Structure it as markdown with these sections:
## About the Role
## What You'll Do
## What You'll Bring
## Why You'll Love It Here
## Ready to Apply?

Use action verbs, avoid jargon, avoid gendered language.`;

  try {
    return await callClaude(prompt, 'You write clear, inclusive, professional job descriptions. Respond in markdown.');
  } catch {
    return "Sorry, I couldn't generate a job description right now. Please try again.";
  }
};

// ── analyzeMessageTone ────────────────────────────────────────────────────────

export const analyzeMessageTone = async (message: string): Promise<string> => {
  const prompt = `Analyze the tone of this professional message and give brief, constructive feedback.

Message: "${message}"

Cover:
- **Overall Tone:** How does it come across?
- **Clarity:** Is the purpose clear?
- **Suggestions:** 1-2 specific improvements (or confirm it's already strong)`;

  try {
    return await callClaude(prompt, 'You are a concise communication coach. Respond in markdown bullet points.');
  } catch {
    return "Sorry, I couldn't analyze the message tone right now.";
  }
};

// ── polishMessage ─────────────────────────────────────────────────────────────

export const polishMessage = async (message: string): Promise<string> => {
  const prompt = `Polish this message to sound more professional and clear. Preserve the core intent. Return only the polished text — no preamble.

Original: "${message}"`;

  try {
    return await callClaude(prompt, 'You polish messages to be professional and clear. Return only the polished message, nothing else.');
  } catch {
    return "Sorry, I couldn't polish the message right now.";
  }
};

// ── searchCandidates ──────────────────────────────────────────────────────────

export const searchCandidates = async (allUsers: User[], query: string): Promise<CandidateSearchResult[]> => {
  // Filter to non-recruiters only and cap at 20 for context window efficiency
  const candidates = allUsers.filter(u => !u.isRecruiter).slice(0, 20);

  const prompt = `You are a recruiter co-pilot. Find the best matching candidates for this query: "${query}"

Available candidates:
${JSON.stringify(candidates.map(u => ({
  id: u.id,
  name: u.name,
  headline: u.headline,
  bio: u.bio,
  skills: u.skills?.map((s: any) => typeof s === 'string' ? s : s.name),
  industry: u.industry,
  values: u.values,
})), null, 2)}

Return a JSON array of matches (best first). Each object:
{
  "userId": number,
  "aiAnalysis": {
    "summary": string,
    "predictiveScores": { "roleFit": number, "cultureFit": number, "mutualSuccessPotential": number },
    "keyStrengths": string[],
    "potentialConcerns": string[],
    "interviewQuestions": string[]
  }
}

Include only candidates that are genuinely relevant. Max 5 results.`;

  try {
    const results = await callClaudeJson<Array<{ userId: number; aiAnalysis: any }>>(prompt);
    return results.map(r => {
      const user = allUsers.find(u => u.id === r.userId);
      return user ? { user, aiAnalysis: r.aiAnalysis } : null;
    }).filter(Boolean) as CandidateSearchResult[];
  } catch {
    // Fallback: simple skill-based matching without AI
    return allUsers
      .filter(u => !u.isRecruiter)
      .filter(u => {
        const q = query.toLowerCase();
        const skills = u.skills?.map((s: any) => typeof s === 'string' ? s : s.name).join(' ').toLowerCase() ?? '';
        return u.name.toLowerCase().includes(q) ||
               u.headline?.toLowerCase().includes(q) ||
               skills.includes(q) ||
               u.industry?.toLowerCase().includes(q);
      })
      .slice(0, 5)
      .map(user => ({
        user,
        aiAnalysis: {
          summary: `${user.name} may be relevant to your search for "${query}".`,
          predictiveScores: { roleFit: 70, cultureFit: 70, mutualSuccessPotential: 70 },
          keyStrengths: user.skills?.slice(0, 3).map((s: any) => typeof s === 'string' ? s : s.name) ?? [],
          potentialConcerns: [],
          interviewQuestions: ['Tell me about your most relevant experience for this role.'],
        },
      }));
  }
};
