// lib/hooks/use-factory-data.ts
// ─────────────────────────────────────────────────────────────────────────────
// Data hooks for every entity in BeWatu Factory.
// Each hook returns { data, loading, error } and fires a single Firestore read.
// Mutation hooks return an async action and a saving boolean.
//
// Usage pattern (mirrors the old store.ts getX() calls):
//   const { problems, loading } = useProblems();
//   const { createProblem, saving } = useCreateProblem();
// ─────────────────────────────────────────────────────────────────────────────
"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/firebase/auth-context";
import * as svc from "@/lib/firebase/firestore-service";
import type {
  User, Problem, Solution, Team, TeamFormationPost,
  Project, Startup, Idea, Investor, FundingRound,
  IncubatorProgram, Activity, Notification, UserReputation,
  LeaderboardEntry,
} from "@/lib/types";

// ─── Generic fetch hook ───────────────────────────────────────────────────────

function useFetch<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [data,    setData]    = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetcher()
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, refetch: () => fetcher().then(setData) };
}

// ─── Generic mutation hook ────────────────────────────────────────────────────

function useMutation<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>
) {
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const execute = useCallback(async (...args: TArgs): Promise<TReturn | null> => {
    setSaving(true); setError(null);
    try {
      const result = await fn(...args);
      return result;
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
      return null;
    } finally {
      setSaving(false);
    }
  }, [fn]); // eslint-disable-line

  return { execute, saving, error };
}

// ═══════════════════════════════════════════════════════════════════════════
// CURRENT USER
// ═══════════════════════════════════════════════════════════════════════════

export function useCurrentUser() {
  const { firebaseUser, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) { setProfile(null); setLoading(false); return; }
    svc.getFactoryUser(firebaseUser.uid).then(p => {
      setProfile(p); setLoading(false);
    });
  }, [firebaseUser, authLoading]);

  return { user: profile, loading: loading || authLoading };
}

// ═══════════════════════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════════════════════

export function useFactoryStats() {
  return useFetch(() => svc.getFactoryStats());
}

// ═══════════════════════════════════════════════════════════════════════════
// PROBLEMS
// ═══════════════════════════════════════════════════════════════════════════

export function useProblems(max = 50) {
  const fetch = useFetch<Problem[]>(() => svc.getProblems(max));
  return { problems: fetch.data ?? [], ...fetch };
}

export function useProblem(id: string) {
  const fetch = useFetch<Problem | null>(() => svc.getProblem(id), [id]);
  return { problem: fetch.data, ...fetch };
}

export function useCreateProblem() {
  return useMutation(svc.createProblem);
}

// ═══════════════════════════════════════════════════════════════════════════
// SOLUTIONS
// ═══════════════════════════════════════════════════════════════════════════

export function useSolutions(problemId: string) {
  const fetch = useFetch<Solution[]>(
    () => svc.getSolutionsByProblem(problemId), [problemId]
  );
  return { solutions: fetch.data ?? [], ...fetch };
}

export function useCreateSolution() {
  return useMutation(svc.createSolution);
}

// ═══════════════════════════════════════════════════════════════════════════
// IDEAS
// ═══════════════════════════════════════════════════════════════════════════

export function useIdeas(max = 50) {
  const fetch = useFetch<Idea[]>(() => svc.getIdeas(max));
  return { ideas: fetch.data ?? [], ...fetch };
}

export function useIdea(id: string) {
  const fetch = useFetch<Idea | null>(() => svc.getIdea(id), [id]);
  return { idea: fetch.data, ...fetch };
}

export function useCreateIdea() {
  return useMutation(svc.createIdea);
}

