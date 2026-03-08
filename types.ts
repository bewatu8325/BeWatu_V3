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
    outcome: string;
    aiGeneratedSummary: string;
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
  portfolio: Project[];
  verifiedAchievements: VerifiedAchievement[];
  thirdPartyIntegrations: ThirdPartyIntegration[];
  workStyle: WorkStyle;
  values: string[];
  availability: 'Immediate' | '2 weeks notice' | 'Exploring opportunities';
  skills: { name: string; endorsements: number }[];
  verifiedSkills: VerifiedSkill[] | null;
  microIntroductionUrl: string | null;
  microIntroductionThumbnail?: string | null;
  resumeUrl?: string | null;
  experiences?: Experience[];
  privacySettings?: PrivacySettings;
  followersCount?: number;
  followingCount?: number;
  followingCompanies?: string[];
  _firestoreUid?: string;
}

export interface PrivacySettings {
  allowConnectionRequests: boolean;
  allowFollow: boolean;
  visibleToRecruiters: boolean;
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
  endDate: string;
  outcomes: string[];
  metrics?: string;
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
  verifiedRecruiters?: string[];
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
  verificationStatus?: 'pending_verification' | 'live' | 'hidden';
  recruiterId: number;
  liveDate: string;
  expiryDate: string;
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
  userId: number;
  type: NotificationType;
  text: string;
  read: boolean;
  timestamp: string;
  relatedId?: number;
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

export type LessonFormat = 'text' | 'video' | 'link' | 'checklist';

export interface LearnRequest {
  id: string;
  circleId: number;
  authorId: number;
  skill: string;
  context?: string;
  status: 'open' | 'complete';
  completedAt?: string;
  lessonCount: number;
  sparkedByIds: number[];
  createdAt: string;
}

export interface MicroLesson {
  id: string;
  requestId: string;
  circleId: number;
  authorId: number;
  format: LessonFormat;
  body?: string;
  videoUrl?: string;
  videoDurationSec?: number;
  linkUrl?: string;
  linkTitle?: string;
  linkDescription?: string;
  steps?: string[];
  completedSteps?: number[];
  sparkedByIds: number[];
  createdAt: string;
}

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
  weight: number;
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
  targetedSkill: string;
  skills: string[];
  difficulty: 'entry' | 'mid' | 'senior';
  type: 'code' | 'design' | 'strategy' | 'writing' | 'data';
  timeLimit: number;
  dueDate?: string;
  submissionFormat: SubmissionFormat;
  scoringRubric: ScoringCriterion[];
  linkedJobId?: string;
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
            roleFit: number;
            cultureFit: number;
            mutualSuccessPotential: number;
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
 Prove = 'PROVE',
 AIChat = 'AICHAT',
 Profile = 'PROFILE',
 RecruiterConsole = 'RECRUITER_CONSOLE',
 Connections = 'CONNECTIONS',
 Ideas = 'IDEAS',
}

export type Language = 'en' | 'es';

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
// ─────────────────────────────────────────────────────────────────────────────

export type TrustEvidenceType =
  | 'challenge_review'
  | 'challenge_submission'
  | 'peer_learning'
  | 'skill_endorsement'
  | 'verified_achievement'
  | 'vouched';

export interface TrustEdge {
  id?: string;
  fromUid: string;
  toUid: string;
  domain: string;
  strength: 1 | 2 | 3;
  evidenceType: TrustEvidenceType;
  evidenceRef: string;
  createdAt: string;
}

export interface TrustDomain {
  name: string;
  score: number;
  tier: 'emerging' | 'established' | 'authority';
  edgeCount: number;
  topVoucherUids: string[];
}

export interface ReputationProfile {
  uid: string;
  domains: TrustDomain[];
  overallScore: number;
  trajectory: 'rising' | 'stable' | 'declining';
  totalEvidenceCount: number;
  lastComputedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 2 — IDEA NETWORK
// ─────────────────────────────────────────────────────────────────────────────

export type IdeaStage =
  | 'seed'
  | 'developing'
  | 'arena_ready'
  | 'in_progress'
  | 'shipped'
  | 'archived';

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
  id?: string;
  authorUid: string;
  authorName: string;
  authorAvatar: string;
  title: string;
  body: string;
  domain: IdeaDomain;
  stage: IdeaStage;
  sparkCount: number;
  sparkedByUids: string[];
  commentCount: number;
  podId?: number;
  parentIdeaId?: string;
  forkCount: number;
  connectedArenaId?: string;
  connectedChallengeId?: string;
  createdAt: string;
  updatedAt: string;
}
