import { AppData, User, Job, VerifiedSkill, CandidateSearchResult } from '../types';
import type { ReputationProfile, Idea, Arena, Opportunity, TrustEdge } from '../types';

// Helper function to call our secure API gateway
async function callGeminiApi(body: object): Promise<any> {
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("API Gateway Error:", errorBody);
    throw new Error('Failed to call the Gemini API via the secure gateway.');
  }
  
  // The gateway forwards Gemini's response structure
  return response.json();
}

// Re-add the full schema definition for AppData for use in the generate function
const appDataSchemaProperties = {
    users: {
      type: 'ARRAY',
      description: 'A list of 10 professional users with rich, detailed profiles. Make the second and third users recruiters by setting isRecruiter to true. Add a plausible phone number for some users.',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'INTEGER' },
          name: { type: 'STRING' },
          headline: { type: 'STRING' },
          bio: { type: 'STRING' },
          avatarUrl: { type: 'STRING', description: 'A placeholder image URL from picsum.photos, e.g., https://picsum.photos/100' },
          industry: { type: 'STRING' },
          professionalGoals: { type: 'ARRAY', items: { type: 'STRING' } },
          reputation: { type: 'INTEGER' },
          credits: { type: 'INTEGER' },
          isRecruiter: { type: 'BOOLEAN' },
          phone: { type: 'STRING', description: 'Optional phone number for the user in E.164 format.'},
          portfolio: {
            type: 'ARRAY',
            description: 'A list of 2-3 projects for the user.',
            items: {
              type: 'OBJECT',
              properties: {
                id: { type: 'INTEGER' },
                title: { type: 'STRING' },
                description: { type: 'STRING' },
                technologies: { type: 'ARRAY', items: { type: 'STRING' } },
                url: { type: 'STRING', description: 'A plausible fictional URL.' },
                outcome: { type: 'STRING' },
                aiGeneratedSummary: { type: 'STRING', description: 'A 1-sentence AI summary of skills demonstrated in this project.' },
              },
              required: ['id', 'title', 'description', 'technologies', 'url', 'outcome', 'aiGeneratedSummary'],
            }
          },
          verifiedAchievements: {
            type: 'ARRAY',
            description: '1-2 peer-verified achievements.',
            items: {
              type: 'OBJECT',
              properties: {
                id: { type: 'INTEGER' },
                achievement: { type: 'STRING' },
                verifierName: { type: 'STRING' },
                verifierTitle: { type: 'STRING' },
                verifierCompany: { type: 'STRING' },
              },
              required: ['id', 'achievement', 'verifierName', 'verifierTitle', 'verifierCompany'],
            }
          },
          thirdPartyIntegrations: {
            type: 'ARRAY',
            description: '1-2 integrations with platforms like GitHub or Figma.',
            items: {
              type: 'OBJECT',
              properties: {
                platform: { type: 'STRING', enum: ['GitHub', 'Figma', 'Dribbble', 'Kaggle', 'Notion'] },
                url: { type: 'STRING' },
                verified: { type: 'BOOLEAN' },
              },
              required: ['platform', 'url', 'verified'],
            }
          },
          workStyle: {
            type: 'OBJECT',
            properties: {
              collaboration: { type: 'STRING', enum: ['Prefers solo work', 'Thrives in pairs', 'Excels in large teams'] },
              communication: { type: 'STRING', enum: ['Prefers asynchronous', 'Prefers real-time meetings'] },
              workPace: { type: 'STRING', enum: ['Fast-paced and iterative', 'Steady and methodical'] },
            },
            required: ['collaboration', 'communication', 'workPace'],
          },
          values: { type: 'ARRAY', description: '2-3 professional values like "Continuous Learning", "User-Centricity", "Team Ownership".', items: { type: 'STRING' } },
          availability: { type: 'STRING', enum: ['Immediate', '2 weeks notice', 'Exploring opportunities'] },
          skills: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, endorsements: { type: 'INTEGER' } } } },
          verifiedSkills: { type: 'NULL' },
          microIntroductionUrl: { type: 'NULL' },
        },
        required: ['id', 'name', 'headline', 'bio', 'avatarUrl', 'industry', 'professionalGoals', 'reputation', 'credits', 'isRecruiter', 'portfolio', 'verifiedAchievements', 'thirdPartyIntegrations', 'workStyle', 'values', 'availability', 'skills', 'verifiedSkills', 'microIntroductionUrl']
      }
    },
    companies: {
        type: 'ARRAY',
        description: "A list of 10 unique companies.",
        items: {
            type: 'OBJECT',
            properties: {
                id: { type: 'INTEGER' },
                name: { type: 'STRING' },
                description: { type: 'STRING' },
                industry: { type: 'STRING' },
                logoUrl: { type: 'STRING', description: "e.g., https://picsum.photos/seed/{companyName}/100" },
                website: { type: 'STRING' }
            },
            required: ['id', 'name', 'description', 'industry', 'logoUrl', 'website']
        }
    },
    posts: {
      type: 'ARRAY',
      description: 'A list of 15 professional posts.',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'INTEGER' },
          authorId: { type: 'INTEGER' },
          content: { type: 'STRING' },
          appreciations: {
            type: 'OBJECT',
            properties: {
                helpful: { type: 'INTEGER' },
                thoughtProvoking: { type: 'INTEGER' },
                collaborationReady: { type: 'INTEGER' }
            },
            required: ['helpful', 'thoughtProvoking', 'collaborationReady']
          },
          comments: { type: 'INTEGER' },
          shares: { type: 'INTEGER' },
          timestamp: { type: 'STRING' },
          circleId: { type: 'INTEGER' }
        },
        required: ['id', 'authorId', 'content', 'appreciations', 'comments', 'shares', 'timestamp']
      }
    },
    jobs: {
      type: 'ARRAY',
      description: 'A list of 20 job postings. Assign a recruiterId for each from the recruiter users. Include liveDate and expiryDate for each.',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'INTEGER' },
          title: { type: 'STRING' },
          companyId: { type: 'INTEGER' },
          location: { type: 'STRING' },
          description: { type: 'STRING' },
          type: { type: 'STRING', enum: ['Full-time', 'Contract', 'Internship', 'Remote'] },
          experienceLevel: { type: 'STRING', enum: ['Entry-level', 'Mid-level', 'Senior-level'] },
          status: { type: 'STRING', enum: ['Active', 'Suspended'] },
          recruiterId: { type: 'INTEGER' },
          liveDate: { type: 'STRING', description: 'ISO 8601 date string, e.g., "2024-08-01"' },
          expiryDate: { type: 'STRING', description: 'ISO 8601 date string, e.g., "2024-09-01"' },
        },
        required: ['id', 'title', 'companyId', 'location', 'description', 'type', 'experienceLevel', 'status', 'recruiterId', 'liveDate', 'expiryDate']
      }
    },
    messages: {
        type: 'ARRAY',
        description: 'A list of 25 direct messages.',
        items: {
            type: 'OBJECT',
            properties: {
                id: { type: 'INTEGER' },
                senderId: { type: 'INTEGER' },
                receiverId: { type: 'INTEGER' },
                text: { type: 'STRING' },
                timestamp: { type: 'STRING' },
                isRead: { type: 'BOOLEAN' }
            },
            required: ['id', 'senderId', 'receiverId', 'text', 'timestamp', 'isRead']
        }
    },
    connectionRequests: {
        type: 'ARRAY',
        description: "A list of 5 connection requests.",
        items: {
            type: 'OBJECT',
            properties: {
                id: { type: 'INTEGER' },
                fromUserId: { type: 'INTEGER' },
                toUserId: { type: 'INTEGER' },
                status: { type: 'STRING', enum: ['pending', 'accepted', 'declined'] }
            },
            required: ['id', 'fromUserId', 'toUserId', 'status']
        }
    },
    notifications: {
        type: 'ARRAY',
        description: "A list of 10 notifications for the first user (userId: 1).",
        items: {
            type: 'OBJECT',
            properties: {
                id: { type: 'INTEGER' },
                userId: { type: 'INTEGER' },
                type: { type: 'STRING', enum: ['MESSAGE', 'ENDORSEMENT', 'CONNECTION_REQUEST', 'CONNECTION_ACCEPTED', 'SECURITY_ALERT'] },
                text: { type: 'STRING' },
                read: { type: 'BOOLEAN' },
                timestamp: { type: 'STRING' },
                relatedId: { type: 'INTEGER' }
            },
            required: ['id', 'userId', 'type', 'text', 'read', 'timestamp']
        }
    },
    circles: {
      type: 'ARRAY',
      description: "A list of 5 micro-communities (Circles).",
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'INTEGER' },
          name: { type: 'STRING' },
          description: { type: 'STRING' },
          members: { type: 'ARRAY', items: { type: 'INTEGER' } },
          adminId: { type: 'INTEGER' }
        },
        required: ['id', 'name', 'description', 'members', 'adminId']
      }
    },
    articles: {
      type: 'ARRAY',
      description: "A list of 5-7 long-form articles.",
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'INTEGER' },
          circleId: { type: 'INTEGER' },
          authorId: { type: 'INTEGER' },
          title: { type: 'STRING' },
          content: { type: 'STRING' },
          timestamp: { type: 'STRING' }
        },
        required: ['id', 'circleId', 'authorId', 'title', 'content', 'timestamp']
      }
    }
  };