export function useUpvoteIdea() {
  const { firebaseUser } = useAuth();
  return useMutation((id: string) => {
    if (!firebaseUser) return Promise.reject(new Error("Not signed in"));
    return svc.upvoteIdea(id, firebaseUser.uid);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// TEAMS
// ═══════════════════════════════════════════════════════════════════════════

export function useTeams(max = 50) {
  const fetch = useFetch<Team[]>(() => svc.getTeams(max));
  return { teams: fetch.data ?? [], ...fetch };
}

export function useTeam(id: string) {
  const fetch = useFetch<Team | null>(() => svc.getTeam(id), [id]);
  return { team: fetch.data, ...fetch };
}

export function useTeamFormationPosts(max = 50) {
  const fetch = useFetch<TeamFormationPost[]>(() => svc.getTeamFormationPosts(max));
  return { posts: fetch.data ?? [], ...fetch };
}

export function useCreateTeam() {
  return useMutation(svc.createTeam);
}

// ═══════════════════════════════════════════════════════════════════════════
// PROJECTS
// ═══════════════════════════════════════════════════════════════════════════

export function useProjects(max = 50) {
  const fetch = useFetch<Project[]>(() => svc.getProjects(max));
  return { projects: fetch.data ?? [], ...fetch };
}

export function useProject(id: string) {
  const fetch = useFetch<Project | null>(() => svc.getProject(id), [id]);
  return { project: fetch.data, ...fetch };
}

// ═══════════════════════════════════════════════════════════════════════════
// STARTUPS
// ═══════════════════════════════════════════════════════════════════════════

export function useStartups(max = 50) {
  const fetch = useFetch<Startup[]>(() => svc.getStartups(max));
  return { startups: fetch.data ?? [], ...fetch };
}

export function useStartup(id: string) {
  const fetch = useFetch<Startup | null>(() => svc.getStartup(id), [id]);
  return { startup: fetch.data, ...fetch };
}

export function useCreateStartup() {
  return useMutation(svc.createStartup);
}

// ═══════════════════════════════════════════════════════════════════════════
// INVESTORS
// ═══════════════════════════════════════════════════════════════════════════

export function useInvestors(max = 50) {
  const fetch = useFetch<Investor[]>(() => svc.getInvestors(max));
  return { investors: fetch.data ?? [], ...fetch };
}

export function useInvestor(id: string) {
  const fetch = useFetch<Investor | null>(() => svc.getInvestor(id), [id]);
  return { investor: fetch.data, ...fetch };
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNDING ROUNDS
// ═══════════════════════════════════════════════════════════════════════════

export function useFundingRounds(max = 50) {
  const fetch = useFetch<FundingRound[]>(() => svc.getFundingRounds(max));
  return { rounds: fetch.data ?? [], ...fetch };
}

export function useFundingRoundsByStartup(startupId: string) {
  const fetch = useFetch<FundingRound[]>(
    () => svc.getFundingRoundsByStartup(startupId), [startupId]
  );
  return { rounds: fetch.data ?? [], ...fetch };
}

// ═══════════════════════════════════════════════════════════════════════════
// INCUBATORS
// ═══════════════════════════════════════════════════════════════════════════

export function useIncubatorPrograms(max = 20) {
  const fetch = useFetch<IncubatorProgram[]>(() => svc.getIncubatorPrograms(max));
  return { programs: fetch.data ?? [], ...fetch };
}

export function useIncubatorProgram(id: string) {
  const fetch = useFetch<IncubatorProgram | null>(
    () => svc.getIncubatorProgram(id), [id]
  );
  return { program: fetch.data, ...fetch };
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITY FEED (real-time)
// ═══════════════════════════════════════════════════════════════════════════

export function useActivities(max = 20) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    const unsub = svc.subscribeToActivities(acts => {
      setActivities(acts);
      setLoading(false);
    }, max);
    return unsub;
  }, [max]);

  return { activities, loading };
}

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS (real-time)
// ═══════════════════════════════════════════════════════════════════════════

export function useNotifications() {
  const { firebaseUser } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading,        setLoading]       = useState(true);

  useEffect(() => {
    if (!firebaseUser) { setNotifications([]); setLoading(false); return; }
    const unsub = svc.subscribeToNotifications(firebaseUser.uid, notifs => {
      setNotifications(notifs); setLoading(false);
    });
    return unsub;
  }, [firebaseUser]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markRead = useCallback(async (id: string) => {
    if (!firebaseUser) return;
    await svc.markNotificationRead(firebaseUser.uid, id);
  }, [firebaseUser]);

  const markAllRead = useCallback(async () => {
    if (!firebaseUser) return;
    await svc.markAllNotificationsRead(firebaseUser.uid);
  }, [firebaseUser]);

  return { notifications, unreadCount, loading, markRead, markAllRead };
}

// ═══════════════════════════════════════════════════════════════════════════
// REPUTATION
// ═══════════════════════════════════════════════════════════════════════════

export function useReputation(uid?: string) {
  const { firebaseUser } = useAuth();
  const targetUid = uid ?? firebaseUser?.uid ?? "";

  const fetch = useFetch<UserReputation | null>(
    () => targetUid ? svc.getReputation(targetUid) : Promise.resolve(null),
    [targetUid]
  );
  return { reputation: fetch.data, ...fetch };
}

export function useLeaderboard(max = 20) {
  const fetch = useFetch<LeaderboardEntry[]>(() => svc.getLeaderboard(max));
  return { leaderboard: fetch.data ?? [], ...fetch };
}
