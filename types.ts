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
  name: string;
  description: string;
  industry: string;
  logoUrl: string;
  website: string;
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

export type NotificationType = 'MESSAGE' | 'ENDORSEMENT' | 'CONNECTION_REQUEST' | 'CONNECTION_ACCEPTED' | 'SECURITY_ALERT';

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
  circles: Circle[];
  articles: Article[];
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
  Jobs = 'JOBS',
  Messaging = 'MESSAGING',
  Circles = 'CIRCLES',
  AIChat = 'AICHAT',
  Profile = 'PROFILE',
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