const appDataSchema = {
    type: 'OBJECT',
    properties: appDataSchemaProperties,
    required: ['users', 'posts', 'jobs', 'companies', 'messages', 'connectionRequests', 'notifications', 'circles', 'articles']
}

// Schemas copied here for completeness
const verifiedSkillsSchema = {
    type: 'ARRAY',
    items: {
        type: 'OBJECT',
        properties: {
            name: { type: 'STRING' },
            proficiency: { type: 'STRING', enum: ['Beginner', 'Intermediate', 'Proficient', 'Expert'] },
            evidence: { type: 'STRING' }
        },
        required: ['name', 'proficiency', 'evidence']
    }
};

const candidateSearchSchema = {
    type: 'ARRAY',
    items: {
        type: 'OBJECT',
        properties: {
            userId: { type: 'INTEGER', description: 'The ID of the matched user.' },
            aiAnalysis: {
                type: 'OBJECT',
                properties: {
                    matchReasoning: { type: 'STRING', description: 'A concise, 2-3 sentence summary of why this candidate is a strong match for the query.' },
                    strengths: { type: 'ARRAY', items: { type: 'STRING' }, description: 'A list of 3 key strengths relevant to the query.' },
                    potentialRedFlags: { type: 'ARRAY', items: { type: 'STRING' }, description: 'A list of 1-2 potential areas to probe during an interview.' },
                    cultureFitAnalysis: { type: 'STRING', description: 'A brief analysis of their potential culture fit based on their values and work style.' },
                    personalityMarkers: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Identify 2-3 personality markers from their bio and projects (e.g., "Detail-oriented", "Proactive", "Creative problem-solver").' },
                    predictiveScores: {
                        type: 'OBJECT',
                        properties: {
                            roleFit: { type: 'INTEGER', description: 'Score (1-100) for how well their hard skills and portfolio match the role implied by the query.' },
                            cultureFit: { type: 'INTEGER', description: 'Score (1-100) based on their stated values and work style.' },
                            mutualSuccessPotential: { type: 'INTEGER', description: 'Score (1-100) predicting the likelihood of a successful long-term fit for both candidate and company.' },
                        },
                        required: ['roleFit', 'cultureFit', 'mutualSuccessPotential'],
                    },
                    interviewQuestions: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Generate 2-3 tailored interview questions to ask this specific candidate.' },
                },
                 required: ['matchReasoning', 'strengths', 'potentialRedFlags', 'cultureFitAnalysis', 'personalityMarkers', 'predictiveScores', 'interviewQuestions'],
            }
        },
        required: ['userId', 'aiAnalysis']
    }
};


