export interface VerifiedSkill {
  name: string;
  proficiency: 'Beginner' | 'Intermediate' | 'Proficient' | 'Expert';
  evidence: string;
}

export interface ThirdPartyIntegration {
    platform: 'GitHub' | 'Figma' | 'Dribbble' | 'Kaggle' | 'Notion';
    url: string;
    verified: boolean;
}

export interface Project {
    id: number;
    title: string;
    description: string;
    technologies: string[];
    url: string;
    outcome: string; // Measurable outcome, e.g., "Increased user engagement by 15%"
    aiGeneratedSummary: string; // AI summary of skills demonstrated
}

export interface VerifiedAchievement {
    id: number;
    achievement: string;
    verifierName: string;
    verifierTitle: string;
    verifierCompany: string;
}

export interface WorkStyle {
    collaboration: 'Prefers solo work' | 'Thrives in pairs' | 'Excels in large teams';
    communication: 'Prefers asynchronous' | 'Prefers real-time meetings';
    workPace: 'Fast-paced and iterative' | 'Steady and methodical';
}

export interface User {
  id: number;
  name: string;
  headline: string;
  bio: string;
  avatarUrl: string;
  industry: string;
  professionalGoals: string[];
  reputation: number;
  credits: number;
  isRecruiter: boolean;
  stripeCustomerId?: string;
  phone?: string;
  isVerified: boolean;
  
  // Proof of work
  portfolio: Project[];
  verifiedAchievements: VerifiedAchievement[];
  thirdPartyIntegrations: ThirdPartyIntegration[];
  workStyle: WorkStyle;
  values: string[];
  availability: 'Immediate' | '2 weeks notice' | 'Exploring opportunities';

  // Legacy skills - can be deprecated or used for keyword matching
  skills: { name: string; endorsements: number }[];
  verifiedSkills: VerifiedSkill[] | null;
  microIntroductionUrl: string | null;
  microIntroductionThumbnail?: string | null;
  resumeUrl?: string | null;
  experiences?: Experience[];
  privacySettings?: PrivacySettings;
  followersCount?: number;
  followingCount?: number;
  followingCompanies?: string[]; // firestoreIds
  _firestoreUid?: string;
}

export interface PrivacySettings {
  allowConnectionRequests: boolean;   // others can send connect requests
  allowFollow: boolean;               // others can follow without connecting
  visibleToRecruiters: boolean;       // profile shows in recruiter searches
  profileVisibility: 'public' | 'connections' | 'private';
}

export const DEFAULT_PRIVACY: PrivacySettings = {
  allowConnectionRequests: true,
  allowFollow: true,
  visibleToRecruiters: true,
  profileVisibility: 'public',
};

export interface Experience {
  id: string;
  role: string;
  company: string;
  startDate: string;
  endDate: string;   // 'Present' for current
  outcomes: string[];     // bullet points focused on impact
  metrics?: string;       // e.g. "↑ 40% conversion, $2M ARR"
  skills?: string[];
}

export type AppreciationType = 'helpful' | 'thoughtProvoking' | 'collaborationReady';

export interface Post {
  id: number;
  authorId: number;
  content: string;
  appreciations: {
    helpful: number;
    thoughtProvoking: number;
    collaborationReady: number;
  };
  comments: number;
  shares: number;
  timestamp: string;
  circleId?: number;
}

export interface Company {
  id: number;
  _firestoreId?: string;
  name: string;
  description: string;
  industry: string;
  logoUrl: string;
  website: string;
  adminUid?: string;
  verifiedRecruiters?: string[];  // firebase UIDs
  verificationStatus?: 'unverified' | 'pending' | 'verified';
}

export interface Job {
  id: number;
  title: string;
  companyId: number;
  location: string;
  description: string;
  type: 'Full-time' | 'Contract' | 'Internship' | 'Remote';
  experienceLevel: 'Entry-level' | 'Mid-level' | 'Senior-level';
  status: 'Active' | 'Suspended';
  verificationStatus?: 'pending_verification' | 'live' | 'hidden';  // set by system
  recruiterId: number;
  liveDate: string; // ISO 8601 format date string e.g. "2024-08-01"
  expiryDate: string; // ISO 8601 format date string e.g. "2024-09-01"
}

export interface Message {
  id: number;
  senderId: number;
  receiverId: number;
  text: string;
  timestamp: string;
  isRead: boolean;
}

export type NotificationType = 'MESSAGE' | 'ENDORSEMENT' | 'CONNECTION_REQUEST' | 'CONNECTION_ACCEPTED' | 'FOLLOW_REQUEST' | 'FOLLOW_ACCEPTED' | 'SECURITY_ALERT';

