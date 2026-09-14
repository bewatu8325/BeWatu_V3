import { AppData, User, Job, VerifiedSkill, CandidateSearchResult } from '../types';

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

// FIX: Added missing generateJobPostings function.
export const generateJobPostings = async (searchTerm: string, location: string): Promise<Job[]> => {
    const jobPostingsSchema = {
        type: 'ARRAY',
        description: `A list of 5-10 job postings matching the search criteria.`,
        items: appDataSchemaProperties.jobs.items
    };

    const prompt = `Generate a list of 5-10 realistic job postings for a professional networking site. 
The jobs should be related to the keyword "${searchTerm}" and located in or around "${location}".
For each job, provide all required fields. Company IDs and Recruiter IDs can be random integers between 1 and 10.
Ensure live dates are recent and expiry dates are in the near future. The status for all jobs should be 'Active'.`;

    try {
        const response = await callGeminiApi({
            model: 'gemini-2.5-pro',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: jobPostingsSchema
            }
        });
        const jsonText = response.text.trim();
        return JSON.parse(jsonText) as Job[];
    } catch (error) {
        console.error("Error generating job postings:", error);
        // Return an empty array on failure to avoid crashing the UI
        return [];
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