export const generateProfessionalNetworkData = async (): Promise<AppData> => {
    const userLanguage = navigator.language.split('-')[0];
    const languageInstruction = userLanguage === 'es' 
        ? "IMPORTANT: The entire generated dataset, including all names, headlines, bios, project descriptions, company names, job titles, etc., MUST be in Spanish."
        : "";

    console.log(`Generating professional network data in ${userLanguage === 'es' ? 'Spanish' : 'English'} via secure gateway...`);
  
    const prompt = `Generate a realistic and diverse dataset for a professional networking application called 'BeWatu'. The dataset needs to be incredibly rich to power an advanced recruiter console. ${languageInstruction}
  
  For each of the 10 users, create a deep profile including:
  - Standard info: name, headline, bio, etc.
  - An optional phone number for some users in E.164 format (e.g., +14155552671).
  - A portfolio of 2-3 detailed projects, each with a title, description, technologies, a URL, a measurable outcome, and a 1-sentence AI-generated summary of skills demonstrated.
  - 1-2 peer-verified achievements, including who verified them.
  - 1-2 third-party integrations (GitHub, Figma, Dribbble etc.) with plausible URLs.
  - A defined work style (collaboration, communication, pace).
  - 2-3 professional values.
  - Current availability status.
  - Set 'isRecruiter' to true for a couple of users to test dual-role functionality.

  Then, generate the rest of the dataset:
  - Companies, posts, jobs, messages, connection requests, notifications, circles, and articles as before.
  - For jobs, ensure each has a 'status' ('Active' or 'Suspended'), a 'recruiterId', a 'liveDate' (ISO 8601 string), and an 'expiryDate' (ISO 8601 string). Make some live dates in the past, some in the future, and some expired.
  - Ensure all IDs and references are valid and consistent. The first user (id: 1) is the main user.`;
    
    const response = await callGeminiApi({
        model: 'gemini-2.5-pro',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: appDataSchema,
        }
    });

    const jsonText = response.text.trim();
    try {
        const data = JSON.parse(jsonText);
        console.log("Successfully generated and parsed data:", data);
        return data as AppData;
    } catch (error) {
        console.error("Failed to parse JSON response:", jsonText, error);
        throw new Error("Received invalid JSON from the API gateway.");
    }
};