export interface Notification {
  id: number;
  userId: number; // The user who should receive the notification
  type: NotificationType;
  text: string;
  read: boolean;
  timestamp: string;
  relatedId?: number; // e.g., ID of the connection request
}

export interface ConnectionRequest {
  id: number;
  fromUserId: number;
  toUserId: number;
  status: 'pending' | 'accepted' | 'declined';
}

export interface Circle {
  id: number;
  name: string;
  description: string;
  members: number[];
  adminId: number;
}

export interface Article {
  id: number;
  circleId: number;
  authorId: number;
  title: string;
  content: string;
  timestamp: string;
}

export interface AppData {
  users: User[];
  posts: Post[];
  jobs: Job[];
  companies: Company[];
  messages: Message[];
  notifications: Notification[];
  connectionRequests: ConnectionRequest[];
  followRequests: FollowRequest[];
  circles: Circle[];
  articles: Article[];
}


// ─────────────────────────────────────────────────────────────────────────────
// PEER LEARNING
// ─────────────────────────────────────────────────────────────────────────────

export type LessonFormat = 'text' | 'video' | 'link' | 'checklist';

export interface LearnRequest {
  id: string;
  circleId: number;
  authorId: number;
  skill: string;           // "How do I negotiate salary?"
  context?: string;        // optional why/goals
  status: 'open' | 'complete';
  completedAt?: string;
  lessonCount: number;
  sparkedByIds: number[];  // users who sparked the whole request
  createdAt: string;
}

export interface MicroLesson {
  id: string;
  requestId: string;
  circleId: number;
  authorId: number;
  format: LessonFormat;
  // text tip
  body?: string;
  // video clip
  videoUrl?: string;
  videoDurationSec?: number;
  // resource link
  linkUrl?: string;
  linkTitle?: string;
  linkDescription?: string;
  // checklist
  steps?: string[];
  completedSteps?: number[]; // indices the viewer has checked
  // universal
  sparkedByIds: number[];
  createdAt: string;
}


// ─────────────────────────────────────────────────────────────────────────────
// SKILL CHALLENGES
// ─────────────────────────────────────────────────────────────────────────────

export type SubmissionStatus =
  | 'submitted'
  | 'under_review'
  | 'scored'
  | 'shortlisted'
  | 'invited'
  | 'not_selected';

export type SubmissionFormat = 'text' | 'url' | 'file' | 'video';

export interface ScoringCriterion {
  label: string;
  weight: number; // percentage out of 100
  description?: string;
}

export interface ChallengeSubmission {
  id: string;
  challengeId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  content: string;
  format: SubmissionFormat;
  score: number | null;
  feedback: string | null;
  isShortlisted: boolean;
  status: SubmissionStatus;
  submittedAt: string;
}

export interface SkillChallenge {
  id: string;
  title: string;
  description: string;
  instructions: string;
  companyId?: string;
  companyName: string;
  companyLogoUrl?: string;
  recruiterId: string;
  targetedSkill: string;        // primary skill this tests
  skills: string[];             // all required skills
  difficulty: 'entry' | 'mid' | 'senior';
  type: 'code' | 'design' | 'strategy' | 'writing' | 'data';
  timeLimit: number;            // minutes
  dueDate?: string;             // ISO — alternative to timeLimit
  submissionFormat: SubmissionFormat;
  scoringRubric: ScoringCriterion[];
  linkedJobId?: string;         // optional linked job
  reward: { credits: number; badge: string; visibility: boolean };
  expiresAt: string;
  submissionCount: number;
  isActive: boolean;
  createdAt: string;
}

export interface CandidateSearchResult {
    user: User;
    aiAnalysis: {
        matchReasoning: string;
        strengths: string[];
        potentialRedFlags: string[];
        cultureFitAnalysis: string;
        personalityMarkers: string[];
        predictiveScores: {
            roleFit: number; // 0-100
            cultureFit: number; // 0-100
            mutualSuccessPotential: number; // 0-100
        };
        interviewQuestions: string[];
    };
}
export enum View {
 Feed = 'FEED',
 People = 'PEOPLE',
 Circles = 'CIRCLES',
 Jobs = 'JOBS',
 Messaging = 'MESSAGING',
 Prove = 'PROVE',          // <-- add this
 AIChat = 'AICHAT',
 Profile = 'PROFILE',
 RecruiterConsole = 'RECRUITER_CONSOLE',
 Connections = 'CONNECTIONS',
}

export type Language = 'en' | 'es';

// FIX: Added missing types that were used in legacy/mock components.
export enum FeedItemType {
  ARTICLE = 'ARTICLE',
  POST = 'POST',
}

