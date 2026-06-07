/**
 * lib/proofArtifacts.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Data layer for two new persistent proof artifacts that live on the Prove
 * profile (unlike Sparks, which expire after 48h):
 *
 *   • Playbooks  — repeatable AI workflows ("my 5-step system for X").
 *                  Addresses the "show your AI workflow as a deliverable" gap.
 *   • Build Logs — medium-format "what I built / what broke / what's next"
 *                  entries. The persistent build-in-public trail between
 *                  ephemeral Sparks and high-effort Arena submissions.
 *
 * Follows the exact conventions of createSpark in firestoreService.ts:
 *   - addDoc with serverTimestamp()
 *   - undefined values stripped before write (Firestore rejects undefined)
 *   - reactions shaped { relate, inspire, collab } for Build Logs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  collection, addDoc, getDocs, getDoc, doc, updateDoc, deleteDoc,
  query, where, orderBy, limit, serverTimestamp, arrayUnion, arrayRemove,
} from 'firebase/firestore';
import { db } from './firebase';

// ── Shared author shape ───────────────────────────────────────────────────────
interface Author {
  authorUid:     string;
  authorId:      number;
  authorName:    string;
  authorAvatar:  string;
  authorHeadline: string;
}

function strip(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLAYBOOKS — AI workflows as deliverables
// ═══════════════════════════════════════════════════════════════════════════════

export interface PlaybookStep {
  action:     string;   // what you do
  tool:       string;   // which AI tool / model / prompt
  humanCheck: string;   // the human edit / verification that makes it reliable
}

export interface Playbook {
  id:           string;
  authorUid:    string;
  authorId:     number;
  authorName:   string;
  authorAvatar: string;
  authorHeadline: string;
  title:        string;
  goal:         string;
  steps:        PlaybookStep[];
  tools:        string[];
  outcome:      string;
  helpfulByUids: string[];
  viewCount:    number;
  createdAt:    any;
  updatedAt:    any;
}

export async function createPlaybook(
  author: Author,
  data: { title: string; goal: string; steps: PlaybookStep[]; tools: string[]; outcome?: string }
): Promise<string> {
  const ref = await addDoc(collection(db, 'aiPlaybooks'), strip({
    ...author,
    title:   data.title.trim(),
    goal:    data.goal.trim(),
    steps:   data.steps.filter(s => s.action.trim()),
    tools:   data.tools,
    outcome: data.outcome?.trim() || undefined,
    helpfulByUids: [],
    viewCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
  return ref.id;
}

export async function getPlaybooksByAuthor(authorUid: string): Promise<Playbook[]> {
  try {
    const q = query(
      collection(db, 'aiPlaybooks'),
      where('authorUid', '==', authorUid),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() })) as Playbook[];
  } catch {
    // Fallback if composite index not built yet — filter client-side
    const snap = await getDocs(collection(db, 'aiPlaybooks'));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }) as Playbook)
      .filter(p => p.authorUid === authorUid)
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
  }
}

export async function togglePlaybookHelpful(playbookId: string, uid: string): Promise<void> {
  const ref = doc(db, 'aiPlaybooks', playbookId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const arr: string[] = snap.data().helpfulByUids ?? [];
  await updateDoc(ref, {
    helpfulByUids: arr.includes(uid) ? arrayRemove(uid) : arrayUnion(uid),
  });
}

export async function deletePlaybook(playbookId: string): Promise<void> {
  await deleteDoc(doc(db, 'aiPlaybooks', playbookId));
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUILD LOGS — persistent build-in-public entries
// ═══════════════════════════════════════════════════════════════════════════════

export interface BuildLog {
  id:           string;
  authorUid:    string;
  authorId:     number;
  authorName:   string;
  authorAvatar: string;
  authorHeadline: string;
  title:        string;
  built:        string;
  broke:        string;
  next:         string;
  tags:         string[];
  link:         string;
  reactions:    { relate: string[]; inspire: string[]; collab: string[] };
  createdAt:    any;
}

export async function createBuildLog(
  author: Author,
  data: { title?: string; built: string; broke?: string; next?: string; tags: string[]; link?: string }
): Promise<string> {
  const ref = await addDoc(collection(db, 'buildLogs'), strip({
    ...author,
    title: data.title?.trim() || undefined,
    built: data.built.trim(),
    broke: data.broke?.trim() || undefined,
    next:  data.next?.trim() || undefined,
    tags:  data.tags,
    link:  data.link?.trim() || undefined,
    reactions: { relate: [], inspire: [], collab: [] },
    createdAt: serverTimestamp(),
  }));
  return ref.id;
}

export async function getBuildLogsByAuthor(authorUid: string, maxResults = 50): Promise<BuildLog[]> {
  try {
    const q = query(
      collection(db, 'buildLogs'),
      where('authorUid', '==', authorUid),
      orderBy('createdAt', 'desc'),
      limit(maxResults)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() })) as BuildLog[];
  } catch {
    const snap = await getDocs(collection(db, 'buildLogs'));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }) as BuildLog)
      .filter(b => b.authorUid === authorUid)
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      .slice(0, maxResults);
  }
}

export async function toggleBuildLogReaction(
  logId: string, uid: string, type: 'relate' | 'inspire' | 'collab'
): Promise<void> {
  const ref = doc(db, 'buildLogs', logId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const arr: string[] = snap.data().reactions?.[type] ?? [];
  await updateDoc(ref, {
    [`reactions.${type}`]: arr.includes(uid) ? arrayRemove(uid) : arrayUnion(uid),
  });
}

export async function deleteBuildLog(logId: string): Promise<void> {
  await deleteDoc(doc(db, 'buildLogs', logId));
}
