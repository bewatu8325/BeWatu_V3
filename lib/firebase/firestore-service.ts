// lib/firebase/firestore-service.ts
// ─────────────────────────────────────────────────────────────────────────────
// All Firestore reads & writes for BeWatu Factory.
// Replaces lib/data/store.ts (localStorage) with real Firebase Firestore.
//
// Collection map
//   factory_users          – user profiles
//   factory_problems       – arena problems
//   factory_solutions      – solutions per problem
//   factory_teams          – teams
//   factory_team_posts     – team-formation posts
//   factory_projects       – projects (per team)
//   factory_startups       – launched startups
//   factory_ideas          – idea discovery
//   factory_investors      – investor profiles
//   factory_funding_rounds – funding rounds per startup
//   factory_incubators     – incubator / accelerator programs
//   factory_activities     – global activity feed
//   factory_notifications  – per-user notification subcollection
//   factory_reputation     – per-user XP / badge data
// ─────────────────────────────────────────────────────────────────────────────

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  increment,
  arrayUnion,
  arrayRemove,
  onSnapshot,
  serverTimestamp,
  type QueryDocumentSnapshot,
  type DocumentData,
} from "firebase/firestore";
import { db } from "./config";
import type {
  User,
  Problem,
  Solution,
  Team,
  TeamFormationPost,
  Project,
  Startup,
  Idea,
  Investor,
  FundingRound,
  IncubatorProgram,
  Activity,
  Notification,
  UserReputation,
  LeaderboardEntry,
} from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toData<T>(snap: QueryDocumentSnapshot<DocumentData>): T {
  return { id: snap.id, ...snap.data() } as T;
}

// ═══════════════════════════════════════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════════════════════════════════════