export interface UserProfile {
  id: number;
  name: string;
  headline: string;
  avatarUrl: string;
  location: string;
  summary: string;
  experience: { id: number; title: string; company: string; startDate: string; endDate: string; description: string; }[];
  education: { id: number; school: string; degree: string; fieldOfStudy: string; startDate: string; endDate: string; }[];
}

export interface FollowRequest {
  id: number;
  fromUserId: number;
  toUserId: number;
  status: 'pending' | 'accepted' | 'declined';
  _firestoreId?: string;
}

export interface Connection {
    id: number;
    name: string;
    headline: string;
    avatarUrl: string;
}

export interface FeedItem {
    id: number;
    author: { name: string; headline: string; avatarUrl: string };
    type: FeedItemType;
    content: string;
    imageUrl?: string;
    likes: number;
    comments: number;
    timestamp: string;
}
// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 1 — TRUST INFRASTRUCTURE + REPUTATION GRAPH
// Add these to the bottom of types.ts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A directed, domain-specific trust signal generated automatically from
 * real interactions — never assigned manually.
 *
 * Firestore path: trust_edges/{edgeId}
 */
export type TrustEvidenceType =
  | 'challenge_review'      // recruiter/reviewer scored a challenge submission
  | 'challenge_submission'  // completed a scored challenge (score >= threshold)
  | 'peer_learning'         // created a micro-lesson in a pod
  | 'skill_endorsement'     // endorsed a specific skill (via SkillDNA)
  | 'verified_achievement'  // verified another user's achievement
  | 'vouched';              // explicit domain vouch (future: manual)

export interface TrustEdge {
  id?: string;              // Firestore doc ID
  fromUid: string;          // who extends trust
  toUid: string;            // who receives it
  domain: string;           // taxonomy domain e.g. "Frontend", "Data", "Leadership"
  strength: 1 | 2 | 3;     // 1=weak signal, 2=moderate, 3=strong
  evidenceType: TrustEvidenceType;
  evidenceRef: string;      // Firestore ID of source doc (challenge, submission, etc.)
  createdAt: string;        // ISO string (Timestamp on server)
}

/**
 * Per-domain trust standing for a user.
 * Computed by Cloud Function trustCompute, stored in reputation_profiles/{uid}
 */
export interface TrustDomain {
  name: string;             // matches TrustEdge.domain taxonomy
  score: number;            // 0–1000, PageRank-weighted
  tier: 'emerging' | 'established' | 'authority';
  edgeCount: number;        // total trust edges pointing here in this domain
  topVoucherUids: string[]; // UIDs whose trust contributes most weight
}

/**
 * Computed reputation profile for a user.
 * Firestore path: reputation_profiles/{uid}
 */
export interface ReputationProfile {
  uid: string;
  domains: TrustDomain[];
  overallScore: number;          // weighted sum across domains
  trajectory: 'rising' | 'stable' | 'declining'; // 90-day trend
  totalEvidenceCount: number;
  lastComputedAt: string;        // ISO string
}

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 2 — IDEA NETWORK
// Append these to types.ts (after the Sprint 1 additions)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * An Idea is a structured problem artifact — not a social post.
 * It has a lifecycle: seed → developing → arena_ready → in_progress → shipped.
 *
 * Firestore path: ideas/{ideaId}
 */
export type IdeaStage =
  | 'seed'          // just posted, seeking reaction
  | 'developing'    // active discussion, taking shape (5+ sparks)
  | 'arena_ready'   // community voted it ready for a live Arena (15+ sparks)
  | 'in_progress'   // an Arena is running on this idea
  | 'shipped'       // became a real thing
  | 'archived';     // no longer active

export type IdeaDomain =
  | 'Frontend' | 'Backend' | 'Data' | 'Design'
  | 'DevOps' | 'Product' | 'AI/ML' | 'Leadership' | 'Other';

export interface IdeaComment {
  id: string;
  authorUid: string;
  authorName: string;
  authorAvatar: string;
  body: string;
  createdAt: string;
}

export interface Idea {
  id?: string;                   // Firestore doc ID
  authorUid: string;
  authorName: string;
  authorAvatar: string;
  title: string;
  body: string;                  // the problem statement or hypothesis
  domain: IdeaDomain;
  stage: IdeaStage;

  // Engagement
  sparkCount: number;            // total sparks (denormalized for sorting)
  sparkedByUids: string[];       // who sparked it
  commentCount: number;

  // Lineage
  podId?: number;                // Circle/Pod this was posted in (optional)
  parentIdeaId?: string;         // if this is a fork
  forkCount: number;

  // Pipeline connections
  connectedArenaId?: string;     // Arena spawned from this idea
  connectedChallengeId?: string; // Challenge linked to this idea

  createdAt: string;             // ISO string
  updatedAt: string;
}

// Add to the View enum in types.ts:
// Ideas = 'IDEAS'