export const analyzeSynergy = async (currentUser: User, otherUser: User): Promise<string> => {
    const prompt = `You are a career co-pilot. Analyze the synergy between two professionals and provide actionable insights. Your response should be in markdown format.

**Current User Profile:**
- Name: ${currentUser.name}
- Headline: ${currentUser.headline}
- Bio: ${currentUser.bio}
- Skills: ${currentUser.skills.map(s => s.name).join(', ')}
- Professional Goals: ${currentUser.professionalGoals.join(', ')}
- Values: ${currentUser.values.join(', ')}

**Other User Profile:**
- Name: ${otherUser.name}
- Headline: ${otherUser.headline}
- Bio: ${otherUser.bio}
- Skills: ${otherUser.skills.map(s => s.name).join(', ')}
- Professional Goals: ${otherUser.professionalGoals.join(', ')}
- Values: ${otherUser.values.join(', ')}

**Analysis Required:**
Based on their profiles, generate a concise but insightful synergy analysis covering:
1.  **## Key Complementary Skills:** Identify skills each person has that the other lacks, creating a powerful combination.
2.  **## Potential Collaboration Areas:** Suggest 2-3 specific project types or initiatives where they could excel together.
3.  **## Shared Values & Goals:** Highlight common ground in their stated values and goals that could foster a strong working relationship.
4.  **## Conversation Starter:** Suggest a thoughtful, specific question the current user could ask to initiate a meaningful conversation.`;
    try {
        const response = await callGeminiApi({
            model: 'gemini-2.5-flash',
            contents: prompt
        });
        return response.text.trim();
    } catch (error) {
        console.error("Error analyzing synergy:", error);
        return "Sorry, I couldn't perform the synergy analysis right now.";
    }
};

export const analyzeJobMatch = async (user: User, job: Job, companyName: string): Promise<string> => {
    const prompt = `You are a career co-pilot. Analyze how well a candidate's profile matches a job description and provide a structured, markdown-formatted report for the candidate.

**Candidate Profile:**
- Name: ${user.name}
- Headline: ${user.headline}
- Bio: ${user.bio}
- Skills: ${user.skills.map(s => s.name).join(', ')}
- Verified Skills: ${user.verifiedSkills?.map(s => `${s.name} (${s.proficiency})`).join(', ') || 'None'}
- Portfolio Highlights: ${user.portfolio.map(p => p.title).join(', ')}
- Values: ${user.values.join(', ')}

**Job Details:**
- Title: ${job.title}
- Company: ${companyName}
- Description: ${job.description}
- Experience Level: ${job.experienceLevel}

**Analysis Required:**
Generate a report with the following sections:
1.  **## Overall Fit:** A brief, encouraging summary of the match percentage and why it's a promising opportunity.
2.  **## Key Strengths:** Create a bulleted list of 3-4 specific ways the candidate's skills and experience align with the job description. Directly reference parts of their profile and the job description.
3.  **## Potential Gaps to Address:** Create a bulleted list of 1-2 areas where the profile might not perfectly align and suggest how the candidate could frame their experience to address these in a cover letter or interview.
4.  **## Suggested Interview Questions:** Provide 2-3 insightful questions the candidate should ask the interviewer to demonstrate their interest and assess culture fit.`;
    try {
        const response = await callGeminiApi({
            model: 'gemini-2.5-flash',
            contents: prompt
        });
        return response.text.trim();
    } catch (error) {
        console.error("Error analyzing job match:", error);
        return "Sorry, I couldn't analyze the job match right now.";
    }
};

