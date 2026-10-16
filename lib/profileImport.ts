/**
 * lib/profileImport.ts
 *
 * Turns a user's own profile data — a LinkedIn export (pasted text, a "Save
 * to PDF" file, or the full "Get a copy of your data" ZIP) or a resume
 * (PDF or .docx) — into plain text, then asks the existing /api/ai endpoint
 * to extract structured profile fields from it. Every input path converges
 * on the same plain-text-in, JSON-out shape so the AI call is built once —
 * see api/ai.ts, which already accepts { prompt, system, maxTokens }
 * unchanged by this file.
 *
 * Originally lib/linkedinImport.ts; renamed and generalized when resume
 * import was added, since extractPdfText and the AI extraction call were
 * never actually LinkedIn-specific — a resume PDF goes through the exact
 * same path. extractZipText stays LinkedIn-only, since the ZIP data-export
 * format is a LinkedIn-specific thing to begin with.
 *
 * jszip, pdfjs-dist, and mammoth are only ever imported from inside the
 * functions below (dynamic import), so none of them add to the main bundle
 * unless a user actually opens the relevant import tab.
 */

const MAX_ZIP_BYTES   = 20 * 1024 * 1024; // 20 MB — matches the plan's UX cap
// 10 MB — matches lib/storageService.ts's uploadResume cap. These used to be
// a stricter 5 MB, which meant a resume that uploaded successfully (under
// the real 10 MB storage limit) could then fail at Extract with a confusing
// "file too large" error. Keeping both caps in sync avoids that trap.
const MAX_PDF_BYTES   = 10 * 1024 * 1024;
const MAX_DOCX_BYTES  = 10 * 1024 * 1024;
const MAX_ENTRY_BYTES = 5  * 1024 * 1024; // per-file decompressed cap inside the zip (zip-bomb hygiene)

// LinkedIn's "Get a copy of your data" export ships these at the zip root.
// Matched case-insensitively on basename since export variants have shipped
// different casing over time.
const RELEVANT_CSV_NAMES = ['profile.csv', 'positions.csv', 'education.csv', 'skills.csv'];

/** Extract plain text from the relevant CSVs inside a LinkedIn data-export ZIP. */
export async function extractZipText(file: File): Promise<string> {
  if (file.size > MAX_ZIP_BYTES) throw new Error('ZIP file is too large (max 20 MB).');

  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(file);

  const sections: string[] = [];
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const basename = path.split('/').pop()?.toLowerCase() ?? '';
    if (!RELEVANT_CSV_NAMES.includes(basename)) continue;

    const text = await entry.async('string');
    if (text.length > MAX_ENTRY_BYTES) {
      // Zip-bomb hygiene — skip rather than throw, so one oversized entry
      // doesn't block extraction from the rest of a legitimate export.
      continue;
    }
    sections.push(`=== ${basename} ===\n${text}`);
  }

  if (sections.length === 0) {
    throw new Error('No LinkedIn profile data found in this ZIP — expected Profile.csv, Positions.csv, Education.csv, or Skills.csv.');
  }
  return sections.join('\n\n');
}

/** Extract plain text from a PDF — a LinkedIn "Save to PDF" export or a PDF resume. */
export async function extractPdfText(file: File | Blob): Promise<string> {
  if (file.size > MAX_PDF_BYTES) throw new Error('PDF file is too large (max 10 MB).');

  const pdfjsLib = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const pageTexts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pageTexts.push(content.items.map((item: any) => item.str ?? '').join(' '));
  }

  const text = pageTexts.join('\n').trim();
  if (!text) throw new Error('Could not find any readable text in this PDF — it may be a scanned image rather than a text-based document. Try exporting it again from the original source file.');
  return text;
}

/** Extract plain text from a .docx resume. Legacy .doc (binary format) is not supported. */
export async function extractDocxText(file: File | Blob): Promise<string> {
  if (file.size > MAX_DOCX_BYTES) throw new Error('Document is too large (max 10 MB).');

  const mammoth = await import('mammoth');
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });

  const text = (result.value ?? '').trim();
  if (!text) throw new Error('Could not read any text from this document.');
  return text;
}

export interface ExperienceDraft {
  role:      string;
  company:   string;
  startDate: string;
  endDate:   string;
  outcomes:  string[];
}

export interface ProfileExtraction {
  headline?:    string;
  bio?:         string;
  location?:    string;
  experiences:  ExperienceDraft[];
  skills:       string[];
}

function buildExtractionPrompt(rawText: string, sourceLabel: string): { system: string; prompt: string } {
  return {
    system: 'You extract structured professional profile data from a resume or LinkedIn export. Return ONLY valid JSON matching the requested shape — no markdown, no explanation, no commentary.',
    prompt: `Extract this person's professional profile from the ${sourceLabel} below. Return a single JSON object:
{
  "headline": "their professional headline, omit the key if not clearly present",
  "bio": "a short professional summary/about section, omit the key if not clearly present",
  "location": "city and country, omit the key if not clearly present",
  "experiences": [{ "role": "", "company": "", "startDate": "e.g. Jan 2020", "endDate": "e.g. Present", "outcomes": ["one or two short bullet points of what they did/achieved in this role"] }],
  "skills": ["skill name", "..."]
}
Only include information clearly present in the source text — never invent roles, dates, or skills. Return ONLY the JSON object, no markdown fences.

${sourceLabel}:
${rawText}`,
  };
}

/** Defensively coerce whatever the model returns into the real shape, dropping anything malformed rather than throwing. */
function sanitizeExtraction(raw: any): ProfileExtraction {
  const asString = (v: any): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const experiences: ExperienceDraft[] = Array.isArray(raw?.experiences)
    ? raw.experiences
        .filter((e: any) => e && typeof e === 'object' && asString(e.role) && asString(e.company))
        .map((e: any) => ({
          role:      asString(e.role)!,
          company:   asString(e.company)!,
          startDate: asString(e.startDate) ?? '',
          endDate:   asString(e.endDate) ?? '',
          outcomes:  Array.isArray(e.outcomes) ? e.outcomes.filter((o: any) => typeof o === 'string' && o.trim()) : [],
        }))
    : [];
  const skills: string[] = Array.isArray(raw?.skills)
    ? raw.skills.filter((s: any) => typeof s === 'string' && s.trim()).map((s: string) => s.trim())
    : [];

  return {
    headline: asString(raw?.headline),
    bio:      asString(raw?.bio),
    location: asString(raw?.location),
    experiences,
    skills,
  };
}

/**
 * Sends plain profile text to /api/ai and returns structured profile
 * fields. Mirrors App.tsx's handleGenerateSkillsGraph — same endpoint,
 * same auth, same markdown-fence-stripping before JSON.parse.
 *
 * sourceLabel only steers the prompt wording (e.g. "LinkedIn data" vs
 * "resume") so the model's framing matches what it is actually reading —
 * the JSON contract and parsing are identical either way.
 */
export async function extractProfileFromText(
  rawText: string,
  idToken: string,
  sourceLabel: string = 'LinkedIn data'
): Promise<ProfileExtraction> {
  const { system, prompt } = buildExtractionPrompt(rawText, sourceLabel);

  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
    body: JSON.stringify({ system, prompt, maxTokens: 2000 }),
  });
  if (!res.ok) throw new Error('AI extraction request failed.');

  const { text } = await res.json();
  const clean = (text ?? '').replace(/```json|```/g, '').trim();
  let parsed: any;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error('Could not parse the extracted profile data. Try again or paste the text directly.');
  }
  return sanitizeExtraction(parsed);
}