export async function getFactoryUser(uid: string): Promise<User | null> {
  const snap = await getDoc(doc(db, "factory_users", uid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as User;
}

export async function getFactoryUsers(max = 50): Promise<User[]> {
  const snap = await getDocs(
    query(collection(db, "factory_users"), orderBy("reputation", "desc"), limit(max))
  );
  return snap.docs.map(d => toData<User>(d));
}

export async function updateFactoryUser(uid: string, updates: Partial<User>): Promise<void> {
  await updateDoc(doc(db, "factory_users", uid), updates);
}

// ═══════════════════════════════════════════════════════════════════════════
// PROBLEMS (Arena)
// ═══════════════════════════════════════════════════════════════════════════

export async function getProblems(max = 50): Promise<Problem[]> {
  const snap = await getDocs(
    query(collection(db, "factory_problems"), orderBy("createdAt", "desc"), limit(max))
  );
  return snap.docs.map(d => toData<Problem>(d));
}

export async function getProblem(id: string): Promise<Problem | null> {
  const snap = await getDoc(doc(db, "factory_problems", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Problem;
}

export async function createProblem(
  data: Omit<Problem, "id" | "solutionCount" | "views" | "upvotes" | "createdAt">
): Promise<string> {
  const ref = await addDoc(collection(db, "factory_problems"), {
    ...data,
    solutionCount: 0,
    views:         0,
    upvotes:       0,
    createdAt:     serverTimestamp(),
  });
  return ref.id;
}

export async function upvoteProblem(id: string): Promise<void> {
  await updateDoc(doc(db, "factory_problems", id), { upvotes: increment(1) });
}

export async function incrementProblemViews(id: string): Promise<void> {
  await updateDoc(doc(db, "factory_problems", id), { views: increment(1) });
}

// ═══════════════════════════════════════════════════════════════════════════
// SOLUTIONS
// ═══════════════════════════════════════════════════════════════════════════

export async function getSolutionsByProblem(problemId: string): Promise<Solution[]> {
  const snap = await getDocs(
    query(
      collection(db, "factory_solutions"),
      where("problemId", "==", problemId),
      orderBy("votes", "desc")
    )
  );
  return snap.docs.map(d => toData<Solution>(d));
}

export async function getSolution(id: string): Promise<Solution | null> {
  const snap = await getDoc(doc(db, "factory_solutions", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Solution;
}

export async function createSolution(
  data: Omit<Solution, "id" | "votes" | "comments" | "createdAt" | "updatedAt">
): Promise<string> {
  const ref = await addDoc(collection(db, "factory_solutions"), {
    ...data,
    votes:     0,
    comments:  [],
    status:    "draft",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  // Increment problem solution count
  await updateDoc(doc(db, "factory_problems", data.problemId), {
    solutionCount: increment(1),
  });
  return ref.id;
}

export async function upvoteSolution(id: string): Promise<void> {
  await updateDoc(doc(db, "factory_solutions", id), { votes: increment(1) });
}

export async function updateSolutionStatus(
  id: string,
  status: Solution["status"]
): Promise<void> {
  await updateDoc(doc(db, "factory_solutions", id), {
    status,
    updatedAt: serverTimestamp(),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// IDEAS
// ═══════════════════════════════════════════════════════════════════════════

export async function getIdeas(max = 50): Promise<Idea[]> {
  const snap = await getDocs(
    query(collection(db, "factory_ideas"), orderBy("createdAt", "desc"), limit(max))
  );
  return snap.docs.map(d => toData<Idea>(d));
}

export async function getIdea(id: string): Promise<Idea | null> {
  const snap = await getDoc(doc(db, "factory_ideas", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Idea;
}

export async function createIdea(
  data: Omit<Idea, "id" | "upvotes" | "comments" | "createdAt" | "updatedAt">
): Promise<string> {
  const ref = await addDoc(collection(db, "factory_ideas"), {
    ...data,
    upvotes:   0,
    comments:  [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  // Award XP
  await awardXP(data.author.id, 25, "Shared an idea");
  return ref.id;
}

export async function upvoteIdea(id: string, voterId: string): Promise<void> {
  // Idempotent upvote using votedBy array
  const ref = doc(db, "factory_ideas", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const voted: string[] = snap.data().votedBy ?? [];
  if (voted.includes(voterId)) return;
  await updateDoc(ref, {
    upvotes: increment(1),
    votedBy: arrayUnion(voterId),
  });
}

export async function updateIdeaStage(id: string, stage: Idea["stage"]): Promise<void> {
  await updateDoc(doc(db, "factory_ideas", id), {
    stage,
    updatedAt: serverTimestamp(),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// TEAMS
// ═══════════════════════════════════════════════════════════════════════════

export async function getTeams(max = 50): Promise<Team[]> {
  const snap = await getDocs(
    query(collection(db, "factory_teams"), orderBy("createdAt", "desc"), limit(max))
  );
  return snap.docs.map(d => toData<Team>(d));
}

export async function getTeam(id: string): Promise<Team | null> {
  const snap = await getDoc(doc(db, "factory_teams", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Team;
}

export async function createTeam(
  data: Omit<Team, "id" | "createdAt">
): Promise<string> {
  const ref = await addDoc(collection(db, "factory_teams"), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function joinTeam(
  teamId: string,
  user: User,
  role: string
): Promise<void> {
  const ref = doc(db, "factory_teams", teamId);
  await updateDoc(ref, {
    members: arrayUnion({ user, role, joinedAt: new Date().toISOString() }),
  });
  await awardXP(user.id, 25, "Joined a team");
}

// ═══════════════════════════════════════════════════════════════════════════
// TEAM FORMATION POSTS
// ═══════════════════════════════════════════════════════════════════════════

export async function getTeamFormationPosts(max = 50): Promise<TeamFormationPost[]> {
  const snap = await getDocs(
    query(collection(db, "factory_team_posts"), orderBy("createdAt", "desc"), limit(max))
  );
  return snap.docs.map(d => toData<TeamFormationPost>(d));
}

export async function createTeamFormationPost(
  data: Omit<TeamFormationPost, "id" | "createdAt">
): Promise<string> {
  const ref = await addDoc(collection(db, "factory_team_posts"), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROJECTS
// ═══════════════════════════════════════════════════════════════════════════

export async function getProjects(max = 50): Promise<Project[]> {
  const snap = await getDocs(
    query(collection(db, "factory_projects"), orderBy("createdAt", "desc"), limit(max))
  );
  return snap.docs.map(d => toData<Project>(d));
}

export async function getProject(id: string): Promise<Project | null> {
  const snap = await getDoc(doc(db, "factory_projects", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Project;
}

export async function getProjectByTeam(teamId: string): Promise<Project | null> {
  const snap = await getDocs(
    query(collection(db, "factory_projects"), where("teamId", "==", teamId), limit(1))
  );
  if (snap.empty) return null;
  return toData<Project>(snap.docs[0]);
}

export async function createProject(
  data: Omit<Project, "id" | "progress" | "createdAt">
): Promise<string> {
  const ref = await addDoc(collection(db, "factory_projects"), {
    ...data,
    progress:  0,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function toggleMilestone(
  projectId: string,
  milestoneId: string,
  completed: boolean
): Promise<void> {
  const ref = doc(db, "factory_projects", projectId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const milestones = snap.data().milestones.map((m: any) =>
    m.id === milestoneId ? { ...m, completed } : m
  );
  const total     = milestones.length;
  const done      = milestones.filter((m: any) => m.completed).length;
  const progress  = total > 0 ? Math.round((done / total) * 100) : 0;
  await updateDoc(ref, { milestones, progress });
}

// ═══════════════════════════════════════════════════════════════════════════
// STARTUPS
// ═══════════════════════════════════════════════════════════════════════════

export async function getStartups(max = 50): Promise<Startup[]> {
  const snap = await getDocs(
    query(collection(db, "factory_startups"), orderBy("createdAt", "desc"), limit(max))
  );
  return snap.docs.map(d => toData<Startup>(d));
}

export async function getStartup(id: string): Promise<Startup | null> {
  const snap = await getDoc(doc(db, "factory_startups", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Startup;
}

export async function createStartup(
  data: Omit<Startup, "id" | "createdAt">
): Promise<string> {
  const ref = await addDoc(collection(db, "factory_startups"), {
    ...data,
    createdAt: serverTimestamp(),
  });
  // Award big XP to each founder
  for (const founder of data.founders) {
    await awardXP(founder.id, 500, "Launched a startup");
  }
  return ref.id;
}

export async function updateStartupMetrics(
  id: string,
  metrics: Startup["metrics"]
): Promise<void> {
  await updateDoc(doc(db, "factory_startups", id), { metrics });
}

// ═══════════════════════════════════════════════════════════════════════════
// INVESTORS
// ═══════════════════════════════════════════════════════════════════════════

export async function getInvestors(max = 50): Promise<Investor[]> {
  const snap = await getDocs(
    query(collection(db, "factory_investors"), orderBy("createdAt", "desc"), limit(max))
  );
  return snap.docs.map(d => toData<Investor>(d));
}

export async function getInvestor(id: string): Promise<Investor | null> {
  const snap = await getDoc(doc(db, "factory_investors", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Investor;
}

export async function createInvestorProfile(
  data: Omit<Investor, "id" | "createdAt">
): Promise<string> {
  const ref = await addDoc(collection(db, "factory_investors"), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNDING ROUNDS
// ═══════════════════════════════════════════════════════════════════════════

export async function getFundingRounds(max = 50): Promise<FundingRound[]> {
  const snap = await getDocs(
    query(collection(db, "factory_funding_rounds"), orderBy("createdAt", "desc"), limit(max))
  );
  return snap.docs.map(d => toData<FundingRound>(d));
}

export async function getFundingRoundsByStartup(startupId: string): Promise<FundingRound[]> {
  const snap = await getDocs(
    query(
      collection(db, "factory_funding_rounds"),
      where("startupId", "==", startupId),
      orderBy("createdAt", "desc")
    )
  );
  return snap.docs.map(d => toData<FundingRound>(d));
}

export async function createFundingRound(
  data: Omit<FundingRound, "id" | "raisedAmount" | "investors" | "createdAt">
): Promise<string> {
  const ref = await addDoc(collection(db, "factory_funding_rounds"), {
    ...data,
    raisedAmount: 0,
    investors:    [],
    createdAt:    serverTimestamp(),
  });
  return ref.id;
}

export async function expressInvestorInterest(
  roundId: string,
  investor: Investor,
  amount: number
): Promise<void> {
  const ref = doc(db, "factory_funding_rounds", roundId);
  await updateDoc(ref, {
    raisedAmount: increment(amount),
    investors:    arrayUnion(investor),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// INCUBATOR PROGRAMS
// ═══════════════════════════════════════════════════════════════════════════

export async function getIncubatorPrograms(max = 20): Promise<IncubatorProgram[]> {
  const snap = await getDocs(
    query(collection(db, "factory_incubators"), orderBy("createdAt", "desc"), limit(max))
  );
  return snap.docs.map(d => toData<IncubatorProgram>(d));
}

export async function getIncubatorProgram(id: string): Promise<IncubatorProgram | null> {
  const snap = await getDoc(doc(db, "factory_incubators", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as IncubatorProgram;
}

export async function applyToIncubator(
  programId: string,
  startupId: string,
  founderUid: string
): Promise<void> {
  await addDoc(collection(db, "factory_incubators", programId, "applications"), {
    startupId,
    founderUid,
    status:    "pending",
    appliedAt: serverTimestamp(),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITY FEED
// ═══════════════════════════════════════════════════════════════════════════

export async function getActivities(max = 30): Promise<Activity[]> {
  const snap = await getDocs(
    query(collection(db, "factory_activities"), orderBy("createdAt", "desc"), limit(max))
  );
  return snap.docs.map(d => toData<Activity>(d));
}

export async function logActivity(
  data: Omit<Activity, "id" | "createdAt">
): Promise<void> {
  await addDoc(collection(db, "factory_activities"), {
    ...data,
    createdAt: serverTimestamp(),
  });
}

export function subscribeToActivities(
  onUpdate: (activities: Activity[]) => void,
  max = 20
): () => void {
  return onSnapshot(
    query(collection(db, "factory_activities"), orderBy("createdAt", "desc"), limit(max)),
    (snap) => onUpdate(snap.docs.map(d => toData<Activity>(d)))
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════

export function subscribeToNotifications(
  uid: string,
  onUpdate: (notifications: Notification[]) => void
): () => void {
  return onSnapshot(
    query(
      collection(db, "factory_users", uid, "notifications"),
      orderBy("createdAt", "desc"),
      limit(20)
    ),
    (snap) => onUpdate(snap.docs.map(d => toData<Notification>(d)))
  );
}

export async function markNotificationRead(uid: string, notifId: string): Promise<void> {
  await updateDoc(doc(db, "factory_users", uid, "notifications", notifId), { read: true });
}

export async function markAllNotificationsRead(uid: string): Promise<void> {
  const snap = await getDocs(
    query(
      collection(db, "factory_users", uid, "notifications"),
      where("read", "==", false)
    )
  );
  await Promise.all(snap.docs.map(d => updateDoc(d.ref, { read: true })));
}

export async function createNotification(
  uid: string,
  data: Omit<Notification, "id" | "read" | "createdAt">
): Promise<void> {
  await addDoc(collection(db, "factory_users", uid, "notifications"), {
    ...data,
    read:      false,
    createdAt: serverTimestamp(),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// REPUTATION & XP
// ═══════════════════════════════════════════════════════════════════════════

export async function getReputation(uid: string): Promise<UserReputation | null> {
  const snap = await getDoc(doc(db, "factory_reputation", uid));
  if (!snap.exists()) return null;
  return snap.data() as UserReputation;
}

export async function awardXP(uid: string, xp: number, reason: string): Promise<void> {
  const ref = doc(db, "factory_reputation", uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    // Bootstrap reputation doc
    await setDoc(ref, {
      level: 1,
      xp,
      xpToNextLevel: 100,
      rank:          "Newcomer",
      badges:        [],
      streak:        0,
      longestStreak: 0,
      lastActiveDate: new Date().toISOString().split("T")[0],
      stats: {
        problemsSolved:    0,
        solutionsSubmitted:0,
        solutionsAccepted: 0,
        commentsPosted:    0,
        upvotesReceived:   0,
        upvotesGiven:      0,
        teamsFormed:       0,
        startupsLaunched:  0,
        ideasShared:       0,
        mentoringSessions: 0,
      },
    });
  } else {
    await updateDoc(ref, { xp: increment(xp) });
  }

  // Also increment on user doc for display
  await updateDoc(doc(db, "factory_users", uid), { reputation: increment(xp) });
}

export async function awardBadge(uid: string, badgeId: string): Promise<void> {
  await updateDoc(doc(db, "factory_reputation", uid), {
    badges: arrayUnion(badgeId),
  });
  await createNotification(uid, {
    type:    "badge-earned",
    title:   "Badge Earned!",
    message: `You earned the ${badgeId} badge`,
    link:    `/profile/${uid}`,
  });
}

export async function updateStreak(uid: string): Promise<void> {
  const ref = doc(db, "factory_reputation", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data();
  const today = new Date().toISOString().split("T")[0];
  const last  = data.lastActiveDate ?? "";

  if (last === today) return; // already updated today

  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const newStreak  = last === yesterday ? (data.streak ?? 0) + 1 : 1;
  const longest    = Math.max(newStreak, data.longestStreak ?? 0);

  await updateDoc(ref, {
    streak:        newStreak,
    longestStreak: longest,
    lastActiveDate:today,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// LEADERBOARD
// ═══════════════════════════════════════════════════════════════════════════

export async function getLeaderboard(max = 20): Promise<LeaderboardEntry[]> {
  const snap = await getDocs(
    query(collection(db, "factory_reputation"), orderBy("xp", "desc"), limit(max))
  );
  const entries = await Promise.all(
    snap.docs.map(async (d, i) => {
      const user = await getFactoryUser(d.id);
      return {
        user:   user as User,
        score:  (d.data().xp as number) ?? 0,
        rank:   i + 1,
        change: 0,
      };
    })
  );
  return entries.filter(e => e.user !== null);
}

// ═══════════════════════════════════════════════════════════════════════════
// STATS  (replaces getStats() from store.ts)
// ═══════════════════════════════════════════════════════════════════════════

export async function getFactoryStats() {
  const [problems, solutions, teams, projects, startups, ideas, investors, incubators] =
    await Promise.all([
      getDocs(collection(db, "factory_problems")),
      getDocs(collection(db, "factory_solutions")),
      getDocs(collection(db, "factory_teams")),
      getDocs(collection(db, "factory_projects")),
      getDocs(collection(db, "factory_startups")),
      getDocs(collection(db, "factory_ideas")),
      getDocs(collection(db, "factory_investors")),
      getDocs(collection(db, "factory_incubators")),
    ]);

  const allProblems = problems.docs.map(d => d.data());
  return {
    totalProblems:    problems.size,
    openProblems:     allProblems.filter(p => p.status === "open").length,
    totalSolutions:   solutions.size,
    totalTeams:       teams.size,
    activeProjects:   projects.docs.filter(d => d.data().status === "development").length,
    launchedStartups: startups.size,
    totalUsers:       0, // queried separately to avoid cost
    totalBounties:    allProblems.reduce((s, p) => s + (p.bounty ?? 0), 0),
    totalIdeas:       ideas.size,
    totalInvestors:   investors.size,
    totalIncubators:  incubators.size,
  };
}