export const generatePost = async (topic: string, user: User): Promise<string> => {
    const prompt = `You are a career co-pilot helping a user draft a professional social media post for the BeWatu network. Your tone should be professional, engaging, and reflective of the user's personality.

**User Profile:**
- Name: ${user.name}
- Headline: ${user.headline}
- Bio: ${user.bio}
- Industry: ${user.industry}

**Topic provided by user:**
"${topic}"

**Instructions:**
1.  Draft a concise and engaging post (2-3 paragraphs) based on the user's topic.
2.  Incorporate relevant industry keywords.
3.  End with an open-ended question to encourage engagement and comments.
4.  Include 3-5 relevant hashtags (e.g., #${user.industry.replace(/\s+/g, '')}, #${topic.split(' ')[0]}).
5.  Adopt a tone consistent with the user's headline and bio (e.g., if they are "Passionate about building the future", be forward-looking and optimistic).`;
    try {
        const response = await callGeminiApi({
            model: 'gemini-2.5-flash',
            contents: prompt
        });
        return response.text.trim();
    } catch (error) {
        console.error("Error generating post:", error);
        return `I had some trouble drafting that. Could you try a different topic? Original topic: "${topic}"`;
    }
};

export const generateSkillsGraph = async (resume: string, digitalFootprint: string, references: string): Promise<VerifiedSkill[]> => {
    const prompt = `As a career co-pilot AI, analyze the following professional information to generate a verified skills graph. For each skill, determine the proficiency level and provide a piece of evidence from the text to justify your assessment.

**Input Sources:**
1.  **Resume/CV:**
    ${resume}

2.  **Digital Footprint (Portfolio, GitHub, etc.):**
    ${digitalFootprint}

3.  **References/Testimonials:**
    ${references}

**Instructions:**
- Identify distinct technical and soft skills.
- Assign a proficiency level: 'Beginner', 'Intermediate', 'Proficient', or 'Expert'.
- For each skill, extract a direct quote or a concise summary from the provided text as 'evidence'.
- The output MUST be a valid JSON array matching the provided schema. Do not include any explanatory text outside the JSON structure.`;
    try {
        const response = await callGeminiApi({
            model: 'gemini-2.5-pro',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: verifiedSkillsSchema
            }
        });
        const jsonText = response.text.trim();
        return JSON.parse(jsonText) as VerifiedSkill[];
    } catch (error) {
        console.error("Error generating skills graph:", error);
        throw new Error("Failed to generate skills graph from the API gateway.");
    }
};

export const generateJobDescription = async (title: string, keywords: string): Promise<string> => {
    const prompt = `You are an expert recruiting assistant. Generate a professional, compelling, and inclusive job description based on the provided title and keywords. The output should be well-structured markdown.

**Job Title:** ${title}

**Keywords/Core Responsibilities:** ${keywords}

**Instructions:**
1.  **Introduction:** Start with a brief, exciting paragraph about the company's mission and the impact this role will have.
2.  **What You'll Do:** Create a bulleted list of 5-7 key responsibilities based on the provided keywords. Use action verbs.
3.  **What You'll Bring:** Create a bulleted list of essential qualifications (skills, experience). Differentiate between "must-haves" and "nice-to-haves" if possible. Use inclusive language (e.g., "familiarity with" instead of "expert in").
4.  **Why You'll Love It Here:** Create a bulleted list highlighting 3-4 key benefits or aspects of the company culture.
5.  **Closing:** End with an encouraging call to action. Ensure the entire description is free of corporate jargon and gendered language.`;
    try {
        const response = await callGeminiApi({
            model: 'gemini-2.5-flash',
            contents: prompt
        });
        return response.text.trim();
    } catch (error) {
        console.error("Error generating job description:", error);
        return "Sorry, I couldn't generate a job description right now. Please try again.";
    }
};

export const analyzeMessageTone = async (message: string): Promise<string> => {
    const prompt = `You are a communication co-pilot. Analyze the tone of the following message draft and provide constructive feedback. The goal is to ensure the message is professional, clear, and effective for a professional networking context.

**Message Draft:**
"${message}"

**Analysis Required:**
Provide a concise, bulleted list of feedback covering:
- **Overall Tone:** Describe the perceived tone (e.g., "Friendly and professional," "A bit too casual," "Slightly demanding").
- **Clarity:** Is the purpose of the message clear? Is the call to action obvious?
- **Suggestions for Improvement:** Offer 1-2 specific suggestions to improve the message's effectiveness or tone. If it's already good, say so and explain why.`;
    try {
        const response = await callGeminiApi({
            model: 'gemini-2.5-flash',
            contents: prompt
        });
        return response.text.trim();
    } catch (error) {
        console.error("Error analyzing message tone:", error);
        return "Sorry, I couldn't analyze the message tone right now.";
    }
};

