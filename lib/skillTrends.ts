/**
 * lib/skillTrends.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Curated skill-trend reference for the Skills Radar (Feature 2).
 *
 * Derived from the WEF Future of Jobs employer survey and the AI-era research:
 *   - GROWING:   skills rising in employer demand through 2030 (AI-complementary,
 *                durable human capabilities, technical fluency)
 *   - STABLE:    holding value — judgment, relationships, domain depth
 *   - DECLINING: the parts AI absorbs first — routine reading/writing/math,
 *                manual precision, pure attention-to-detail tasks
 *
 * Matching is keyword-based and case-insensitive, so a user's free-text skill
 * ("Data entry & reporting") maps to the right bucket via substring match.
 * Unmatched skills return 'unknown' and are shown separately, never guessed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type SkillTrend = 'growing' | 'stable' | 'declining' | 'unknown';

interface TrendRule {
  trend:    SkillTrend;
  keywords: string[];
  note:     string;
}

// Order matters: first matching rule wins. More specific rules first.
const TREND_RULES: TrendRule[] = [
  // ── GROWING ────────────────────────────────────────────────────────────────
  { trend: 'growing', note: 'AI fluency commands a wage premium — keep showing it in context.',
    keywords: ['ai', 'machine learning', 'ml', 'llm', 'prompt', 'genai', 'generative', 'automation', 'data science', 'analytics', 'data analysis'] },
  { trend: 'growing', note: 'Rising fast — pair it with a visible body of work.',
    keywords: ['cybersecurity', 'security', 'cloud', 'devops', 'product management', 'ux', 'ui', 'design system', 'growth', 'sustainability', 'green', 'esg', 'renewable'] },
  { trend: 'growing', note: 'A durable human capability AI amplifies rather than replaces.',
    keywords: ['systems thinking', 'creativity', 'creative', 'innovation', 'strategy', 'strategic', 'leadership', 'resilience', 'adaptability', 'curiosity', 'collaboration', 'storytelling', 'communication'] },

  // ── STABLE / JUDGMENT MOAT ───────────────────────────────────────────────────
  { trend: 'stable', note: 'Holds value — judgment and relationships are the human edge.',
    keywords: ['negotiation', 'mentoring', 'coaching', 'stakeholder', 'facilitation', 'critical thinking', 'problem framing', 'decision', 'ethics', 'judgment', 'people management', 'empathy', 'emotional'] },
  { trend: 'stable', note: 'Domain depth stays valuable when paired with adaptability.',
    keywords: ['clinical', 'legal', 'engineering', 'architecture', 'research', 'finance', 'accounting principles', 'medicine', 'teaching', 'care'] },

  // ── DECLINING ────────────────────────────────────────────────────────────────
  { trend: 'declining', note: 'AI absorbs this first — keep it, but lead with judgment around it.',
    keywords: ['data entry', 'transcription', 'copy editing', 'proofreading', 'basic bookkeeping', 'manual testing', 'routine reporting', 'scheduling', 'filing', 'first-draft', 'first draft'] },
  { trend: 'declining', note: 'Increasingly automated — frame it as input to higher-order work.',
    keywords: ['attention to detail', 'manual precision', 'document formatting', 'spreadsheet entry', 'basic coding', 'boilerplate', 'translation'] },
];

export interface SkillTrendResult {
  skill: string;
  trend: SkillTrend;
  note:  string;
}

export function classifySkill(skill: string): SkillTrendResult {
  const lower = skill.toLowerCase();
  for (const rule of TREND_RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) {
      return { skill, trend: rule.trend, note: rule.note };
    }
  }
  return { skill, trend: 'unknown', note: '' };
}

export function classifySkills(skills: string[]): SkillTrendResult[] {
  return skills.map(classifySkill);
}

/** Headline guidance based on the balance of a user's skill portfolio. */
export function portfolioGuidance(results: SkillTrendResult[]): string {
  const growing   = results.filter(r => r.trend === 'growing').length;
  const declining = results.filter(r => r.trend === 'declining').length;
  const known     = results.filter(r => r.trend !== 'unknown').length;

  if (known === 0) return 'Add a few verified skills and the radar will map where each one is heading.';
  if (declining === 0 && growing > 0) return 'Your skill mix leans toward what AI amplifies. Keep showing these in context — Playbooks are a strong way to prove it.';
  if (declining > growing) return 'Several of your skills are in the bucket AI absorbs first. That is not a problem — pair them with judgment and a visible body of work. The growing skills below are worth leaning into.';
  return 'A balanced mix. Lead with the growing and judgment skills; frame the declining ones as inputs to higher-order work.';
}