export const polishMessage = async (message: string): Promise<string> => {
    const prompt = `You are a helpful communication assistant. A user is writing a message to connect with the team behind the BeWatu professional network. Polish the following draft to make it sound more professional, clear, and engaging, while preserving the user's core intent. Do not add any preamble or explanation, just return the polished message text.

**User's Draft:**
"${message}"

**Polished Message:**`;
    try {
        const response = await callGeminiApi({
            model: 'gemini-2.5-flash',
            contents: prompt
        });
        return response.text.trim();
    } catch (error) {
        console.error("Error polishing message:", error);
        return "Sorry, I couldn't polish the message right now.";
    }
};

export const searchCandidates = async (
    allUsers: User[], 
    query: string,
): Promise<CandidateSearchResult[]> => {
    const prompt = `You are an expert AI Recruiter Co-pilot for the BeWatu professional network. Your task is to analyze a natural language query from a recruiter and find the best matching candidates from a provided list of users. You must return a ranked list of candidates that strictly adheres to the provided JSON schema.

**Instructions:**
1.  Carefully analyze the **RECRUITER QUERY** to understand the core requirements, including skills, experience, industry, values, and any implicit intent.
2.  Systematically evaluate each candidate in the **AVAILABLE CANDIDATES (JSON)** against the query.
3.  For each candidate you identify as a potential match, generate a detailed \`aiAnalysis\` object.
4.  The \`predictiveScores\` are critical. Base them on a holistic view:
    - \`roleFit\`: How well do their hard skills, projects, and achievements match the technical aspects of the query?
    - \`cultureFit\`: How well do their stated values, work style, and bio align with the implicit cultural needs of the query (e.g., "fast-paced environment", "collaborative team")?
    - \`mutualSuccessPotential\`: Your overall confidence score that this would be a great long-term fit for both the candidate and the company. This should be the primary ranking factor.
5.  Ensure all fields in the JSON schema are populated with high-quality, concise, and relevant information. The \`interviewQuestions\` should be tailored specifically to the candidate's profile in relation to the query.
6.  The final output must be a valid JSON array of objects. Do not include any text outside the JSON.

**RECRUITER QUERY:** "${query}"

**AVAILABLE CANDIDATES (JSON):**
${JSON.stringify(allUsers.filter(u => !u.isRecruiter), null, 2)}`;

    try {
        const response = await callGeminiApi({
            model: 'gemini-2.5-pro',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: candidateSearchSchema
            }
        });
        const jsonText = response.text.trim();
        const searchResults = JSON.parse(jsonText);
        
        return searchResults.map((result: { userId: number, aiAnalysis: any }) => {
            const user = allUsers.find(u => u.id === result.userId);
            return user ? { user, aiAnalysis: result.aiAnalysis } : null;
        }).filter(Boolean) as CandidateSearchResult[];

    } catch (error) {
        console.error("Error searching candidates:", error);
        throw new Error("Failed to perform candidate search with the API gateway.");
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 5 — AI LAYER UPGRADE
// Append these functions to services/geminiService.ts
// ─────────────────────────────────────────────────────────────────────────────
//
// New functions:
//   generateReputationNarrative    — human-readable trust summary for a profile
//   synthesizeArenaOutcome         — post-arena debrief & learning summary
//   generateOpportunityInsight     — explains why a user matches (or doesn't) an opportunity
//   generateIdeaRefinement         — improves an idea brief using domain knowledge
//   findReputationPathways         — suggests actions to improve trust in target domain
//   generateArenaBrief             — creates a challenge brief from an idea + domain context
//
// All functions use graph context (reputation profile, trust edges, arena history)
// passed from the calling component — no new Firebase reads inside geminiService.

// ─── Helpers ──────────────────────────────────────────────────────────────────

function profileSummary(profile: ReputationProfile): string {
  if (!profile) return 'No reputation data available.';
  const topDomains = [...profile.domains]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(d => `${d.name} (${d.score}/1000, ${d.tier})`)
    .join(', ');
  return `Overall score: ${profile.overallScore}. Trajectory: ${profile.trajectory}. Top domains: ${topDomains}. Total evidence signals: ${profile.totalEvidenceCount}.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. REPUTATION NARRATIVE
// Generates a 2–3 sentence human-readable summary of a user's trust profile.
// Used in: ProfilePage sidebar, RecruiterConsole candidate detail
// ─────────────────────────────────────────────────────────────────────────────

export const generateReputationNarrative = async (
  userName: string,
  profile: ReputationProfile,
  recentEdges: TrustEdge[],
  isOwnProfile: boolean
): Promise<string> => {
  const edgeSummary = recentEdges.slice(0, 5)
    .map(e => `${e.evidenceType} in ${e.domain} (strength ${e.strength})`)
    .join('; ');

  const pronoun = isOwnProfile ? 'You have' : `${userName} has`;
  const prompt = `You are BeWatu's AI career intelligence layer. Write a 2–3 sentence professional narrative summarising this person's trust profile. Be specific, warm, and forward-looking. Do not use filler phrases like "beacon of" or "testament to".

**Profile:**
${profileSummary(profile)}

**Recent trust signals:**
${edgeSummary || 'None yet.'}

**Instructions:**
- Name the person's strongest domain(s) with concrete tier info
- Mention their trajectory (${profile.trajectory})
- End with one actionable next step to grow their reputation
- Start with "${pronoun}" — do not start with their name
- Max 60 words`;

  const response = await callGeminiApi({ model: 'gemini-2.5-flash', contents: prompt });
  return response.text.trim();
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. ARENA SYNTHESIS
// Post-arena debrief: what was learned, who stood out, key insights.
// Used in: ArenaView closed phase
// ─────────────────────────────────────────────────────────────────────────────

export const synthesizeArenaOutcome = async (
  arena: Arena,
  submissions: { authorName: string; content: string; isWinner: boolean; reactionScore: number }[],
  participants: { displayName: string }[]
): Promise<{ summary: string; keyInsights: string[]; winnerReasoning: string }> => {
  const subText = submissions.map(s =>
    `[${s.isWinner ? 'WINNER' : 'Submission'}] ${s.authorName} (reaction score: ${s.reactionScore}): ${s.content.slice(0, 300)}`
  ).join('\n\n');

  const prompt = `You are BeWatu's AI arena synthesizer. Analyze this completed Arena and produce structured insights.

**Arena:** "${arena.title}"
**Brief:** ${arena.brief}
**Domain:** ${arena.domain}
**Participants:** ${participants.map(p => p.displayName).join(', ')}

**Submissions:**
${subText}

Respond ONLY in this exact JSON format (no markdown, no preamble):
{
  "summary": "2-3 sentence summary of the arena — what problem was tackled and what emerged",
  "keyInsights": ["insight 1", "insight 2", "insight 3"],
  "winnerReasoning": "1-2 sentences explaining why the winning submission stood out"
}`;

  const response = await callGeminiApi({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: { responseMimeType: 'application/json' },
  });

  try {
    const text = response.text.replace(/```json|```/g, '').trim();
    return JSON.parse(text);
  } catch {
    return {
      summary: 'Arena completed successfully.',
      keyInsights: ['Participants demonstrated strong domain expertise.'],
      winnerReasoning: 'The winning submission best addressed the brief.',
    };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. OPPORTUNITY INSIGHT
// Explains why a user matches (or doesn't match) an opportunity.
// Used in: OpportunityFeed card expanded view, RecruiterConsole candidate match
// ─────────────────────────────────────────────────────────────────────────────

export const generateOpportunityInsight = async (
  userName: string,
  profile: ReputationProfile,
  opportunity: Opportunity,
  matchScore: number
): Promise<string> => {
  const prompt = `You are BeWatu's AI matching intelligence. In 2–3 sentences, explain to ${userName} why they are a ${matchScore}% match for this opportunity. Be honest and specific. If the score is low, be constructive.

**User reputation:**
${profileSummary(profile)}

**Opportunity:** ${opportunity.title} at ${opportunity.companyName}
**Domain:** ${opportunity.primaryDomain}
**Level:** ${opportunity.experienceLevel}
**Trust requirements:** ${opportunity.trustRequirements.map(r => `${r.domain} ≥ ${r.minTrustScore}`).join(', ') || 'None specified'}

Keep it under 50 words. Start with "Your" not with the person's name.`;

  const response = await callGeminiApi({ model: 'gemini-2.5-flash', contents: prompt });
  return response.text.trim();
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. IDEA REFINEMENT
// Takes a raw idea and returns an improved version with sharper brief and
// a suggested Arena structure.
// Used in: IdeaNetwork — "Refine with AI" button on idea cards
// ─────────────────────────────────────────────────────────────────────────────

export const generateIdeaRefinement = async (
  idea: Idea,
  authorProfile: ReputationProfile | null
): Promise<{ refinedTitle: string; refinedBrief: string; suggestedArenaStructure: string }> => {
  const domainContext = authorProfile?.domains.find(d => d.name === idea.domain);

  const prompt = `You are BeWatu's AI idea coach. A user has posted an idea and wants help sharpening it into an Arena-ready problem statement.

**Original Idea:**
Title: ${idea.title}
Body: ${idea.body}
Domain: ${idea.domain}
Current sparks: ${idea.sparkCount}

**Author's domain standing:** ${domainContext ? `${idea.domain} score ${domainContext.score}/1000, ${domainContext.tier} tier` : 'No domain data'}

Respond ONLY in this exact JSON format (no markdown, no preamble):
{
  "refinedTitle": "sharper, more specific title (max 80 chars)",
  "refinedBrief": "rewritten problem statement — concrete, specific, solvable in a 30-min arena. Include success criteria. 60–120 words.",
  "suggestedArenaStructure": "1–2 sentences describing what the ideal submission would look like and how participants would be evaluated"
}`;

  const response = await callGeminiApi({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: { responseMimeType: 'application/json' },
  });

  try {
    const text = response.text.replace(/```json|```/g, '').trim();
    return JSON.parse(text);
  } catch {
    return {
      refinedTitle: idea.title,
      refinedBrief: idea.body,
      suggestedArenaStructure: 'Open submissions with peer review and vote.',
    };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. REPUTATION PATHWAYS
// Suggests 3 concrete actions to improve trust in a target domain.
// Used in: ReputationPanel — "How to improve" button
// ─────────────────────────────────────────────────────────────────────────────

export const findReputationPathways = async (
  userName: string,
  profile: ReputationProfile,
  targetDomain: string
): Promise<{ action: string; impact: 'high' | 'medium' | 'low'; description: string }[]> => {
  const currentDomain = profile.domains.find(d => d.name === targetDomain);

  const prompt = `You are BeWatu's AI reputation coach. Suggest exactly 3 concrete actions ${userName} can take on the BeWatu platform to grow their trust in ${targetDomain}.

**Current ${targetDomain} standing:** ${currentDomain ? `Score ${currentDomain.score}/1000, ${currentDomain.tier} tier, ${currentDomain.edgeCount} trust edges` : 'No standing yet'}
**Overall profile:** ${profileSummary(profile)}

BeWatu trust is earned through: completing skill challenges, running or participating in Arenas, creating micro-lessons in Pods, endorsing others' skills, posting Arena-ready Ideas.

Respond ONLY in this exact JSON format (no markdown, no preamble):
[
  { "action": "short action title", "impact": "high|medium|low", "description": "1 sentence of specific guidance" },
  { "action": "short action title", "impact": "high|medium|low", "description": "1 sentence of specific guidance" },
  { "action": "short action title", "impact": "high|medium|low", "description": "1 sentence of specific guidance" }
]`;

  const response = await callGeminiApi({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: { responseMimeType: 'application/json' },
  });

  try {
    const text = response.text.replace(/```json|```/g, '').trim();
    return JSON.parse(text);
  } catch {
    return [
      { action: 'Participate in an Arena', impact: 'high', description: `Join or host a ${targetDomain} Arena to earn strong trust signals from peers.` },
      { action: 'Complete a Challenge', impact: 'high', description: `Submit to a ${targetDomain} Skill Challenge to earn verified evidence.` },
      { action: 'Post a micro-lesson', impact: 'medium', description: `Share a tip in a Pod focused on ${targetDomain} to earn peer learning trust.` },
    ];
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. ARENA BRIEF GENERATOR
// Creates a structured Arena brief from a topic + domain.
// Used in: CreateArenaModal — "Generate brief" button
// ─────────────────────────────────────────────────────────────────────────────

export const generateArenaBrief = async (
  topic: string,
  domain: string,
  durationMinutes: number,
  hostProfile: ReputationProfile | null
): Promise<{ title: string; brief: string }> => {
  const prompt = `You are BeWatu's AI arena designer. Create a focused, solvable Arena brief for a ${durationMinutes}-minute live collaboration session.

**Topic:** ${topic}
**Domain:** ${domain}
**Host domain standing:** ${hostProfile?.domains.find(d => d.name === domain)?.tier ?? 'newcomer'} in ${domain}

Requirements for the brief:
- Must be solvable in ${durationMinutes} minutes by one person
- Concrete deliverable (not "think about X" — "build/write/design X")
- Specific enough that participants know when they're done
- Include what a strong submission would contain

Respond ONLY in this exact JSON format (no markdown, no preamble):
{
  "title": "Arena title (max 80 chars)",
  "brief": "Full problem statement with context, constraints, and success criteria. 80–150 words."
}`;

  const response = await callGeminiApi({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: { responseMimeType: 'application/json' },
  });

  try {
    const text = response.text.replace(/```json|```/g, '').trim();
    return JSON.parse(text);
  } catch {
    return { title: topic, brief: `Design and build a solution for: ${topic}` };
  }
};
