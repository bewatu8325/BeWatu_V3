/**
 * BeWatu Internal Operations Platform v2
 * ops.bewatu.com — Real Firebase Auth + Firestore
 *
 * WHAT'S REAL:
 *  - Firebase Auth login gated by ops_staff collection
 *  - Support Tickets: full CRUD, real-time onSnapshot, assign, resolve, escalate
 *  - Users: reads live from Firestore users collection
 *  - Verification Queue: reads live from verificationRequests collection
 *  - Audit Log: real writes + reads from audit_log collection
 *  - All actions write to audit_log immutably
 *
 * WHAT'S STILL MOCK (clearly marked, easy to wire later):
 *  - Companies (no ops fields in schema yet)
 *  - Fraud cases (collection not created yet)
 *  - Finance / payments (Stripe not yet integrated)
 *  - Content reports (collection not created yet)
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  NotificationBell, GlobalSearch, AppealManagement, BulletinBanner,
  MacroPicker, SLAConfig, MFAGate, UserActivityHistory, BulkActionBar,
  ScheduledReports,
} from "./features.jsx";
import { PolicyGate, PolicyVersionAdmin } from "./features3.jsx";
import { QueueManagement, AgentHandoffBanner, handleAITakeover, AIAgentActivityPanel, AGENTIC_KB_ARTICLE } from "./features4.jsx";
import {
  useTicketPresence, PresenceAvatars,
  useDraftAutosave, DraftBanner,
  useKeyboardShortcuts, ShortcutHelp,
  useTicketTimer, useTicketTotalTime,
  AgentStatusPicker, AgentStatusDot, AGENT_STATUSES,
  CSATBadge, computeCSAT,
  ProactiveEmailLog,
  KBArticlePicker, KnowledgeBase,
  TicketTagEditor,
  TicketMergeButton,
  slaStatusWithPause,
  AIReplyButton,
  WatchlistButton, WatchlistDot, WATCHLIST_CATEGORIES,
  OnboardingChecklist,
} from "./features2.jsx";
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  sendPasswordResetEmail, createUserWithEmailAndPassword,
} from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc,
  onSnapshot, query, orderBy, where, limit, serverTimestamp,
  Timestamp,
} from "firebase/firestore";

// ─── FIREBASE INIT ────────────────────────────────────────────────────────────
// Uses same env vars as the consumer app — same Firebase project, different collections

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
// experimentalAutoDetectLongPolling fixes Safari CORS on Firestore streaming
const db = (() => {
  try { return initializeFirestore(app, { experimentalAutoDetectLongPolling: true }); }
  catch { return getFirestore(app); }
})();

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

// ─── ROLE SYSTEM ─────────────────────────────────────────────────────────────
// Three tiers: Admin (10), Manager (5-7), Agent (1-3)
// Each role has: tier, label, color, level, queue (which queue they work),
// canGraduateTo (roles they can be promoted into, by a Manager or Admin),
// managedBy (minimum tier that can change this role)

const ROLES = {
  // ── ADMIN TIER (level 10) ─────────────────────────────────────────────────
  // Full platform control. Can manage all roles, all queues, all actions.
  // Only another platform_admin can grant or revoke this role.
  platform_admin: {
    label: "Platform Admin", color: "#f59e0b", level: 10, tier: "admin",
    queue: null,  // access to all queues
    canGraduateTo: [],  // can only be set by another platform_admin
    managedBy: "admin",
    description: "Full platform access. Manages all queues, roles, and config.",
  },

  // ── MANAGER TIER (levels 5–7) ─────────────────────────────────────────────
  // Oversee agents in their domain. Can assign, re-queue, approve escalations.
  // Cannot manage other managers or admins. Promoted from agent by admin.
  support_manager: {
    label: "Support Manager", color: "#3b82f6", level: 7, tier: "manager",
    queue: "Support",
    canGraduateTo: ["support_agent"],  // can promote agents within their queue
    managedBy: "admin",
    description: "Manages Support queue agents. Sees all Support tickets, can re-queue, approve closures, view CSAT.",
  },
  trust_manager: {
    label: "Trust & Safety Mgr", color: "#f97316", level: 7, tier: "manager",
    queue: "Trust & Safety",
    canGraduateTo: ["trust_agent"],
    managedBy: "admin",
    description: "Manages Trust & Safety queue. Approves escalations, oversees content moderation.",
  },
  legal_manager: {
    label: "Legal Manager", color: "#a855f7", level: 6, tier: "manager",
    queue: "Legal",
    canGraduateTo: ["legal_agent"],
    managedBy: "admin",
    description: "Manages Legal & Privacy queues. Reviews credential change requests and sensitive cases.",
  },
  finance_manager: {
    label: "Finance Manager", color: "#1a4a3a", level: 6, tier: "manager",
    queue: "Finance",
    canGraduateTo: ["finance_agent"],
    managedBy: "admin",
    description: "Manages Finance & Subscription queues. Approves billing adjustments.",
  },
  verification_manager: {
    label: "Verification Manager", color: "#8b5cf6", level: 5, tier: "manager",
    queue: "Verification",
    canGraduateTo: ["verification_agent"],
    managedBy: "admin",
    description: "Manages company verification pipeline. Approves/rejects verification requests.",
  },

  // ── AGENT TIER (levels 1–3) ───────────────────────────────────────────────
  // Handle tickets in their assigned queue. Cannot change roles or config.
  // Promoted from agent to senior_agent by their queue manager.
  support_agent: {
    label: "Support Agent", color: "#64748b", level: 3, tier: "agent",
    queue: "Support",
    canGraduateTo: [],
    managedBy: "manager",
    description: "Handles Support queue tickets. Can reply, assign to self, mark resolved.",
  },
  trust_agent: {
    label: "Trust & Safety Agent", color: "#f97316", level: 3, tier: "agent",
    queue: "Trust & Safety",
    canGraduateTo: [],
    managedBy: "manager",
    description: "Handles Trust & Safety queue. Can moderate content and process safety reports.",
  },
  legal_agent: {
    label: "Legal Agent", color: "#a855f7", level: 2, tier: "agent",
    queue: "Legal",
    canGraduateTo: [],
    managedBy: "manager",
    description: "Handles Legal & Privacy queue tickets under legal manager oversight.",
  },
  finance_agent: {
    label: "Finance Agent", color: "#1a4a3a", level: 2, tier: "agent",
    queue: "Finance",
    canGraduateTo: [],
    managedBy: "manager",
    description: "Handles Finance & Subscription queue tickets.",
  },
  verification_agent: {
    label: "Verification Agent", color: "#8b5cf6", level: 1, tier: "agent",
    queue: "Verification",
    canGraduateTo: [],
    managedBy: "manager",
    description: "Reviews company verification documents and runs initial checks.",
  },
  auditor: {
    label: "Auditor", color: "#57534e", level: 1, tier: "agent",
    queue: null,
    canGraduateTo: [],
    managedBy: "admin",
    description: "Read-only access to all modules and audit log. No write permissions.",
  },
  investigator: {
    label: "Investigator", color: "#dc2626", level: 3, tier: "agent",
    queue: "Investigations",
    canGraduateTo: ["trust_agent","legal_agent"],
    managedBy: "trust_manager",
    description: "Reviews watchlisted users, conducts fraud investigations, issues final determinations. Can write to fraud_list and watchlists.",
  },

  cyber_agent: {
    label: "Cyber Agent", color: "#06b6d4", level: 3, tier: "agent",
    queue: "Security",
    canGraduateTo: [],
    managedBy: "admin",
    description: "Monitors security findings, triages vulnerabilities, marks false positives. Cannot approve remediations.",
  },

  // ── Agentic AI roles ── autonomous agents that handle tickets first
  ai_support_agent: {
    label: "AI Support Agent", color: "#6366f1", level: 2, tier: "agent",
    queue: "Support",
    canGraduateTo: ["support_agent"],
    managedBy: "support_manager",
    isAI: true,
    description: "Autonomous AI agent handling Support-queue tickets. Responds empathetically, resolves eligible issues, and escalates to human agents when needed.",
  },
  ai_trust_agent: {
    label: "AI Trust Agent", color: "#8b5cf6", level: 2, tier: "agent",
    queue: "Trust & Safety",
    canGraduateTo: ["trust_agent"],
    managedBy: "trust_manager",
    isAI: true,
    description: "Autonomous AI agent triaging Trust & Safety tickets. Routes immediately to human agents for all critical content.",
  },
};

// Helpers for tier checks
const isTierAdmin   = (role) => ROLES[role]?.tier === "admin";
const isTierManager = (role) => ROLES[role]?.tier === "manager";
const isTierAgent   = (role) => ROLES[role]?.tier === "agent";
const getTier       = (role) => ROLES[role]?.tier || "agent";

// Who can assign which role (used in role-change UI guards)
function canChangeRole(actorRole, targetCurrentRole, newRole) {
  if (actorRole === "platform_admin") return true;               // admin can do anything
  if (isTierAdmin(targetCurrentRole) || isTierAdmin(newRole)) return false; // can't touch admin
  if (isTierManager(actorRole)) {
    // manager can only change agents in their own queue
    const actorQueue = ROLES[actorRole]?.queue;
    const targetQueue = ROLES[targetCurrentRole]?.queue;
    const newQueue = ROLES[newRole]?.queue;
    return isTierAgent(targetCurrentRole) && isTierAgent(newRole) &&
           actorQueue === targetQueue && actorQueue === newQueue;
  }
  return false;
}

const PERMISSIONS = {
  // All authenticated ops staff see dashboard
  dashboard:    ["platform_admin","support_manager","trust_manager","legal_manager","finance_manager","verification_manager","support_agent","trust_agent","legal_agent","finance_agent","verification_agent","auditor","cyber_agent"],
  // User lookup: support + trust + legal + managers + admin
  users:        ["platform_admin","support_manager","trust_manager","legal_manager","support_agent","trust_agent","legal_agent","auditor"],
  // Companies: verification pipeline + admin
  companies:    ["platform_admin","verification_manager","verification_agent","auditor"],
  // Fraud: removed as separate domain — trust & safety queue handles it now
  fraud:        ["platform_admin","trust_manager","trust_agent","auditor"],
  // Tickets: all agents and managers see the queue UI (filtered by their queue)
  tickets:      ["platform_admin","support_manager","trust_manager","legal_manager","finance_manager","support_agent","trust_agent","legal_agent","finance_agent","auditor"],
  // Moderation: trust domain
  moderation:   ["platform_admin","trust_manager","trust_agent","auditor"],
  // Verification: verification domain
  verification: ["platform_admin","verification_manager","verification_agent","auditor"],
  // Finance: finance domain
  finance:      ["platform_admin","finance_manager","finance_agent","auditor"],
  // Audit log: admin + auditor + managers
  audit:        ["platform_admin","support_manager","trust_manager","legal_manager","finance_manager","verification_manager","auditor"],
  // Team management: admin only for full view; managers see their team
  team:         ["platform_admin","support_manager","trust_manager","legal_manager","finance_manager","verification_manager"],
  // Recruiter applications: admin + trust manager
  recruiters:   ["platform_admin","trust_manager","trust_agent","auditor"],
  // Credential change requests: legal + admin
  credentials:  ["platform_admin","legal_manager","support_manager"],
  // Data export requests (GDPR Art. 15) — legal + admin only
  data_requests: ["platform_admin","legal_manager","legal_agent","auditor"],
  // Appeals: trust/legal/support managers + admin
  queues:       ["platform_admin","support_manager","trust_manager","legal_manager","finance_manager","verification_manager","support_agent","trust_agent","legal_agent","finance_agent","verification_agent","ai_support_agent","ai_trust_agent","investigator"],
  watchlists:   ["platform_admin","trust_manager","legal_manager","support_manager","trust_agent","legal_agent","investigator","auditor"],
  appeals:      ["platform_admin","trust_manager","legal_manager","support_manager","trust_agent","legal_agent","auditor"],
  // SLA config: admin only
  sla:            ["platform_admin"],
  policies:       ["platform_admin"],
  // Security: platform_admin can approve remediations; cyber_agent can view and triage
  security:       ["platform_admin","cyber_agent","auditor"],
  // Scheduled reports: admin + all managers
  reports:      ["platform_admin","support_manager","trust_manager","legal_manager","finance_manager","verification_manager"],
  kb:           ["platform_admin","support_manager","trust_manager","legal_manager","finance_manager","verification_manager","support_agent","trust_agent","legal_agent","finance_agent","verification_agent","auditor"],
};

const RECOVERY_STATES = {
  ACTIVE:              { color: "#1a4a3a", label: "Active",              next: [] },
  RECOVERY_LOCKED:     { color: "#ef4444", label: "Recovery Locked",     next: ["RECOVERY_SHELL","SUSPENDED"] },
  RECOVERY_SHELL:      { color: "#f97316", label: "Recovery Shell",      next: ["PROVISIONAL_RESTORE","SUSPENDED"] },
  PROVISIONAL_RESTORE: { color: "#f59e0b", label: "Provisional Restore", next: ["FULLY_RESTORED","RECOVERY_LOCKED"] },
  FULLY_RESTORED:      { color: "#1a4a3a", label: "Fully Restored",      next: ["RECOVERY_LOCKED"] },
  SUSPENDED:           { color: "#6b7280", label: "Suspended",           next: ["ACTIVE"] },
};

const TICKET_STATUSES = {
  open:                 { color:"#64748b", label:"Open"                  },
  assigned:             { color:"#3b82f6", label:"Assigned"              },
  pending_user:         { color:"#f59e0b", label:"Pending User"          },
  in_progress:          { color:"#06b6d4", label:"In Progress"           },
  pending_customer:     { color:"#f59e0b", label:"Pending Customer"      },
  escalated:            { color:"#8b5cf6", label:"Escalated"             },
  // Investigation pipeline
  under_review:         { color:"#f97316", label:"Under Review"          },
  investigating:        { color:"#dc2626", label:"Investigating"         },
  pending_evidence:     { color:"#f59e0b", label:"Pending Evidence"      },
  // Final determinations
  confirmed_fraud:      { color:"#b91c1c", label:"⚑ Confirmed Fraud"    },
  confirmed_abuse:      { color:"#9f1239", label:"⚑ Confirmed Abuse"    },
  policy_violation:     { color:"#7c2d12", label:"Policy Violation"      },
  identity_fraud:       { color:"#831843", label:"Identity Fraud"        },
  aml_confirmed:        { color:"#4c1d95", label:"AML Confirmed"         },
  cleared:              { color:"#059669", label:"✓ Cleared"             },
  cleared_with_warning: { color:"#0891b2", label:"✓ Cleared w/ Warning" },
  referred_externally:  { color:"#374151", label:"Referred Externally"   },
  resolved:             { color:"#1a4a3a", label:"Resolved"              },
  closed:               { color:"#57534e", label:"Closed"                },
};
const FRAUD_DETERMINATION_STATUSES = ["confirmed_fraud","identity_fraud","aml_confirmed","confirmed_abuse"];

const TICKET_CATEGORIES = ["account","billing","technical","safety","content","verification","other"];
const TICKET_PRIORITIES  = ["critical","high","medium","low"];

// ─── FIRESTORE SERVICE ────────────────────────────────────────────────────────
// All Firebase reads/writes isolated here for easy testing & replacement

/** Fetch ops staff profile for a given Firebase Auth UID */
async function fetchOpsStaff(uid) {
  const snap = await getDoc(doc(db, "ops_staff", uid));
  if (!snap.exists()) return null;
  return { uid, ...snap.data() };
}

/** Write an immutable audit log entry */
async function writeAuditEntry({
  action, actorUid, actorEmail, actorRole,
  targetId, targetType, before, after, reason, ip = "unknown",
}) {
  await addDoc(collection(db, "audit_log"), {
    action, actorUid, actorEmail, actorRole,
    targetId, targetType,
    before:  before  || null,
    after:   after   || null,
    reason:  reason  || "",
    ip,
    requiresApproval: ["user.suspend","user.recovery_state_change","company.suspend"].includes(action),
    approved: false,
    ts: serverTimestamp(),
  });
}

// ── Support Tickets ───────────────────────────────────────────────────────────

/** Create a new support ticket (ops-initiated or user-facing) */
async function createTicket({ subject, category, priority, userId, userName, userEmail, body, createdByOps, staffUid }) {
  const ref = await addDoc(collection(db, "support_tickets"), {
    subject, category, priority,
    userId:       userId       || null,
    userName:     userName     || "Unknown",
    userEmail:    userEmail    || null,
    body:         body         || "",
    status:       "open",
    assignedTo:   null,
    assignedName: null,
    slaBreached:  false,
    slaDeadline:  new Date(Date.now() + slaHoursForPriority(priority, null, null) * 3600000),
    notes:        [],
    createdByOps: createdByOps || false,
    staffUid:     staffUid     || null,
    createdAt:    serverTimestamp(),
    updatedAt:    serverTimestamp(),
    resolvedAt:   null,
  });
  return ref.id;
}

function slaHoursForPriority(p, queue, qCfg) {
  // Use queue-specific SLA hours from runtime config if available
  if (queue && qCfg && qCfg[queue]?.slaHours) {
    return qCfg[queue].slaHours;
  }
  return { critical: 2, high: 8, medium: 24, low: 72 }[p] || 24;
}

/** Real-time listener for support tickets with optional filters */
function subscribeToTickets({ status, priority, assignedTo }, callback) {
  let q = query(
    collection(db, "support_tickets"),
    orderBy("createdAt", "desc"),
    limit(200)
  );
  return onSnapshot(q, snap => {
    let tickets = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      createdAt:   toDate(d.data().createdAt),
      updatedAt:   toDate(d.data().updatedAt),
      resolvedAt:  toDate(d.data().resolvedAt),
      slaDeadline: toDate(d.data().slaDeadline),
      slaBreached: d.data().slaDeadline
        ? new Date() > toDate(d.data().slaDeadline) && !["resolved","closed"].includes(d.data().status)
        : false,
    }));
    // Client-side filters (avoids complex composite indexes)
    if (status   && status   !== "all") tickets = tickets.filter(t => t.status   === status);
    if (priority && priority !== "all") tickets = tickets.filter(t => t.priority === priority);
    if (assignedTo === "me" && assignedTo) tickets = tickets.filter(t => t.assignedTo === assignedTo);
    callback(tickets);
  });
}

async function updateTicket(ticketId, updates) {
  await updateDoc(doc(db, "support_tickets", ticketId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

async function addTicketNote(ticketId, { body, authorName, authorUid, internal = true }) {
  const snap = await getDoc(doc(db, "support_tickets", ticketId));
  if (!snap.exists()) return;
  const notes = snap.data().notes || [];
  notes.push({ body, authorName, authorUid, internal, ts: new Date().toISOString() });
  await updateDoc(doc(db, "support_tickets", ticketId), {
    notes,
    updatedAt: serverTimestamp(),
  });
}

// ── Users ─────────────────────────────────────────────────────────────────────

function subscribeToUsers(callback) {
  const q = query(collection(db, "users"), limit(500));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ _firestoreId: d.id, ...d.data() })));
  });
}

async function updateUserStatus(firestoreId, status, staffInfo, reason) {
  await updateDoc(doc(db, "users", firestoreId), {
    accountStatus: status,
    updatedAt: serverTimestamp(),
  });
  await writeAuditEntry({
    action:     status === "suspended" ? "user.suspend" : "user.restore",
    actorUid:   staffInfo.uid,
    actorEmail: staffInfo.email,
    actorRole:  staffInfo.role,
    targetId:   firestoreId,
    targetType: "user",
    before:     { accountStatus: "active" },
    after:      { accountStatus: status },
    reason,
  });
}

async function updateUserRecoveryState(firestoreId, newState, staffInfo, reason) {
  await updateDoc(doc(db, "users", firestoreId), {
    recoveryState: newState,
    updatedAt: serverTimestamp(),
  });
  await writeAuditEntry({
    action:     "user.recovery_state_change",
    actorUid:   staffInfo.uid,
    actorEmail: staffInfo.email,
    actorRole:  staffInfo.role,
    targetId:   firestoreId,
    targetType: "user",
    after:      { recoveryState: newState },
    reason,
  });
}

// ── Verification Queue ────────────────────────────────────────────────────────

function subscribeToVerificationQueue(callback) {
  const q = query(
    collection(db, "verificationRequests"),
    orderBy("submittedAt", "desc"),
    limit(100)
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      submittedAt: toDate(d.data().submittedAt),
      ageHours: Math.floor((Date.now() - toDate(d.data().submittedAt).getTime()) / 3600000),
    })));
  });
}

async function decideVerification(requestId, decision, note, staffInfo) {
  await updateDoc(doc(db, "verificationRequests", requestId), {
    status:       decision,
    reviewedBy:   staffInfo.uid,
    reviewerName: staffInfo.name,
    reviewNote:   note || null,
    reviewedAt:   serverTimestamp(),
    updatedAt:    serverTimestamp(),
  });
  await writeAuditEntry({
    action:     `company.verification_${decision}`,
    actorUid:   staffInfo.uid,
    actorEmail: staffInfo.email,
    actorRole:  staffInfo.role,
    targetId:   requestId,
    targetType: "verificationRequest",
    after:      { status: decision },
    reason:     note || `Verification ${decision}`,
  });
}

// ── Audit Log ─────────────────────────────────────────────────────────────────

function subscribeToAppeals(callback) {
  const q = query(collection(db, "appeals"), orderBy("createdAt", "desc"), limit(200));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id:d.id, ...d.data(), createdAt:d.data().createdAt?.toDate?.() })));
  });
}

function subscribeToAuditLog(callback) {
  const q = query(
    collection(db, "audit_log"),
    orderBy("ts", "desc"),
    limit(500)
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      ts: toDate(d.data().ts),
    })));
  });
}

// ── Fraud Cases ───────────────────────────────────────────────────────────────

const FRAUD_SIGNAL_WEIGHTS = {
  impossible_travel:    35,
  credential_stuffing:  30,
  velocity_spike:       25,
  vpn_proxy:            15,
  new_device:           15,
  mass_messaging:       20,
  fake_profile_signals: 20,
  payment_anomaly:      30,
  manual_flag:          25,
};

async function createFraudCase({ userId, userName, userEmail, type, severity, signals, assignedTo, notes, staffInfo }) {
  const riskScore = signals.reduce((sum, s) => sum + (FRAUD_SIGNAL_WEIGHTS[s.type] || 10), 0);
  const ref = await addDoc(collection(db, "fraud_cases"), {
    userId, userName: userName || "Unknown", userEmail: userEmail || null,
    type, severity,
    status:               "open",
    riskScore:            Math.min(riskScore, 100),
    signals,
    attestationsNeeded:   severity === "critical" ? 3 : 2,
    attestationsReceived: 0,
    attestations:         [],
    assignedTo:           assignedTo || null,
    assignedName:         null,
    notes:                notes ? [{ body: notes, authorName: staffInfo.name, authorUid: staffInfo.uid, ts: new Date().toISOString() }] : [],
    resolvedAt:           null,
    resolution:           null,
    createdAt:            serverTimestamp(),
    updatedAt:            serverTimestamp(),
  });
  await writeAuditEntry({
    action: "fraud.case_open", actorUid: staffInfo.uid,
    actorEmail: staffInfo.email, actorRole: staffInfo.role,
    targetId: ref.id, targetType: "fraud_case",
    after: { type, severity, userId },
    reason: `Fraud case opened: ${type}`,
  });
  return ref.id;
}

function subscribeToFraudCases(callback) {
  const q = query(collection(db, "fraud_cases"), orderBy("createdAt", "desc"), limit(200));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({
      id: d.id, ...d.data(),
      createdAt: toDate(d.data().createdAt),
      updatedAt: toDate(d.data().updatedAt),
      resolvedAt: toDate(d.data().resolvedAt),
    })));
  });
}

async function updateFraudCase(caseId, updates, staffInfo, auditReason) {
  await updateDoc(doc(db, "fraud_cases", caseId), { ...updates, updatedAt: serverTimestamp() });
  if (auditReason) {
    await writeAuditEntry({
      action: `fraud.${updates.status || "update"}`, actorUid: staffInfo.uid,
      actorEmail: staffInfo.email, actorRole: staffInfo.role,
      targetId: caseId, targetType: "fraud_case",
      after: updates, reason: auditReason,
    });
  }
}

async function addFraudSignal(caseId, signal, staffInfo) {
  const snap = await getDoc(doc(db, "fraud_cases", caseId));
  if (!snap.exists()) return;
  const data = snap.data();
  const signals = [...(data.signals || []), { ...signal, addedBy: staffInfo.uid, ts: new Date().toISOString() }];
  const riskScore = Math.min(signals.reduce((s, sig) => s + (FRAUD_SIGNAL_WEIGHTS[sig.type] || 10), 0), 100);
  await updateDoc(doc(db, "fraud_cases", caseId), { signals, riskScore, updatedAt: serverTimestamp() });
}

// ── Content Reports ───────────────────────────────────────────────────────────

async function createContentReport({ contentType, contentId, contentPreview, reportedBy, reportedByName, reason, details, staffInfo }) {
  const ref = await addDoc(collection(db, "content_reports"), {
    contentType, contentId,
    contentPreview: contentPreview || null,
    reportedBy:     reportedBy || null,
    reportedByName: reportedByName || "Anonymous",
    reason, details: details || "",
    status:       "pending",
    severity:     deriveSeverity(reason),
    reportCount:  1,
    assignedTo:   null,
    assignedName: null,
    action:       null,
    actionNote:   null,
    actionBy:     null,
    actionAt:     null,
    createdAt:    serverTimestamp(),
    updatedAt:    serverTimestamp(),
  });
  if (staffInfo) {
    await writeAuditEntry({
      action: "content.report_created", actorUid: staffInfo.uid,
      actorEmail: staffInfo.email, actorRole: staffInfo.role,
      targetId: ref.id, targetType: "content_report",
      after: { contentType, reason },
      reason: "Content report filed by ops",
    });
  }
  return ref.id;
}

function deriveSeverity(reason) {
  const critical = ["csam","violence","terrorism","self_harm"];
  const high     = ["harassment","hate_speech","doxxing","fraud"];
  if (critical.includes(reason)) return "critical";
  if (high.includes(reason))     return "high";
  return "medium";
}

function subscribeToContentReports(callback) {
  const q = query(collection(db, "content_reports"), orderBy("createdAt", "desc"), limit(200));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({
      id: d.id, ...d.data(),
      createdAt: toDate(d.data().createdAt),
      updatedAt: toDate(d.data().updatedAt),
    })));
  });
}

async function moderateContent(reportId, action, note, staffInfo) {
  await updateDoc(doc(db, "content_reports", reportId), {
    status: "actioned",
    action, actionNote: note || null,
    actionBy:   staffInfo.uid,
    actionName: staffInfo.name,
    actionAt:   serverTimestamp(),
    updatedAt:  serverTimestamp(),
  });
  await writeAuditEntry({
    action: `content.${action}`, actorUid: staffInfo.uid,
    actorEmail: staffInfo.email, actorRole: staffInfo.role,
    targetId: reportId, targetType: "content_report",
    after: { action, note },
    reason: note || `Content ${action}`,
  });
}

async function dismissReport(reportId, reason, staffInfo) {
  await updateDoc(doc(db, "content_reports", reportId), {
    status: "dismissed",
    actionNote: reason,
    actionBy:   staffInfo.uid,
    actionAt:   serverTimestamp(),
    updatedAt:  serverTimestamp(),
  });
  await writeAuditEntry({
    action: "content.dismissed", actorUid: staffInfo.uid,
    actorEmail: staffInfo.email, actorRole: staffInfo.role,
    targetId: reportId, targetType: "content_report",
    reason: reason || "Report dismissed",
  });
}

// ── Team / Staff ──────────────────────────────────────────────────────────────

function subscribeToOpsStaff(callback) {
  const q = query(collection(db, "ops_staff"), orderBy("createdAt", "desc"));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
  });
}

async function updateStaffRole(targetUid, newRole, staffInfo) {
  const snap = await getDoc(doc(db, "ops_staff", targetUid));
  const before = snap.exists() ? { role: snap.data().role } : {};
  await updateDoc(doc(db, "ops_staff", targetUid), { role: newRole, updatedAt: serverTimestamp() });
  await writeAuditEntry({
    action: "staff.role_change", actorUid: staffInfo.uid,
    actorEmail: staffInfo.email, actorRole: staffInfo.role,
    targetId: targetUid, targetType: "staff",
    before, after: { role: newRole },
    reason: `Role changed to ${newRole}`,
  });
}

async function revokeStaffAccess(targetUid, reason, staffInfo) {
  await updateDoc(doc(db, "ops_staff", targetUid), { isActive: false, revokedAt: serverTimestamp(), revokedBy: staffInfo.uid });
  await writeAuditEntry({
    action: "staff.access_revoked", actorUid: staffInfo.uid,
    actorEmail: staffInfo.email, actorRole: staffInfo.role,
    targetId: targetUid, targetType: "staff",
    after: { isActive: false },
    reason: reason || "Access revoked",
  });
}

async function createOpsStaffRecord({ uid, email, name, role, invitedBy, assignedQueue }) {
  await setDoc(doc(db, "ops_staff", uid), {
    email, name, role,
    assignedQueue: assignedQueue || ROLES[role]?.queue || null,
    isActive:   true,
    mfaEnabled: false,
    invitedBy:  invitedBy || null,
    createdAt:  serverTimestamp(),
    updatedAt:  serverTimestamp(),
  });
}

// ── Queue Config ──────────────────────────────────────────────────────────────

// DEFAULT_QUEUE_CONFIG is the hardcoded fallback.
// At runtime, the root component merges in values from ops_config/sla in Firestore.
// Use the QUEUE_CONFIG exported from root context (passed as prop) wherever live SLA
// hours matter; use DEFAULT_QUEUE_CONFIG for static colour/mailbox lookups.
const DEFAULT_QUEUE_CONFIG = {
  Support:        { mailbox: "support",  color: "#3b82f6", slaHours: 24,  defaultPriority: "medium" },
  Legal:          { mailbox: "legal",    color: "#a855f7", slaHours: 8,   defaultPriority: "high"   },
  "Trust & Safety":{ mailbox: "trust",  color: "#f97316", slaHours: 8,   defaultPriority: "high"   },
  Privacy:        { mailbox: "privacy",  color: "#ec4899", slaHours: 8,   defaultPriority: "high"   },
  Finance:        { mailbox: "billing",  color: "#1a4a3a", slaHours: 24,  defaultPriority: "medium" },
  Verification:   { mailbox: "verify",   color: "#8b5cf6", slaHours: 48,  defaultPriority: "medium" },
  Appeals:        { mailbox: "appeals",  color: "#f59e0b", slaHours: 12,  defaultPriority: "high"   },
  Investigations: { mailbox: "investigations", color: "#dc2626", slaHours: 48, defaultPriority: "high" },
};

async function loadSLAConfig() {
  try {
    const snap = await getDoc(doc(db, "ops_config", "sla"));
    if (!snap.exists()) return DEFAULT_QUEUE_CONFIG;
    const stored = snap.data().queues || {};
    // Merge: stored SLA hours + default priority override the hardcoded values
    const merged = { ...DEFAULT_QUEUE_CONFIG };
    Object.entries(stored).forEach(([queue, cfg]) => {
      if (merged[queue]) {
        merged[queue] = { ...merged[queue], ...cfg };
      }
    });
    return merged;
  } catch {
    return DEFAULT_QUEUE_CONFIG;
  }
}

// ── Credential Change Requests ────────────────────────────────────────────────

async function createCredentialChangeRequest({ uid, userName, userEmail, type, newValue }) {
  return await addDoc(collection(db, "credential_change_requests"), {
    uid, userName, userEmail,
    type,       // "email" | "password"
    newValue,   // new email; empty string for password (ops will send reset link)
    status:     "pending",
    reviewedBy:   null,
    reviewedAt:   null,
    rejectionReason: null,
    requestedAt: serverTimestamp(),
  });
}

function subscribeToCredentialRequests(callback) {
  const q = query(collection(db, "credential_change_requests"), orderBy("requestedAt", "desc"), limit(100));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data(), requestedAt: toDate(d.data().requestedAt) })));
  });
}

async function approveCredentialRequest(reqId, staffInfo) {
  await updateDoc(doc(db, "credential_change_requests", reqId), {
    status: "approved",
    reviewedBy: staffInfo.uid,
    reviewedByName: staffInfo.name,
    reviewedAt: serverTimestamp(),
  });
  await writeAuditEntry({
    action: "user.credential_change_approved", actorUid: staffInfo.uid,
    actorEmail: staffInfo.email, actorRole: staffInfo.role,
    targetId: reqId, targetType: "credential_change_request",
    reason: "Credential change approved by ops",
  });
}

async function rejectCredentialRequest(reqId, reason, staffInfo) {
  await updateDoc(doc(db, "credential_change_requests", reqId), {
    status: "rejected",
    reviewedBy: staffInfo.uid,
    reviewedByName: staffInfo.name,
    reviewedAt: serverTimestamp(),
    rejectionReason: reason,
  });
  await writeAuditEntry({
    action: "user.credential_change_rejected", actorUid: staffInfo.uid,
    actorEmail: staffInfo.email, actorRole: staffInfo.role,
    targetId: reqId, targetType: "credential_change_request",
    reason,
  });
}

// ── Recruiter Applications ────────────────────────────────────────────────────

function subscribeToRecruiterApplications(callback) {
  const q = query(collection(db, "recruiter_applications"), orderBy("createdAt", "desc"), limit(200));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: toDate(d.data().createdAt) })));
  });
}

async function approveRecruiterApplication(appId, staffInfo) {
  await updateDoc(doc(db, "recruiter_applications", appId), {
    status: "approved",
    reviewedBy: staffInfo.uid,
    reviewedByName: staffInfo.name,
    reviewedAt: serverTimestamp(),
  });
  await writeAuditEntry({
    action: "recruiter.approved", actorUid: staffInfo.uid,
    actorEmail: staffInfo.email, actorRole: staffInfo.role,
    targetId: appId, targetType: "recruiter_application",
    reason: "Recruiter application approved",
  });
}

async function rejectRecruiterApplication(appId, reason, staffInfo) {
  await updateDoc(doc(db, "recruiter_applications", appId), {
    status: "rejected",
    reviewedBy: staffInfo.uid,
    reviewedByName: staffInfo.name,
    reviewedAt: serverTimestamp(),
    rejectionReason: reason,
  });
  await writeAuditEntry({
    action: "recruiter.rejected", actorUid: staffInfo.uid,
    actorEmail: staffInfo.email, actorRole: staffInfo.role,
    targetId: appId, targetType: "recruiter_application",
    reason,
  });
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────

function toDate(val) {
  if (!val) return new Date(0);
  if (val instanceof Date) return val;
  if (val?.toDate) return val.toDate(); // Firestore Timestamp
  return new Date(val);
}

function timeAgo(val) {
  if (!val) return "—";
  const diff = Date.now() - toDate(val).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtDateTime(val) {
  if (!val) return "—";
  return toDate(val).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function slaStatus(ticket) {
  if (["resolved","closed"].includes(ticket.status)) return null;
  if (!ticket.slaDeadline) return null;
  const remaining = toDate(ticket.slaDeadline).getTime() - Date.now();
  if (remaining < 0) return { label: "SLA BREACHED", color: "#ef4444", urgent: true };
  const h = Math.floor(remaining / 3600000);
  if (h < 1) return { label: `${Math.floor(remaining/60000)}m left`, color: "#ef4444", urgent: true };
  if (h < 4) return { label: `${h}h left`, color: "#f97316", urgent: false };
  return { label: `${h}h left`, color: "#64748b", urgent: false };
}

// ─── DESIGN TOKENS & SHARED UI ───────────────────────────────────────────────

const C = {
  bg:        "#f5f5f4",   // oklch(97% 0.003 60) — stone-100
  surface:   "#ffffff",   // white cards
  surface2:  "#f5f5f4",   // stone-100 for inner surfaces
  border:    "#e7e5e4",   // oklch(90% 0.004 60) — stone-200
  border2:   "#f0efee",   // lighter inner border
  text:      "#1c1917",   // oklch(15% 0.01 60) — stone-900
  textMuted: "#78716c",   // stone-500
  textDim:   "#a8a29e",   // stone-400
  green:     "#1a4a3a",   // bewatu primary brand green
};

function RiskBadge({ score }) {
  const color = score >= 75 ? "#ef4444" : score >= 50 ? "#f97316" : score >= 25 ? "#f59e0b" : C.green;
  const label = score >= 75 ? "CRITICAL" : score >= 50 ? "HIGH" : score >= 25 ? "MEDIUM" : "LOW";
  return (
    <span style={{ background: color+"22", color, border:`1px solid ${color}44`, borderRadius:4, padding:"1px 6px", fontSize:10, fontWeight:700, letterSpacing:"0.05em", whiteSpace:"nowrap" }}>
      {label} {score}
    </span>
  );
}

function StatePill({ state }) {
  const s = RECOVERY_STATES[state] || RECOVERY_STATES.ACTIVE;
  return (
    <span style={{ background: s.color+"22", color: s.color, border:`1px solid ${s.color}44`, borderRadius:4, padding:"2px 8px", fontSize:11, fontWeight:600, whiteSpace:"nowrap" }}>
      {s.label}
    </span>
  );
}

function StatusPill({ status, map }) {
  const cfg = map?.[status] || { color: C.textMuted, label: status };
  return (
    <span style={{ background: cfg.color+"22", color: cfg.color, border:`1px solid ${cfg.color}44`, borderRadius:4, padding:"2px 8px", fontSize:11, fontWeight:600, whiteSpace:"nowrap" }}>
      {cfg.label || status}
    </span>
  );
}

function PriorityChip({ priority }) {
  const cfg = {
    critical: { color:"#ef4444", bg:"#ef444415" },
    high:     { color:"#f97316", bg:"#f9731615" },
    medium:   { color:"#f59e0b", bg:"#f59e0b15" },
    low:      { color:"#64748b", bg:"#64748b15" },
  }[priority] || { color:C.textMuted, bg:"transparent" };
  return (
    <span style={{ background:cfg.bg, color:cfg.color, border:`1px solid ${cfg.color}33`, borderRadius:4, padding:"2px 8px", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.04em" }}>
      {priority}
    </span>
  );
}

function Btn({ children, onClick, variant="default", size="md", disabled, fullWidth }) {
  const pad = size === "sm" ? "4px 10px" : size === "lg" ? "10px 20px" : "7px 14px";
  const fz  = size === "sm" ? 11 : size === "lg" ? 14 : 13;
  const variants = {
    default: { background:C.surface,    color:"#57534e", border:`1px solid ${C.border}` },
    primary: { background:"#1d4ed8",    color:"#fff",    border:"1px solid #2563eb"     },
    success: { background:"#e8f4f0",  color:C.green,   border:`1px solid ${C.green}40`},
    danger:  { background:"#ef444415",  color:"#ef4444", border:"1px solid #ef444440"   },
    warning: { background:"#f59e0b15",  color:"#f59e0b", border:"1px solid #f59e0b40"   },
    purple:  { background:"#8b5cf615",  color:"#8b5cf6", border:"1px solid #8b5cf640"   },
    ghost:   { background:"transparent",color:C.textMuted,border:"none"                 },
  };
  const v = variants[variant] || variants.default;
  return (
    <button
      onClick={disabled ? undefined : onClick}
      style={{
        ...v, padding:pad, fontSize:fz,
        borderRadius:6, fontWeight:600, fontFamily:"inherit",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        width: fullWidth ? "100%" : undefined,
        transition:"opacity 0.15s, background 0.15s",
        whiteSpace:"nowrap",
      }}
    >
      {children}
    </button>
  );
}

function Input({ value, onChange, placeholder, type="text", style, autoFocus }) {
  return (
    <input
      value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} type={type} autoFocus={autoFocus}
      style={{
        background:C.surface2, border:`1px solid ${C.border}`, borderRadius:6,
        color:C.text, padding:"7px 12px", fontSize:13, outline:"none",
        fontFamily:"inherit", ...style,
      }}
    />
  );
}

function Textarea({ value, onChange, placeholder, rows=4 }) {
  return (
    <textarea
      value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} rows={rows}
      style={{
        width:"100%", background:C.surface2, border:`1px solid ${C.border}`,
        borderRadius:6, color:C.text, padding:"8px 12px", fontSize:13,
        fontFamily:"inherit", resize:"vertical", outline:"none",
        boxSizing:"border-box",
      }}
    />
  );
}

function Select({ value, onChange, options, style }) {
  return (
    <select
      value={value} onChange={e => onChange(e.target.value)}
      style={{
        background:C.surface2, border:`1px solid ${C.border}`, borderRadius:6,
        color:C.text, padding:"7px 12px", fontSize:13, outline:"none",
        fontFamily:"inherit", cursor:"pointer", ...style,
      }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Modal({ title, onClose, children, width=640, subtitle }) {
  useEffect(() => {
    const handler = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      style={{ position:"fixed", inset:0, background:"rgba(28,25,23,0.6)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}
      onClick={onClose}
    >
      <div
        style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, width:"100%", maxWidth:width, maxHeight:"88vh", overflow:"auto", boxShadow:"0 8px 32px rgba(28,25,23,0.12),0 2px 8px rgba(28,25,23,0.06)" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", padding:"18px 24px 16px", borderBottom:`1px solid ${C.border}`, position:"sticky", top:0, background:C.surface, zIndex:1 }}>
          <div>
            <p style={{ color:C.text, fontWeight:800, fontSize:16, margin:0 }}>{title}</p>
            {subtitle && <p style={{ color:C.textMuted, fontSize:12, margin:"3px 0 0" }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:C.textMuted, cursor:"pointer", fontSize:22, lineHeight:1, padding:"0 0 0 16px" }}>×</button>
        </div>
        <div style={{ padding:24 }}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children, required }) {
  return (
    <div style={{ marginBottom:16 }}>
      <p style={{ color:C.textMuted, fontSize:12, fontWeight:600, margin:"0 0 6px" }}>
        {label}{required && <span style={{ color:"#ef4444", marginLeft:3 }}>*</span>}
      </p>
      {children}
    </div>
  );
}

function InfoRow({ label, value, valueColor }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", padding:"7px 0", borderBottom:`1px solid ${C.border2}` }}>
      <span style={{ color:C.textMuted, fontSize:12, flexShrink:0, marginRight:16 }}>{label}</span>
      <span style={{ color:valueColor || "#cbd5e1", fontSize:12, textAlign:"right", wordBreak:"break-all" }}>{value ?? "—"}</span>
    </div>
  );
}

function Table({ cols, rows, onRow, emptyMsg="No records found", loading }) {
  return (
    <div style={{ overflowX:"auto" }}>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
        <thead>
          <tr style={{ borderBottom:`1px solid ${C.border}` }}>
            {cols.map(c => (
              <th key={c.key} style={{ padding:"10px 14px", color:"#57534e", fontWeight:700, fontSize:11, textTransform:"uppercase", letterSpacing:"0.07em", textAlign:"left", whiteSpace:"nowrap", background:"#f9f7f6", borderBottom:"1px solid #e7e5e4" }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={cols.length} style={{ padding:40, textAlign:"center", color:C.textDim }}>
              <span style={{ animation:"spin 1s linear infinite", display:"inline-block" }}>⟳</span> Loading…
            </td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={cols.length} style={{ padding:48, textAlign:"center", color:C.textDim }}>{emptyMsg}</td></tr>
          ) : rows.map((row, i) => (
            <tr
              key={row.id || i}
              onClick={() => onRow?.(row)}
              style={{ borderBottom:`1px solid ${C.border2}`, cursor:onRow?"pointer":"default", transition:"background 0.1s" }}
              onMouseEnter={e => { if(onRow) e.currentTarget.style.background="#1e293b30"; }}
              onMouseLeave={e => { e.currentTarget.style.background="transparent"; }}
            >
              {cols.map(c => (
                <td key={c.key} style={{ padding:"10px 14px", color:"#cbd5e1", verticalAlign:"middle" }}>
                  {c.render ? c.render(row) : (row[c.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Metric({ label, value, color=C.green, sub, alert }) {
  return (
    <div style={{ background:C.surface2, border:`1px solid ${alert ? "#ef444440" : C.border}`, borderRadius:10, padding:"16px 18px" }}>
      <p style={{ color:C.textMuted, fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", margin:"0 0 8px" }}>{label}</p>
      <p style={{ color: alert ? "#ef4444" : color, fontSize:26, fontWeight:800, margin:"0 0 4px", lineHeight:1 }}>{value}</p>
      {sub && <p style={{ color:C.textDim, fontSize:11, margin:0 }}>{sub}</p>}
    </div>
  );
}

function Toast({ message, type="success", onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);
  const color = type === "error" ? "#ef4444" : type === "warning" ? "#f59e0b" : C.green;
  return (
    <div style={{ position:"fixed", bottom:24, right:24, zIndex:2000, background:C.surface, border:`1px solid ${color}40`, borderRadius:10, padding:"12px 18px", boxShadow:"0 4px 16px rgba(28,25,23,0.10)", display:"flex", alignItems:"center", gap:10, maxWidth:380 }}>
      <span style={{ color, fontSize:16 }}>{type==="error"?"✕":type==="warning"?"⚠":"✓"}</span>
      <span style={{ color:C.text, fontSize:13 }}>{message}</span>
    </div>
  );
}

// ─── MODULE: SUPPORT TICKETS (fully wired to Firebase) ───────────────────────

function SupportTickets({ staff, filterMineOnly = false, queueConfig = DEFAULT_QUEUE_CONFIG }) {
  const [tickets, setTickets]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [selected, setSelected]         = useState(null);
  const [selectedIds, setSelectedIds]   = useState([]);
  const [showCreate, setShowCreate]     = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterQueue, setFilterQueue]   = useState("all");
  const [filterMine, setFilterMine]     = useState(filterMineOnly);
  const [search, setSearch]             = useState("");
  const [toast, setToast]               = useState(null);
  const [submitting, setSubmitting]     = useState(false);
  const [staffList, setStaffList]       = useState([]);

  // Tier-aware write permissions
  const isReadOnly = staff.role === "auditor";
  const canWrite   = !isReadOnly;
  const isAdmin    = isTierAdmin(staff.role);
  const isManager  = isTierManager(staff.role);
  const staffQueue = ROLES[staff.role]?.queue; // null = all queues

  // Fetch staff list for assign-to-agent picker
  useEffect(() => {
    subscribeToOpsStaff(data => setStaffList(data.filter(s => s.isActive !== false)));
  }, []);

  // Real-time subscription
  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToTickets({}, (data) => {
      setTickets(data);
      setLoading(false);
      setSelected(prev => prev ? data.find(t => t.id === prev.id) || prev : null);
    });
    return unsub;
  }, []);

  const showToast = (message, type="success") => setToast({ message, type });

  // Apply client-side filters
  const filtered = useMemo(() => {
    let result = tickets;
    // Non-admin, non-manager agents only see their queue's tickets
    if (isTierAgent(staff.role) && staffQueue) {
      result = result.filter(t => t.queue === staffQueue || !t.queue);
    }
    // Queue managers see their queue by default
    if (isManager && staffQueue && filterQueue === "all") {
      result = result.filter(t => t.queue === staffQueue || !t.queue);
    }
    if (search) result = result.filter(t =>
      t.subject?.toLowerCase().includes(search.toLowerCase()) ||
      t.userName?.toLowerCase().includes(search.toLowerCase()) ||
      t.userEmail?.toLowerCase().includes(search.toLowerCase()) ||
      t.id?.includes(search)
    );
    if (filterStatus !== "all")   result = result.filter(t => t.status === filterStatus);
    if (filterPriority !== "all") result = result.filter(t => t.priority === filterPriority);
    if (filterQueue !== "all" && (isAdmin || isManager)) result = result.filter(t => t.queue === filterQueue);
    if (filterMine)               result = result.filter(t => t.assignedTo === staff.uid);
    return result;
  }, [tickets, search, filterStatus, filterPriority, filterQueue, filterMine, staff.uid, staffQueue, isAdmin, isManager]);

  // Derived stats
  const stats = useMemo(() => ({
    open:      tickets.filter(t => t.status === "open").length,
    critical:  tickets.filter(t => t.priority === "critical" && !["resolved","closed"].includes(t.status)).length,
    breached:  tickets.filter(t => t.slaBreached).length,
    mine:      tickets.filter(t => t.assignedTo === staff.uid && !["resolved","closed"].includes(t.status)).length,
    unassigned:tickets.filter(t => !t.assignedTo && !["resolved","closed"].includes(t.status)).length,
  }), [tickets, staff.uid]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleAssignToMe = async (ticket) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await updateTicket(ticket.id, {
        assignedTo:   staff.uid,
        assignedName: staff.name,
        status: ticket.status === "open" ? "assigned" : ticket.status,
      });
      await writeAuditEntry({
        action: "ticket.assign", actorUid: staff.uid,
        actorEmail: staff.email, actorRole: staff.role,
        targetId: ticket.id, targetType: "ticket",
        before: { assignedTo: ticket.assignedTo },
        after:  { assignedTo: staff.uid },
        reason: "Self-assigned",
      });
      showToast("Ticket assigned to you");
    } catch (e) {
      showToast("Failed to assign: " + e.message, "error");
    } finally { setSubmitting(false); }
  };

  const handleStatusChange = async (ticket, newStatus, reason) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      // SLA pause: freeze clock when entering pending_customer; resume on exit
      const slaUpdates = {};
      if (newStatus === "pending_customer" && ticket.status !== "pending_customer") {
        slaUpdates.slaFrozenAt = serverTimestamp();
      }
      if (ticket.status === "pending_customer" && newStatus !== "pending_customer" && ticket.slaFrozenAt) {
        const frozenMs = Date.now() - (ticket.slaFrozenAt?.toDate?.() ?? new Date(ticket.slaFrozenAt)).getTime();
        slaUpdates.slaFrozenAt   = null;
        slaUpdates.slaPausedMs   = (ticket.slaPausedMs || 0) + frozenMs;
      }
      await updateTicket(ticket.id, {
        status: newStatus,
        ...slaUpdates,
        ...(newStatus === "resolved" || newStatus === "closed" ? { resolvedAt: serverTimestamp() } : {}),
      });
      await writeAuditEntry({
        action: `ticket.${newStatus}`, actorUid: staff.uid,
        actorEmail: staff.email, actorRole: staff.role,
        targetId: ticket.id, targetType: "ticket",
        before: { status: ticket.status },
        after:  { status: newStatus },
        reason: reason || `Status changed to ${newStatus}`,
      });
      showToast(`Ticket ${newStatus}`);
      if (newStatus === "resolved" || newStatus === "closed") setSelected(null);
    } catch (e) {
      showToast("Failed: " + e.message, "error");
    } finally { setSubmitting(false); }
  };

  const handleAddNote = async (ticket, noteBody, isInternal) => {
    if (!noteBody.trim() || submitting) return;
    setSubmitting(true);
    try {
      await addTicketNote(ticket.id, {
        body: noteBody,
        authorName: staff.name,
        authorUid:  staff.uid,
        internal:   isInternal,
      });
      await writeAuditEntry({
        action: "ticket.note_added", actorUid: staff.uid,
        actorEmail: staff.email, actorRole: staff.role,
        targetId: ticket.id, targetType: "ticket",
        reason: isInternal ? "Internal note added" : "Reply sent to user",
      });
      showToast(isInternal ? "Note added" : "Reply sent");
    } catch (e) {
      showToast("Failed: " + e.message, "error");
    } finally { setSubmitting(false); }
  };

  const handleAssignToAgent = async (ticket, agent) => {
    if (submitting) return;
    // Enforce assignment lock: if admin-locked, only admin can reassign
    if (ticket.assignmentLocked && !isAdmin) {
      showToast("This ticket was assigned by an admin and cannot be reassigned.", "error");
      return;
    }
    // Managers can assign but not override another manager's assignment of an admin-locked ticket
    setSubmitting(true);
    try {
      await updateTicket(ticket.id, {
        assignedTo:   agent.uid,
        assignedName: agent.name,
        status: ticket.status === "open" ? "assigned" : ticket.status,
        assignmentLocked:  isAdmin ? true : false,
        assignedByRole:    staff.role,
        assignedByUid:     staff.uid,
      });
      await writeAuditEntry({
        action: "ticket.assign_to_agent", actorUid: staff.uid,
        actorEmail: staff.email, actorRole: staff.role,
        targetId: ticket.id, targetType: "ticket",
        before: { assignedTo: ticket.assignedTo, assignedName: ticket.assignedName },
        after:  { assignedTo: agent.uid, assignedName: agent.name,
                  assignmentLocked: isAdmin, assignedByRole: staff.role },
        reason: `Assigned to ${agent.name} by ${staff.name} (${staff.role})`,
      });
      showToast(`Assigned to ${agent.name}${isAdmin ? " · Admin-locked" : ""}`);
    } catch (e) {
      showToast("Failed to assign: " + e.message, "error");
    } finally { setSubmitting(false); }
  };

  const handleEscalate = async (ticket, reason) => {
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      await updateTicket(ticket.id, {
        status: "escalated",
        priority: ticket.priority === "low" ? "medium" : ticket.priority === "medium" ? "high" : "critical",
        escalationReason: reason,
        escalatedBy: staff.uid,
        escalatedName: staff.name,
      });
      await writeAuditEntry({
        action: "ticket.escalate", actorUid: staff.uid,
        actorEmail: staff.email, actorRole: staff.role,
        targetId: ticket.id, targetType: "ticket",
        before: { status: ticket.status, priority: ticket.priority },
        after:  { status: "escalated" },
        reason,
      });
      showToast("Ticket escalated");
      setSelected(null);
    } catch (e) {
      showToast("Failed: " + e.message, "error");
    } finally { setSubmitting(false); }
  };

  const handleRequeue = async (ticket, queue) => {
    if (!queue) return;
    setSubmitting(true);
    try {
      await updateTicket(ticket.id, {
        queue,
        assignedTo:   null,
        assignedName: null,
        status:       "open",
      });
      await writeAuditEntry({
        action: "ticket.requeue", actorUid: staff.uid,
        actorEmail: staff.email, actorRole: staff.role,
        targetId: ticket.id, targetType: "ticket",
        before: { queue: ticket.queue, assignedTo: ticket.assignedTo },
        after:  { queue },
        reason: `Moved to ${queue} queue`,
      });
      showToast(`Ticket moved to ${queue} queue`);
      setSelected(null);
    } catch (e) {
      showToast("Failed: " + e.message, "error");
    } finally { setSubmitting(false); }
  };

  // Unique queues for dropdown (admin/manager only)
  const availableQueues = useMemo(() =>
    [...new Set(tickets.map(t => t.queue).filter(Boolean))].sort(),
    [tickets]);

  return (
    <div style={{ padding:28 }}>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <h2 style={{ color:C.text, fontSize:20, fontWeight:800, margin:"0 0 4px" }}>
            {filterMineOnly ? "My Queue" : (staffQueue && isTierAgent(staff.role)) ? `${staffQueue} Queue` : "All Tickets"}
          </h2>
          <p style={{ color:C.textMuted, fontSize:13, margin:0 }}>
            Real-time · {filtered.length} tickets · {filtered.filter(t=>!t.assignedTo && !["resolved","closed"].includes(t.status)).length} unassigned
          </p>
        </div>
        {canWrite && (
          <Btn variant="primary" onClick={() => setShowCreate(true)}>+ New Ticket</Btn>
        )}
      </div>

      {/* Queue chip bar — admin and managers only */}
      {(isAdmin || isManager) && !filterMineOnly && availableQueues.length > 0 && (
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
          <button onClick={() => setFilterQueue("all")}
            style={{ padding:"4px 12px", borderRadius:20, border:`1px solid ${filterQueue==="all"?"#1a4a3a":"#e7e5e4"}`, background:filterQueue==="all"?"#e8f4f0":"transparent", color:filterQueue==="all"?"#1a4a3a":"#64748b", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
            All Queues
          </button>
          {availableQueues.map(q => {
            const cfg = queueConfig[q] || DEFAULT_QUEUE_CONFIG[q] || {};
            const count = tickets.filter(t=>t.queue===q && !["resolved","closed"].includes(t.status)).length;
            return (
              <button key={q} onClick={() => setFilterQueue(q)}
                style={{ padding:"4px 12px", borderRadius:20, border:`1px solid ${filterQueue===q?(cfg.color||"#64748b"):"#e7e5e4"}`, background:filterQueue===q?`${cfg.color||"#64748b"}20`:"transparent", color:filterQueue===q?(cfg.color||"#64748b"):"#64748b", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                {q} {count > 0 && `(${count})`}
              </button>
            );
          })}
        </div>
      )}

      {/* Stats bar */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, marginBottom:20 }}>
        <Metric label="Open"       value={filtered.filter(t=>t.status==="open").length}       color="#ef4444" alert={filtered.filter(t=>t.status==="open").length > 20} />
        <Metric label="Critical"   value={filtered.filter(t=>t.priority==="critical"&&!["resolved","closed"].includes(t.status)).length} color="#ef4444" alert sub="unresolved" />
        <Metric label="SLA Breach" value={filtered.filter(t=>t.slaBreached).length}   color="#ef4444" alert={filtered.filter(t=>t.slaBreached).length > 0} sub="immediate action" />
        <Metric label="My Tickets" value={filtered.filter(t=>t.assignedTo===staff.uid&&!["resolved","closed"].includes(t.status)).length} color="#3b82f6" />
        <Metric label="Unassigned" value={filtered.filter(t=>!t.assignedTo&&!["resolved","closed"].includes(t.status)).length} color="#f59e0b" alert={filtered.filter(t=>!t.assignedTo&&!["resolved","closed"].includes(t.status)).length > 10} />
      </div>

      {/* SLA alert banner */}
      {stats.breached > 0 && (
        <div style={{ background:"#ef444415", border:"1px solid #ef444440", borderRadius:8, padding:"12px 16px", marginBottom:16, display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:18 }}>🚨</span>
          <p style={{ color:"#ef4444", fontWeight:700, margin:0, fontSize:14 }}>
            {stats.breached} ticket{stats.breached > 1 ? "s have" : " has"} breached SLA and require immediate attention
          </p>
        </div>
      )}

      {/* Filters */}
      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
        <Input
          value={search} onChange={setSearch}
          placeholder="Search by subject, user, ID…"
          style={{ width:260 }}
        />
        <Select value={filterStatus} onChange={setFilterStatus} options={[
          { value:"all", label:"All Statuses" },
          ...Object.entries(TICKET_STATUSES).map(([k,v]) => ({ value:k, label:v.label }))
        ]} />
        <Select value={filterPriority} onChange={setFilterPriority} options={[
          { value:"all", label:"All Priority" },
          ...TICKET_PRIORITIES.map(p => ({ value:p, label:p.charAt(0).toUpperCase()+p.slice(1) }))
        ]} />
        <button
          onClick={() => setFilterMine(p => !p)}
          style={{
            background: filterMine ? "#1d4ed820" : C.surface2,
            border: `1px solid ${filterMine ? "#3b82f6" : C.border}`,
            color: filterMine ? "#3b82f6" : C.textMuted,
            borderRadius:6, padding:"7px 14px", fontSize:13,
            fontWeight:600, cursor:"pointer", fontFamily:"inherit",
          }}
        >
          {filterMine ? "✓ " : ""}My Tickets
        </button>
        {(filterStatus !== "all" || filterPriority !== "all" || filterMine || search) && (
          <Btn variant="ghost" size="sm" onClick={() => { setFilterStatus("all"); setFilterPriority("all"); setFilterMine(false); setSearch(""); }}>
            Clear filters
          </Btn>
        )}
        <span style={{ color:C.textDim, fontSize:12, marginLeft:"auto" }}>{filtered.length} showing</span>
      </div>

      {/* Table */}
      <div style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:10, overflow:"hidden" }}>
        <Table
          loading={loading}
          emptyMsg="No tickets match your filters"
          cols={[
            { key:"select", label:(
              <input type="checkbox"
                checked={selectedIds.length === filtered.length && filtered.length > 0}
                onChange={e => setSelectedIds(e.target.checked ? filtered.map(t=>t.id) : [])}
                style={{ cursor:"pointer", accentColor:C.green }} />
            ), render: t => (
              <div onClick={e=>e.stopPropagation()}>
                <input type="checkbox"
                  checked={selectedIds.includes(t.id)}
                  onChange={e => setSelectedIds(p => e.target.checked ? [...p,t.id] : p.filter(id=>id!==t.id))}
                  style={{ cursor:"pointer", accentColor:C.green }} />
              </div>
            )},
            { key:"priority", label:"", render: t => <PriorityChip priority={t.priority} /> },
            { key:"subject", label:"Ticket", render: t => (
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
                  {t.slaBreached && <span style={{ color:"#ef4444", fontSize:11, fontWeight:700 }}>⚑ SLA</span>}
                  <span style={{ color:C.text, fontWeight:600, fontSize:13 }}>{t.subject}</span>
                </div>
                <div style={{ color:C.textMuted, fontSize:11 }}>
                  {t.userName} {t.userEmail ? `· ${t.userEmail}` : ""} · {t.category}
                </div>
              </div>
            )},
            { key:"status", label:"Status", render: t => <StatusPill status={t.status} map={TICKET_STATUSES} /> },
            { key:"sla", label:"SLA", render: t => {
              const s = slaStatus(t);
              if (!s) return <span style={{ color:C.textDim, fontSize:12 }}>—</span>;
              return <span style={{ color:s.color, fontSize:12, fontWeight:s.urgent?700:400 }}>{s.label}</span>;
            }},
            { key:"assignedName", label:"Assigned To", render: t => (
              <span style={{ color: !t.assignedName ? "#ef4444" : C.textMuted, fontSize:12 }}>
                {t.assignedName || "Unassigned"}
              </span>
            )},
            { key:"createdAt", label:"Opened", render: t => (
              <span style={{ color:C.textMuted, fontSize:12 }}>{timeAgo(t.createdAt)}</span>
            )},
            { key:"actions", label:"", render: t => (
              <div style={{ display:"flex", gap:6 }} onClick={e => e.stopPropagation()}>
                {!t.assignedTo && canWrite && (
                  <Btn size="sm" variant="default" disabled={submitting} onClick={() => handleAssignToMe(t)}>
                    Claim
                  </Btn>
                )}
                {t.assignedTo !== staff.uid && t.assignedTo && canWrite && (
                  <Btn size="sm" variant="default" disabled={submitting} onClick={() => handleAssignToMe(t)}>
                    Reassign
                  </Btn>
                )}
              </div>
            )},
          ]}
          rows={filtered}
          onRow={setSelected}
        />
      </div>

      {/* ── Bulk Action Bar ── */}
      <BulkActionBar
        selected={selectedIds}
        onClearSelection={() => setSelectedIds([])}
        onBulkAction={(action, ids) => {
          showToast(`${action} applied to ${ids.length} ticket${ids.length>1?"s":""}`);
          setSelectedIds([]);
        }}
        staffList={staffList}
        staff={staff}
      />

      {/* ── Ticket Detail Modal ── */}
      {selected && (
        <TicketDetailModal
          ticket={selected}
          allTickets={tickets}
          staff={staff}
          staffList={staffList}
          canWrite={canWrite}
          isAdmin={isAdmin}
          isManager={isManager}
          submitting={submitting}
          onClose={() => setSelected(null)}
          onAssign={() => handleAssignToMe(selected)}
          onAssignToAgent={(agent) => handleAssignToAgent(selected, agent)}
          onRequeue={(queue) => handleRequeue(selected, queue)}
          onStatus={(status, reason) => handleStatusChange(selected, status, reason)}
          onNote={(body, internal) => handleAddNote(selected, body, internal)}
          onEscalate={(reason) => handleEscalate(selected, reason)}
          showToast={showToast}
        />
      )}

      {/* ── Create Ticket Modal ── */}
      {showCreate && (
        <CreateTicketModal
          staff={staff}
          onClose={() => setShowCreate(false)}
          onCreated={(id) => { setShowCreate(false); showToast(`Ticket created: ${id}`); }}
          showToast={showToast}
        />
      )}

      {toast && <Toast {...toast} onDone={() => setToast(null)} />}
    </div>
  );
}

// ─── TICKET DETAIL MODAL ──────────────────────────────────────────────────────

function TicketDetailModal({ ticket, allTickets, staff, staffList, canWrite, isAdmin, isManager, submitting, onClose, onAssign, onAssignToAgent, onRequeue, onStatus, onNote, onEscalate, showToast }) {
  const [noteBody,         setNoteBody]         = useState("");
  const [noteInternal,     setNoteInternal]     = useState(true);
  const [escalateMode,     setEscalateMode]     = useState(false);
  const [escalateReason,   setEscalateReason]   = useState("");
  const [resolveMode,      setResolveMode]      = useState(false);
  const [resolveReason,    setResolveReason]    = useState("");
  const [showAssignPicker, setShowAssignPicker] = useState(false);
  const [showRequeueMenu,  setShowRequeueMenu]  = useState(false);
  const [showKB,           setShowKB]           = useState(false);
  const [activeTab,        setActiveTab]        = useState("details");

  // Phase 3 features
  const viewers    = useTicketPresence(ticket.id, staff);
  const timeLabel  = useTicketTotalTime(ticket.id);
  useTicketTimer(ticket.id, staff.uid);
  const { hasDraft, restore, clear } = useDraftAutosave(ticket.id, noteBody, setNoteBody);

  const sla = slaStatusWithPause(ticket);
  const isActive = !["resolved","closed"].includes(ticket.status);
  const queues = Object.keys(DEFAULT_QUEUE_CONFIG);

  // Eligible agents: active, not the current assignee, in the right queue
  const eligibleAgents = (staffList || []).filter(s =>
    s.isActive !== false &&
    s.uid !== ticket.assignedTo &&
    (isAdmin || ROLES[s.role]?.queue === (ticket.queue || ROLES[staff.role]?.queue))
  );

  return (
    <Modal
      title={ticket.subject}
      subtitle={`${ticket.id}${ticket.queue ? ` · [${ticket.queue}]` : ""} · opened ${timeAgo(ticket.createdAt)}`}
      onClose={onClose}
      width={820}
    >
      {/* Agentic handoff banner */}
      <AgentHandoffBanner
        ticket={ticket}
        staff={staff}
        submitting={submitting}
        onTakeOver={async () => {
          try { await handleAITakeover(ticket.id, staff); showToast("You have taken over from the AI agent"); }
          catch(e) { showToast(e.message, "error"); }
        }}
      />

      {/* Collision detection */}
      {viewers.length > 0 && (
        <div style={{ marginBottom:10 }}><PresenceAvatars viewers={viewers} /></div>
      )}

      {sla?.urgent && (
        <div style={{ background:"#ef444415", border:"1px solid #ef444440", borderRadius:8, padding:"10px 14px", marginBottom:16 }}>
          <p style={{ color:"#ef4444", fontWeight:700, margin:0, fontSize:13 }}>🚨 {sla.label}</p>
        </div>
      )}

      {/* Meta pills */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:20 }}>
        <PriorityChip priority={ticket.priority} />
        <StatusPill status={ticket.status} map={TICKET_STATUSES} />
        {ticket.queue && (() => {
          const cfg = DEFAULT_QUEUE_CONFIG[ticket.queue];
          return (
            <span style={{ background:`${cfg?.color||"#64748b"}20`, border:`1px solid ${cfg?.color||"#64748b"}40`, borderRadius:4, padding:"2px 8px", fontSize:11, color:cfg?.color||"#64748b", fontWeight:700 }}>
              {ticket.queue}
            </span>
          );
        })()}
        {ticket.source === "email" && (
          <span style={{ background:"#3b82f620", border:"1px solid #3b82f640", borderRadius:4, padding:"2px 8px", fontSize:11, color:"#3b82f6", fontWeight:700 }}>📧 Email</span>
        )}
        {ticket.category && (
          <span style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:4, padding:"2px 8px", fontSize:11, color:C.textMuted }}>{ticket.category}</span>
        )}
        {sla && !sla.urgent && (
          <span style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:4, padding:"2px 8px", fontSize:11, color:sla.color }}>{sla.label}</span>
        )}
        {ticket.csat && <CSATBadge score={ticket.csat} />}
        {timeLabel && <span style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:4, padding:"2px 8px", fontSize:11, color:C.textMuted }}>⏱ {timeLabel}</span>}
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:0, borderBottom:`1px solid ${C.border}`, marginBottom:20 }}>
        {["details","notes","tags","emails","history"].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ background:"none", border:"none", cursor:"pointer", padding:"8px 16px", fontSize:13, fontWeight:600, color:activeTab===tab?C.green:C.textMuted, borderBottom:activeTab===tab?`2px solid ${C.green}`:"2px solid transparent", fontFamily:"inherit", textTransform:"capitalize", marginBottom:-1 }}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "details" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24 }}>
          {/* Left: info */}
          <div>
            <p style={{ color:C.textMuted, fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", margin:"0 0 10px" }}>Customer</p>
            <InfoRow label="Name"  value={ticket.userName} />
            <InfoRow label="Email" value={ticket.userEmail} />
            <InfoRow label="UID"   value={ticket.userId} />
            <p style={{ color:C.textMuted, fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", margin:"20px 0 10px" }}>Ticket</p>
            <InfoRow label="ID"           value={ticket.id} />
            <InfoRow label="Queue"        value={ticket.queue || "—"} />
            <InfoRow label="Category"     value={ticket.category} />
            <InfoRow label="Source"       value={ticket.source || "ops"} />
            <InfoRow label="Created"      value={fmtDateTime(ticket.createdAt)} />
            <InfoRow label="Updated"      value={fmtDateTime(ticket.updatedAt)} />
            {ticket.resolvedAt && <InfoRow label="Resolved" value={fmtDateTime(ticket.resolvedAt)} />}
            <InfoRow label="SLA Deadline" value={ticket.slaDeadline ? fmtDateTime(ticket.slaDeadline) : "—"} />
            {ticket.body && (
              <div style={{ marginTop:20 }}>
                <p style={{ color:C.textMuted, fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 }}>Description</p>
                <div style={{ background:C.surface2, borderRadius:8, padding:12, color:"#57534e", fontSize:13, lineHeight:1.6, border:`1px solid ${C.border}` }}>{ticket.body}</div>
              </div>
            )}
          </div>

          {/* Right: assignment + actions */}
          <div>
            <p style={{ color:C.textMuted, fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", margin:"0 0 10px" }}>Assignment</p>
            <InfoRow label="Assigned To"  value={ticket.assignedName || "Unassigned"} valueColor={!ticket.assignedName?"#ef4444":undefined} />
            {ticket.assignmentLocked && (
              <div style={{ display:"flex", alignItems:"center", gap:6, margin:"4px 0 8px", padding:"5px 10px", background:"#fef9c3", border:"1px solid #fde047", borderRadius:6 }}>
                <span style={{ fontSize:11 }}>🔒</span>
                <span style={{ color:"#854d0e", fontSize:11, fontWeight:600 }}>Admin-locked · Only a Platform Admin can reassign</span>
              </div>
            )}
            <InfoRow label="Assigned UID" value={ticket.assignedTo} />
            {ticket.assignedByRole && <InfoRow label="Assigned By" value={`${ticket.assignedByRole.replace(/_/g," ")}`} />}
            {ticket.escalatedName && <InfoRow label="Escalated By" value={ticket.escalatedName} />}
            {ticket.escalationReason && <InfoRow label="Escalation Reason" value={ticket.escalationReason} />}
            {ticket.pendingCustomerSince && <InfoRow label="Awaiting Customer Since" value={fmtDateTime(ticket.pendingCustomerSince)} />}

            {canWrite && isActive && (
              <div style={{ marginTop:24 }}>
                <p style={{ color:C.textMuted, fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:10 }}>Actions</p>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>

                  {/* Claim — blocked on admin-locked tickets */}
                  {ticket.assignedTo !== staff.uid && !ticket.assignmentLocked && (
                    <Btn variant="primary" disabled={submitting} onClick={onAssign}>
                      {ticket.assignedTo ? "Reassign to Me" : "Claim Ticket"}
                    </Btn>
                  )}
                  {ticket.assignedTo !== staff.uid && ticket.assignmentLocked && !isAdmin && (
                    <div style={{ background:"#fef9c3", border:"1px solid #fde047", borderRadius:7, padding:"8px 12px" }}>
                      <p style={{ color:"#854d0e", fontSize:12, margin:0 }}>🔒 Admin-locked assignment. Only a Platform Admin can reassign this ticket.</p>
                    </div>
                  )}
                  {ticket.assignedTo !== staff.uid && ticket.assignmentLocked && isAdmin && (
                    <Btn variant="primary" disabled={submitting} onClick={onAssign}>
                      Override &amp; Assign to Me (Admin)
                    </Btn>
                  )}

                  {/* Assign to agent picker */}
                  {(isAdmin || isManager) && (
                    <div style={{ position:"relative" }}>
                      <Btn variant="default" disabled={submitting} onClick={() => { setShowAssignPicker(p=>!p); setShowRequeueMenu(false); }}>
                        Assign to Agent ▾
                      </Btn>
                      {showAssignPicker && (
                        <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, zIndex:50, background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, minWidth:270, boxShadow:"0 8px 24px rgba(0,0,0,0.4)", maxHeight:260, overflowY:"auto" }}>
                          {eligibleAgents.length === 0 && (
                            <p style={{ color:C.textDim, fontSize:12, padding:"12px 14px", margin:0 }}>No eligible agents in this queue</p>
                          )}
                          {eligibleAgents.map(agent => (
                            <button key={agent.uid} onClick={() => { onAssignToAgent(agent); setShowAssignPicker(false); }}
                              style={{ display:"block", width:"100%", textAlign:"left", background:"none", border:"none", padding:"10px 14px", cursor:"pointer", fontFamily:"inherit", borderBottom:`1px solid ${C.border}` }}
                              onMouseEnter={e=>e.currentTarget.style.background=C.surface2}
                              onMouseLeave={e=>e.currentTarget.style.background="none"}>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                                <div>
                                  <p style={{ color:C.text, fontSize:13, fontWeight:600, margin:0 }}>
                                    {ROLES[agent.role]?.color && agent.role?.startsWith("ai_") ? "🤖 " : ""}{agent.name}
                                  </p>
                                  <p style={{ color:C.textMuted, fontSize:11, margin:"1px 0 0" }}>{ROLES[agent.role]?.label}</p>
                                </div>
                                <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:3 }}>
                                  {agent.status && (
                                    <span style={{ fontSize:9, fontWeight:700, padding:"1px 5px", borderRadius:3,
                                      background:agent.status==="available"?"#10b98115":agent.status==="busy"?"#f59e0b15":"#64748b15",
                                      color:agent.status==="available"?"#10b981":agent.status==="busy"?"#f59e0b":"#64748b" }}>
                                      {agent.status}
                                    </span>
                                  )}
                                  {isAdmin && ticket.assignmentLocked && (
                                    <span style={{ fontSize:9, color:"#f59e0b" }}>⚡ override</span>
                                  )}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Re-queue picker */}
                  {(isAdmin || isManager) && (
                    <div style={{ position:"relative" }}>
                      <Btn variant="default" disabled={submitting} onClick={() => { setShowRequeueMenu(p=>!p); setShowAssignPicker(false); }}>
                        Move to Queue ▾
                      </Btn>
                      {showRequeueMenu && (
                        <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, zIndex:50, background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, minWidth:200, boxShadow:"0 8px 24px rgba(0,0,0,0.4)" }}>
                          {queues.filter(q => q !== ticket.queue).map(q => {
                            const cfg = DEFAULT_QUEUE_CONFIG[q];
                            return (
                              <button key={q} onClick={() => { onRequeue(q); setShowRequeueMenu(false); }}
                                style={{ display:"block", width:"100%", textAlign:"left", background:"none", border:"none", padding:"9px 14px", cursor:"pointer", fontFamily:"inherit", borderBottom:`1px solid ${C.border}` }}>
                                <span style={{ color:cfg?.color||C.textMuted, fontWeight:700, fontSize:12 }}>{q}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Status transitions */}
                  {ticket.status !== "in_progress" && (
                    <Btn variant="default" disabled={submitting} onClick={() => onStatus("in_progress","Marked in progress")}>Mark In Progress</Btn>
                  )}
                  {ticket.status !== "pending_customer" && (
                    <Btn variant="warning" disabled={submitting} onClick={() => onStatus("pending_customer","Waiting on customer response")}>
                      ⏳ Request Info (Pending Customer)
                    </Btn>
                  )}
                  {!resolveMode && (
                    <Btn variant="success" disabled={submitting} onClick={() => setResolveMode(true)}>✓ Resolve Ticket</Btn>
                  )}
                  {resolveMode && (
                    <div style={{ background:C.surface2, border:`1px solid ${C.green}40`, borderRadius:8, padding:12 }}>
                      <p style={{ color:C.textMuted, fontSize:12, marginBottom:6 }}>Resolution summary <span style={{ color:"#ef4444" }}>*</span></p>
                      <Textarea value={resolveReason} onChange={setResolveReason} placeholder="Describe how this was resolved…" rows={3} />
                      <div style={{ display:"flex", gap:8, marginTop:8 }}>
                        <Btn variant="success" disabled={submitting||!resolveReason.trim()} onClick={() => { onStatus("resolved",resolveReason); setResolveMode(false); }}>Confirm Resolve</Btn>
                        <Btn variant="ghost" onClick={() => setResolveMode(false)}>Cancel</Btn>
                      </div>
                    </div>
                  )}
                  {!escalateMode && (
                    <Btn variant="purple" disabled={submitting} onClick={() => setEscalateMode(true)}>↑ Escalate</Btn>
                  )}
                  {escalateMode && (
                    <div style={{ background:C.surface2, border:"1px solid #8b5cf640", borderRadius:8, padding:12 }}>
                      <p style={{ color:C.textMuted, fontSize:12, marginBottom:6 }}>Escalation reason <span style={{ color:"#ef4444" }}>*</span></p>
                      <Textarea value={escalateReason} onChange={setEscalateReason} placeholder="Why is this being escalated?" rows={3} />
                      <div style={{ display:"flex", gap:8, marginTop:8 }}>
                        <Btn variant="purple" disabled={submitting||!escalateReason.trim()} onClick={() => { onEscalate(escalateReason); setEscalateMode(false); }}>Confirm Escalate</Btn>
                        <Btn variant="ghost" onClick={() => setEscalateMode(false)}>Cancel</Btn>
                      </div>
                    </div>
                  )}
                  <Btn variant="danger" disabled={submitting} onClick={() => onStatus("closed","Closed by ops")}>Close Ticket</Btn>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "notes" && (
        <div>
          {(ticket.notes||[]).length === 0 ? (
            <p style={{ color:C.textDim, fontSize:13, marginBottom:20 }}>No notes yet.</p>
          ) : (
            <div style={{ marginBottom:24 }}>
              {[...(ticket.notes||[])].reverse().map((note,i) => {
                const isCustomer = note.channel==="email" && !note.internal;
                const bg    = note.internal?"#1d4ed810":isCustomer?"#10b98110":"#06b6d410";
                const bdr   = note.internal?"#3b82f640":isCustomer?"#b6ddd2":"#06b6d440";
                const col   = note.internal?"#3b82f6":isCustomer?"#1a4a3a":"#06b6d4";
                const label = note.internal?"🔒 Internal Note":isCustomer?"📨 Customer Reply":"💬 Reply to Customer";
                return (
                  <div key={i} style={{ background:bg, border:`1px solid ${bdr}`, borderRadius:8, padding:14, marginBottom:10 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                      <span style={{ color:col, fontSize:12, fontWeight:700 }}>{label} · {note.authorName}</span>
                      <span style={{ color:C.textDim, fontSize:11 }}>{timeAgo(note.ts)}</span>
                    </div>
                    <p style={{ color:"#57534e", fontSize:13, margin:0, lineHeight:1.6 }}>{note.body}</p>
                  </div>
                );
              })}
            </div>
          )}
          {canWrite && (
            <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:20 }}>
              <div style={{ display:"flex", gap:8, marginBottom:10, flexWrap:"wrap" }}>
                <button onClick={() => setNoteInternal(true)}
                  style={{ background:noteInternal?"#1d4ed820":"transparent", border:`1px solid ${noteInternal?"#3b82f6":C.border}`, color:noteInternal?"#3b82f6":C.textMuted, borderRadius:6, padding:"5px 12px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                  🔒 Internal Note
                </button>
                <button onClick={() => setNoteInternal(false)}
                  style={{ background:!noteInternal?"#06b6d420":"transparent", border:`1px solid ${!noteInternal?"#06b6d4":C.border}`, color:!noteInternal?"#06b6d4":C.textMuted, borderRadius:6, padding:"5px 12px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                  💬 Reply to Customer
                </button>
                <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
                  <AIReplyButton ticket={ticket} disabled={submitting} onSuggestion={txt => { setNoteBody(txt); setNoteInternal(false); }} />
                  <button onClick={() => setShowKB(p=>!p)}
                    style={{ background:"#e8f4f0", border:"1px solid #10b98130", borderRadius:6, padding:"5px 10px", cursor:"pointer", color:C.green, fontSize:11, fontWeight:700, fontFamily:"inherit" }}>
                    📚 KB
                  </button>
                </div>
              </div>
              <DraftBanner hasDraft={hasDraft} onRestore={() => restore()} onDiscard={() => clear()} />
              <Textarea value={noteBody} onChange={setNoteBody}
                placeholder={noteInternal?"Internal note — ops-only…":"Reply that will be emailed to the customer…"}
                rows={4} />
              {showKB && (
                <div style={{ marginTop:10, position:"relative", zIndex:50 }}>
                  <KBArticlePicker queue={ticket.queue} onInsert={txt => { setNoteBody(p => p ? p+"\n\n"+txt : txt); setShowKB(false); }} onClose={() => setShowKB(false)} />
                </div>
              )}
              <div style={{ marginTop:10, display:"flex", alignItems:"center", gap:12 }}>
                <Btn variant={noteInternal?"primary":"default"} disabled={!noteBody.trim()||submitting}
                  onClick={() => { onNote(noteBody,noteInternal); setNoteBody(""); clear(); }}>
                  {noteInternal?"Add Internal Note":"Send Reply to Customer"}
                </Btn>
                {!noteInternal && ticket.userEmail && (
                  <span style={{ color:C.textDim, fontSize:11 }}>→ {ticket.userEmail}</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "tags" && (
        <div>
          <p style={{ color:C.textMuted, fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", margin:"0 0 12px" }}>Tags ({(ticket.tags||[]).length}/5)</p>
          <TicketTagEditor ticketId={ticket.id} currentTags={ticket.tags} readOnly={!canWrite} />
          {canWrite && (
            <div style={{ marginTop:24 }}>
              <p style={{ color:C.textMuted, fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", margin:"0 0 10px" }}>Merge Ticket</p>
              <TicketMergeButton ticket={ticket} allTickets={allTickets||[]} staff={staff} onMerged={() => { onClose(); }} />
            </div>
          )}
        </div>
      )}

      {activeTab === "emails" && (
        <div>
          <p style={{ color:C.textMuted, fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", margin:"0 0 12px" }}>Automated emails sent to customer</p>
          <ProactiveEmailLog ticketId={ticket.id} />
        </div>
      )}

      {activeTab === "history" && (
        <div>
          <p style={{ color:C.textMuted, fontSize:12, marginBottom:16 }}>
            Full audit trail in Audit Log — filter by ticket ID{" "}
            <code style={{ background:C.surface2, padding:"1px 6px", borderRadius:4 }}>{ticket.id}</code>
          </p>
          <div style={{ background:C.surface2, borderRadius:8, padding:16, border:`1px solid ${C.border}` }}>
            <p style={{ color:C.textDim, fontSize:12, margin:"0 0 8px", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em" }}>Snapshot</p>
            <pre style={{ color:"#57534e", fontSize:11, margin:0, overflow:"auto" }}>
              {JSON.stringify({
                id:ticket.id, status:ticket.status, priority:ticket.priority,
                queue:ticket.queue, assignedTo:ticket.assignedName,
                createdAt:fmtDateTime(ticket.createdAt),
                notes:(ticket.notes||[]).length,
              }, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── CREATE TICKET MODAL ──────────────────────────────────────────────────────

function CreateTicketModal({ staff, onClose, onCreated, showToast }) {
  const [subject,   setSubject]   = useState("");
  const [category,  setCategory]  = useState("account");
  const [priority,  setPriority]  = useState("medium");
  const [userName,  setUserName]  = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userId,    setUserId]    = useState("");
  const [body,      setBody]      = useState("");
  const [saving,    setSaving]    = useState(false);

  const handleCreate = async () => {
    if (!subject.trim()) { showToast("Subject is required", "error"); return; }
    setSaving(true);
    try {
      const id = await createTicket({
        subject: subject.trim(),
        category, priority,
        userId:    userId.trim()    || null,
        userName:  userName.trim()  || "Unknown",
        userEmail: userEmail.trim() || null,
        body:      body.trim(),
        createdByOps: true,
        staffUid: staff.uid,
      });
      await writeAuditEntry({
        action: "ticket.create", actorUid: staff.uid,
        actorEmail: staff.email, actorRole: staff.role,
        targetId: id, targetType: "ticket",
        after: { subject, priority, category },
        reason: "Ticket created by ops",
      });
      onCreated(id);
    } catch (e) {
      showToast("Failed to create: " + e.message, "error");
    } finally { setSaving(false); }
  };

  return (
    <Modal title="Create Support Ticket" onClose={onClose}>
      <Field label="Subject" required>
        <Input value={subject} onChange={setSubject} placeholder="Brief description of the issue" autoFocus style={{ width:"100%" }} />
      </Field>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <Field label="Category" required>
          <Select value={category} onChange={setCategory} style={{ width:"100%" }} options={
            TICKET_CATEGORIES.map(c => ({ value:c, label:c.charAt(0).toUpperCase()+c.slice(1) }))
          } />
        </Field>
        <Field label="Priority" required>
          <Select value={priority} onChange={setPriority} style={{ width:"100%" }} options={
            TICKET_PRIORITIES.map(p => ({ value:p, label:p.charAt(0).toUpperCase()+p.slice(1) }))
          } />
        </Field>
      </div>
      <Field label="User Name">
        <Input value={userName} onChange={setUserName} placeholder="Display name" style={{ width:"100%" }} />
      </Field>
      <Field label="User Email">
        <Input value={userEmail} onChange={setUserEmail} placeholder="user@example.com" type="email" style={{ width:"100%" }} />
      </Field>
      <Field label="User ID (Firestore UID)">
        <Input value={userId} onChange={setUserId} placeholder="Firebase Auth UID" style={{ width:"100%", fontFamily:"monospace" }} />
      </Field>
      <Field label="Description">
        <Textarea value={body} onChange={setBody} placeholder="Detailed description of the issue…" rows={4} />
      </Field>
      <div style={{ background:"#f59e0b15", border:"1px solid #f59e0b40", borderRadius:6, padding:"10px 14px", marginBottom:20 }}>
        <p style={{ color:"#f59e0b", fontSize:12, margin:0 }}>
          SLA deadline will be set automatically: Critical=2h · High=8h · Medium=24h · Low=72h
        </p>
      </div>
      <div style={{ display:"flex", gap:10 }}>
        <Btn variant="primary" disabled={saving || !subject.trim()} onClick={handleCreate}>
          {saving ? "Creating…" : "Create Ticket"}
        </Btn>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}

// ─── USER DETAIL TABS ─────────────────────────────────────────────────────────

function UserDetailTabs({ selected, canWrite, submitting, onStateModal, onSuspend, staffRef }) {
  const [tab, setTab] = useState("details");
  return (
    <>
      <div style={{ display:"flex", gap:0, borderBottom:`1px solid ${C.border}`, marginBottom:20 }}>
        {["details","history"].map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{ background:"none",border:"none",cursor:"pointer",padding:"8px 16px",fontSize:13,fontWeight:600,
              color:tab===t?C.green:C.textMuted,borderBottom:tab===t?`2px solid ${C.green}`:"2px solid transparent",
              fontFamily:"inherit",marginBottom:-1 }}>
            {t==="history"?"Activity History":"Details"}
          </button>
        ))}
      </div>

      {tab==="details" ? (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24 }}>
          <div>
            <p style={{ color:C.textMuted, fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", margin:"0 0 10px" }}>Identity</p>
            <InfoRow label="Full Name"    value={selected.name} />
            <InfoRow label="Email"        value={selected.email} />
            <InfoRow label="Firestore ID" value={selected._firestoreId} />
            <InfoRow label="Type"         value={selected.isRecruiter?"Recruiter":"Talent"} />
            <InfoRow label="Verified"     value={selected.isVerified?"✓ Yes":"No"} valueColor={selected.isVerified?C.green:undefined} />
            <p style={{ color:C.textMuted, fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", margin:"20px 0 10px" }}>Location</p>
            <InfoRow label="City"    value={selected.city   ||"—"} />
            <InfoRow label="State"   value={selected.state  ||"—"} />
            <InfoRow label="Country" value={selected.country||"—"} />
          </div>
          <div>
            <p style={{ color:C.textMuted, fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", margin:"0 0 10px" }}>Account</p>
            <InfoRow label="Recovery State"  value={<StatePill state={selected.recoveryState||"ACTIVE"} />} />
            <InfoRow label="Account Status"  value={selected.accountStatus||"active"} valueColor={selected.accountStatus==="suspended"?"#ef4444":C.green} />
            <InfoRow label="Credits"         value={selected.credits} />
            <InfoRow label="Reputation"      value={selected.reputation} />
            <InfoRow label="Industry"        value={selected.industry} />
            <InfoRow label="Availability"    value={selected.availability} />
            {canWrite && (
              <div style={{ marginTop:20, display:"flex", flexDirection:"column", gap:8 }}>
                <Btn variant="primary" onClick={onStateModal}>Change Recovery State</Btn>
                <Btn variant="danger" disabled={submitting} onClick={onSuspend}>Suspend Account</Btn>
                <WatchlistButton user={selected} staff={staffRef} onUpdate={()=>{}} />
              </div>
            )}
          </div>
        </div>
      ) : (
        <UserActivityHistory userId={selected._firestoreId} userEmail={selected.email} />
      )}
    </>
  );
}

// ─── MODULE: USER MANAGEMENT (live Firestore) ─────────────────────────────────

function UserManagement({ staff }) {
  const [users,       setUsers]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [selected,    setSelected]    = useState(null);
  const [stateModal,  setStateModal]  = useState(false);
  const [stateReason, setStateReason] = useState("");
  const [toast,       setToast]       = useState(null);
  const [submitting,  setSubmitting]  = useState(false);

  const canWrite = !["auditor"].includes(staff.role);
  const isAdmin  = isTierAdmin(staff.role);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToUsers(data => { setUsers(data); setLoading(false); });
    return unsub;
  }, []);

  const filtered = useMemo(() => {
    if (!search) return users.slice(0, 100);
    const q = search.toLowerCase();
    return users.filter(u =>
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.city?.toLowerCase().includes(q) ||
      u.country?.toLowerCase().includes(q) ||
      u._firestoreId?.includes(q)
    ).slice(0, 100);
  }, [users, search]);

  const handleDownloadUsers = () => {
    const enc = (val) => {
      if (!val) return "";
      const key = "bewatu-ops-pii-2024";
      let out = "";
      for (let i = 0; i < val.length; i++)
        out += String.fromCharCode(val.charCodeAt(i) ^ key.charCodeAt(i % key.length));
      return btoa(out);
    };
    const rows = [
      ["ID","Name_ENC","Email_ENC","City_ENC","State_ENC","Country_ENC","Status","RecoveryState","Verified","Recruiter"],
      ...users.map(u => [
        u._firestoreId||"", enc(u.name), enc(u.email), enc(u.city), enc(u.state), enc(u.country),
        u.accountStatus||"active", u.recoveryState||"ACTIVE",
        u.isVerified?"1":"0", u.isRecruiter?"1":"0",
      ])
    ];
    downloadCSV(rows, `bewatu-users-enc-${Date.now()}.csv`);
  };

  const handleStateChange = async (newState) => {
    if (!stateReason.trim() || !selected) return;
    setSubmitting(true);
    try {
      await updateUserRecoveryState(selected._firestoreId, newState, staff, stateReason);
      setToast({ message:`State changed to ${RECOVERY_STATES[newState].label}`, type:"success" });
      setStateModal(false); setStateReason("");
    } catch (e) { setToast({ message:e.message, type:"error" }); }
    finally { setSubmitting(false); }
  };

  const handleSuspend = async (user) => {
    if (!window.confirm(`Suspend ${user.name}? This will be logged.`)) return;
    setSubmitting(true);
    try {
      await updateUserStatus(user._firestoreId, "suspended", staff, "Manual suspension by ops");
      setToast({ message:`${user.name} suspended`, type:"warning" });
    } catch (e) { setToast({ message:e.message, type:"error" }); }
    finally { setSubmitting(false); }
  };

  return (
    <div style={{ padding:28 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <h2 style={{ color:C.text, fontSize:20, fontWeight:800, margin:"0 0 4px" }}>User Management</h2>
          <p style={{ color:C.textMuted, fontSize:13, margin:0 }}>{users.length} users</p>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <Input value={search} onChange={setSearch} placeholder="Search name, email, city, country…" style={{ width:260 }} />
          {isAdmin && <Btn variant="default" onClick={handleDownloadUsers}>⬇ Export CSV (PII encrypted)</Btn>}
        </div>
      </div>

      <div style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:10, overflow:"hidden" }}>
        <Table loading={loading} emptyMsg="No users found" cols={[
          { key:"name", label:"User", render: u => (
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <p style={{ color:C.text, fontWeight:600, margin:0, fontSize:13 }}>{u.name||"—"}</p>
                {u.watchlistReason && <WatchlistDot />}
              </div>
              <p style={{ color:C.textMuted, fontSize:11, margin:"2px 0 0" }}>{u.email||"—"}</p>
            </div>
          )},
          { key:"location", label:"Location", render: u => (
            <span style={{ color:C.textMuted, fontSize:12 }}>
              {[u.city, u.state, u.country].filter(Boolean).join(", ")||"—"}
            </span>
          )},
          { key:"recoveryState", label:"Recovery", render: u => <StatePill state={u.recoveryState||"ACTIVE"} /> },
          { key:"accountStatus", label:"Status", render: u => (
            <span style={{ color:u.accountStatus==="suspended"?"#ef4444":C.green, fontSize:12, fontWeight:600, textTransform:"capitalize" }}>
              {u.accountStatus||"active"}
            </span>
          )},
          { key:"isVerified", label:"Verified", render: u => u.isVerified
            ? <span style={{ color:C.green, fontSize:12 }}>✓</span>
            : <span style={{ color:C.textDim, fontSize:12 }}>—</span>
          },
          { key:"type", label:"Type", render: u => (
            <span style={{ color:C.textMuted, fontSize:12 }}>{u.isRecruiter?"Recruiter":"Talent"}</span>
          )},
          { key:"actions", label:"", render: u => canWrite && (
            <div style={{ display:"flex", gap:6 }} onClick={e => e.stopPropagation()}>
              <Btn size="sm" onClick={() => { setSelected(u); setStateModal(true); }}>State</Btn>
              <Btn size="sm" variant="danger" disabled={submitting} onClick={() => handleSuspend(u)}>Suspend</Btn>
            </div>
          )},
        ]} rows={filtered} onRow={u => setSelected(u)} />
      </div>

      {selected && !stateModal && (
        <Modal title={selected.name||"User"} subtitle={selected._firestoreId} onClose={()=>setSelected(null)} width={760}>
          <UserDetailTabs selected={selected} canWrite={canWrite} submitting={submitting}
            onStateModal={()=>setStateModal(true)} onSuspend={()=>handleSuspend(selected)} staffRef={staff} />
        </Modal>
      )}

      {selected && stateModal && (
        <Modal title="Recovery State Machine" subtitle={selected.name} onClose={() => { setStateModal(false); setStateReason(""); }} width={560}>
          <div style={{ marginBottom:16 }}>
            <p style={{ color:C.textMuted, fontSize:12, marginBottom:6 }}>Current State</p>
            <StatePill state={selected.recoveryState||"ACTIVE"} />
          </div>
          <div style={{ marginBottom:20 }}>
            <p style={{ color:C.textMuted, fontSize:12, marginBottom:10 }}>Transition To</p>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
              {(RECOVERY_STATES[selected.recoveryState||"ACTIVE"]?.next||[]).map(state => (
                <Btn key={state} variant={state==="SUSPENDED"?"danger":state==="FULLY_RESTORED"?"success":"default"}
                  disabled={submitting||!stateReason.trim()} onClick={() => handleStateChange(state)}>
                  → {RECOVERY_STATES[state].label}
                </Btn>
              ))}
            </div>
          </div>
          <Field label="Reason for change" required>
            <Textarea value={stateReason} onChange={setStateReason} placeholder="Required — recorded in audit log…" rows={3} />
          </Field>
        </Modal>
      )}

      {toast && <Toast {...toast} onDone={() => setToast(null)} />}
    </div>
  );
}


// ─── DOWNLOAD UTILITIES ──────────────────────────────────────────────────────

function downloadCSV(rows, filename) {
  const csv = rows.map(r =>
    r.map(v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"').join(",")
  ).join("\n");
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
    download: filename,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

function encPII(val) {
  if (!val) return "";
  const key = "bw-ops-pii-k3y-2024";
  const s = String(val);
  let out = "";
  for (let i = 0; i < s.length; i++)
    out += String.fromCharCode(s.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  return btoa(out);
}

// ─── MODULE: VERIFICATION QUEUE (live Firestore) ─────────────────────────────

function VerificationQueue({ staff }) {
  const [queue,      setQueue]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [selected,   setSelected]   = useState(null);
  const [filter,     setFilter]     = useState("pending");
  const [note,       setNote]       = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast,      setToast]      = useState(null);

  const canWrite = ["platform_admin","verification_manager","verification_agent"].includes(staff.role);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToVerificationQueue(data => { setQueue(data); setLoading(false); });
    return unsub;
  }, []);

  const filtered = filter === "all" ? queue : queue.filter(v => v.status === filter);

  const statusMap = {
    pending:    { color:"#f59e0b", label:"Pending"    },
    in_review:  { color:"#3b82f6", label:"In Review"  },
    approved:   { color:C.green,   label:"Approved"   },
    rejected:   { color:"#ef4444", label:"Rejected"   },
    needs_info: { color:"#f97316", label:"Needs Info" },
  };

  const handleDecision = async (decision) => {
    if (!note.trim() && decision !== "approved") {
      setToast({ message:"Reason required for non-approvals", type:"error" }); return;
    }
    setSubmitting(true);
    try {
      await decideVerification(selected.id, decision, note, staff);
      setToast({ message:`Decision recorded: ${decision}`, type:"success" });
      setSelected(null);
      setNote("");
    } catch (e) {
      setToast({ message: e.message, type:"error" });
    } finally { setSubmitting(false); }
  };

  return (
    <div style={{ padding:28 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
        <div>
          <h2 style={{ color:C.text, fontSize:20, fontWeight:800, margin:"0 0 4px" }}>Verification Queue</h2>
          <p style={{ color:C.textMuted, fontSize:13, margin:0 }}>
            {queue.filter(v=>v.status==="pending").length} pending · {queue.filter(v=>v.ageHours>=24).length} overdue
          </p>
        </div>
        <Select value={filter} onChange={setFilter} options={[
          { value:"all", label:"All" },
          ...Object.entries(statusMap).map(([k,v]) => ({ value:k, label:v.label }))
        ]} />
      </div>

      <div style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:10, overflow:"hidden" }}>
        <Table loading={loading} cols={[
          { key:"companyName", label:"Company", render: v => (
            <div>
              <p style={{ color:C.text, fontWeight:600, margin:0 }}>{v.companyName || v.companyId}</p>
              <p style={{ color:C.textMuted, fontSize:11, margin:"2px 0 0" }}>{v.recruiterEmail}</p>
            </div>
          )},
          { key:"type", label:"Type", render: v => (
            <span style={{ color:C.textMuted, fontSize:12 }}>
              {(v.verificationType||v.type||"—").replace(/_/g," ")}
            </span>
          )},
          { key:"status", label:"Status", render: v => <StatusPill status={v.status||"pending"} map={statusMap} /> },
          { key:"ageHours", label:"Age", render: v => (
            <span style={{ color:v.ageHours>=24?"#ef4444":v.ageHours>=12?"#f59e0b":C.textMuted, fontWeight:v.ageHours>=24?700:400 }}>
              {v.ageHours}h {v.ageHours>=24?"⚑":""}
            </span>
          )},
          { key:"submittedAt", label:"Submitted", render: v => (
            <span style={{ color:C.textMuted, fontSize:12 }}>{timeAgo(v.submittedAt)}</span>
          )},
        ]} rows={filtered} onRow={setSelected} />
      </div>

      {selected && (
        <Modal title={`Verification: ${selected.companyName || selected.companyId}`}
          onClose={() => { setSelected(null); setNote(""); }}>
          <InfoRow label="Company ID"  value={selected.companyId} />
          <InfoRow label="Recruiter"   value={selected.recruiterName} />
          <InfoRow label="Email"       value={selected.recruiterEmail} />
          <InfoRow label="Type"        value={(selected.verificationType||selected.type||"—").replace(/_/g," ")} />
          <InfoRow label="Status"      value={<StatusPill status={selected.status||"pending"} map={statusMap} />} />
          <InfoRow label="Submitted"   value={timeAgo(selected.submittedAt)} />
          <InfoRow label="Age"         value={`${selected.ageHours}h`} valueColor={selected.ageHours>=24?"#ef4444":undefined} />
          {selected.notes && (
            <div style={{ background:"#f59e0b15", border:"1px solid #f59e0b40", borderRadius:6, padding:12, margin:"16px 0" }}>
              <p style={{ color:"#f59e0b", fontSize:13, margin:0 }}>⚠ {selected.notes}</p>
            </div>
          )}
          {canWrite && (
            <div style={{ marginTop:20 }}>
              <Field label="Decision notes">
                <Textarea value={note} onChange={setNote}
                  placeholder="Optional for approval, required for rejection…" rows={3} />
              </Field>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                <Btn variant="success" disabled={submitting} onClick={() => handleDecision("approved")}>✓ Approve</Btn>
                <Btn variant="danger"  disabled={submitting||!note.trim()} onClick={() => handleDecision("rejected")}>✕ Reject</Btn>
                <Btn variant="warning" disabled={submitting||!note.trim()} onClick={() => handleDecision("needs_info")}>? Needs Info</Btn>
                <Btn variant="default" disabled={submitting} onClick={() => handleDecision("in_review")}>Mark In Review</Btn>
              </div>
            </div>
          )}
        </Modal>
      )}
      {toast && <Toast {...toast} onDone={() => setToast(null)} />}
    </div>
  );
}

// ─── MODULE: AUDIT LOG (live Firestore) ───────────────────────────────────────

function AuditLog() {
  const [log,        setLog]        = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selected,   setSelected]   = useState(null);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToAuditLog(data => { setLog(data); setLoading(false); });
    return unsub;
  }, []);

  const actionTypes = useMemo(() => ["all", ...new Set(log.map(e => e.action?.split(".")[0]).filter(Boolean))], [log]);

  const filtered = useMemo(() => {
    let result = log;
    if (typeFilter !== "all") result = result.filter(e => e.action?.startsWith(typeFilter));
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(e =>
        e.action?.includes(q) || e.actorEmail?.includes(q) ||
        e.targetId?.includes(q) || e.reason?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [log, search, typeFilter]);

  const handleDownload = () => {
    downloadCSV([
      ["Timestamp","Action","ActorEmail","ActorRole","TargetId","TargetType","Reason","IP","Before","After"],
      ...filtered.map(e => [
        fmtDateTime(e.ts), e.action||"", e.actorEmail||"", e.actorRole||"",
        e.targetId||"", e.targetType||"", e.reason||"", e.ip||"",
        JSON.stringify(e.before||{}), JSON.stringify(e.after||{}),
      ])
    ], `bewatu-audit-${Date.now()}.csv`);
  };

  return (
    <div style={{ padding:28 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <h2 style={{ color:C.text, fontSize:20, fontWeight:800, margin:"0 0 4px" }}>Audit Log</h2>
          <p style={{ color:C.textMuted, fontSize:13, margin:0 }}>Immutable · {log.length} entries · {filtered.length} shown</p>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <Input value={search} onChange={setSearch} placeholder="Search actions, actors, targets…" style={{ width:240 }} />
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:6, color:C.text, padding:"7px 12px", fontSize:12, outline:"none", fontFamily:"inherit", cursor:"pointer" }}>
            {actionTypes.map(t => <option key={t} value={t}>{t==="all"?"All types":t}</option>)}
          </select>
          <Btn variant="default" onClick={handleDownload}>⬇ Export CSV</Btn>
        </div>
      </div>

      <div style={{ background:"#e8f4f0", border:"1px solid #10b98140", borderRadius:8, padding:"10px 16px", marginBottom:16 }}>
        <p style={{ color:C.green, fontSize:12, margin:0 }}>🔒 Immutable — entries cannot be edited or deleted. All operator actions are automatically recorded.</p>
      </div>

      <div style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:10, overflow:"hidden" }}>
        <Table loading={loading} cols={[
          { key:"ts", label:"Timestamp", render: e => (
            <span style={{ color:C.textMuted, fontSize:11, fontFamily:"monospace", whiteSpace:"nowrap" }}>{fmtDateTime(e.ts)}</span>
          )},
          { key:"action", label:"Action", render: e => (
            <span style={{ color:C.text, fontFamily:"monospace", fontSize:12 }}>{e.action}</span>
          )},
          { key:"actorEmail", label:"Actor", render: e => (
            <div>
              <p style={{ color:"#57534e", fontSize:12, margin:0 }}>{e.actorEmail}</p>
              <p style={{ color:ROLES[e.actorRole]?.color||C.textMuted, fontSize:10, margin:"2px 0 0" }}>{ROLES[e.actorRole]?.label}</p>
            </div>
          )},
          { key:"targetId", label:"Target", render: e => (
            <span style={{ color:C.textMuted, fontFamily:"monospace", fontSize:11 }}>{e.targetId} ({e.targetType})</span>
          )},
          { key:"reason", label:"Reason", render: e => <span style={{ color:C.textMuted, fontSize:12 }}>{e.reason}</span> },
        ]} rows={filtered.slice(0,200)} onRow={setSelected} />
      </div>

      {selected && (
        <Modal title="Audit Entry" subtitle={selected.action} onClose={() => setSelected(null)}>
          <InfoRow label="Action"    value={selected.action} />
          <InfoRow label="Actor"     value={selected.actorEmail} />
          <InfoRow label="Role"      value={ROLES[selected.actorRole]?.label} />
          <InfoRow label="Target"    value={`${selected.targetId} (${selected.targetType})`} />
          <InfoRow label="Reason"    value={selected.reason} />
          <InfoRow label="Timestamp" value={fmtDateTime(selected.ts)} />
          <InfoRow label="IP"        value={selected.ip} />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginTop:20 }}>
            <div>
              <p style={{ color:"#57534e", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 }}>Before</p>
              <div style={{ background:C.surface2, border:"1px solid #ef444330", borderRadius:6, padding:12 }}>
                <pre style={{ color:"#ef4444", fontSize:11, margin:0 }}>{JSON.stringify(selected.before||{}, null, 2)}</pre>
              </div>
            </div>
            <div>
              <p style={{ color:"#57534e", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 }}>After</p>
              <div style={{ background:C.surface2, border:`1px solid ${C.green}30`, borderRadius:6, padding:12 }}>
                <pre style={{ color:C.green, fontSize:11, margin:0 }}>{JSON.stringify(selected.after||{}, null, 2)}</pre>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}


// ─── DASHBOARD ────────────────────────────────────────────────────────────────

function Dashboard({ tickets, verificationQueue, users, fraudCases, contentReports, onNavigate, staff }) {
  const isAdmin   = isTierAdmin(staff.role);
  const isManager = isTierManager(staff.role);

  const open        = tickets.filter(t=>t.status==="open").length;
  const breached    = tickets.filter(t=>t.slaBreached).length;
  const critical    = tickets.filter(t=>t.priority==="critical"&&!["resolved","closed"].includes(t.status)).length;
  const pending     = verificationQueue.filter(v=>v.status==="pending").length;
  const overdue     = verificationQueue.filter(v=>v.ageHours>=24&&v.status==="pending").length;
  const locked      = users.filter(u=>u.recoveryState==="RECOVERY_LOCKED").length;
  const openFraud   = fraudCases.filter(c=>c.status==="open"||c.status==="investigating").length;
  const criticalFraud = fraudCases.filter(c=>c.severity==="critical"&&!["resolved_fraud","resolved_clean"].includes(c.status)).length;
  const pendingMod  = contentReports.filter(r=>r.status==="pending").length;
  const criticalMod = contentReports.filter(r=>r.severity==="critical"&&r.status==="pending").length;

  // ── Report downloads (admin only) ──────────────────────────────────────────
  const handleDownloadAudit = () => {
    downloadCSV([
      ["Timestamp","Action","ActorEmail","ActorRole","TargetId","TargetType","Reason","IP"],
      // audit data fetched live — placeholder; AuditLog module has full data
    ], `bewatu-audit-${Date.now()}.csv`);
  };

  const handleDownloadTickets = () => {
    downloadCSV([
      ["TicketID","Queue","Status","Priority","AssignedTo","UserID","UserEmail_ENC","Subject","CreatedAt","ResolvedAt","SLABreached"],
      ...tickets.map(t => [
        t.id, t.queue||"", t.status, t.priority,
        t.assignedName||"", t.userId||"",
        encPII(t.userEmail),
        t.subject||"", fmtDateTime(t.createdAt),
        t.resolvedAt?fmtDateTime(t.resolvedAt):"",
        t.slaBreached?"1":"0",
      ])
    ], `bewatu-tickets-${Date.now()}.csv`);
  };

  const handleDownloadUsers = () => {
    downloadCSV([
      ["ID","Name_ENC","Email_ENC","City_ENC","State_ENC","Country_ENC","Status","RecoveryState","Verified","Recruiter"],
      ...users.map(u => [
        u._firestoreId||"", encPII(u.name), encPII(u.email),
        encPII(u.city), encPII(u.state), encPII(u.country),
        u.accountStatus||"active", u.recoveryState||"ACTIVE",
        u.isVerified?"1":"0", u.isRecruiter?"1":"0",
      ])
    ], `bewatu-users-enc-${Date.now()}.csv`);
  };

  return (
    <div style={{ padding:28 }}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24, flexWrap:"wrap", gap:12 }}>
        <div>
          <h2 style={{ color:C.text, fontSize:22, fontWeight:800, margin:"0 0 4px" }}>Operations Dashboard</h2>
          <p style={{ color:C.textMuted, fontSize:13, margin:0 }}>
            {new Date().toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"})} · Live data
          </p>
        </div>

        {/* Report Downloads — admin only */}
        {isAdmin && (
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <Btn variant="default" size="sm" onClick={handleDownloadTickets}>⬇ Tickets Report</Btn>
            <Btn variant="default" size="sm" onClick={handleDownloadUsers}>⬇ Users Report (PII encrypted)</Btn>
            <Btn variant="default" size="sm" onClick={() => onNavigate("audit")}>⬇ Audit Log →</Btn>
          </div>
        )}
      </div>

      {/* Bulletins */}
      <BulletinBanner queue={ROLES[staff.role]?.queue} staff={staff} />

      {/* Onboarding checklist — shown to new agents */}
      {isTierAgent(staff.role) && (
        <OnboardingChecklist staff={staff} onComplete={() => {}} />
      )}

      {/* SLA breach alert */}
      {breached > 0 && (
        <div style={{ background:"#ef444415", border:"1px solid #ef444440", borderRadius:8, padding:"12px 16px", marginBottom:20, display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:18 }}>🚨</span>
          <p style={{ color:"#ef4444", fontWeight:700, margin:0, flex:1 }}>
            {breached} ticket{breached>1?"s":""} {breached>1?"have":"has"} breached SLA
          </p>
          <Btn variant="danger" size="sm" onClick={() => onNavigate("tickets")}>View →</Btn>
        </div>
      )}

      {/* Metrics grid */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))", gap:14, marginBottom:28 }}>
        <Metric label="Open Tickets"    value={open}        color="#3b82f6" sub={`${critical} critical`}         alert={open>20||breached>0} />
        <Metric label="SLA Breaches"    value={breached}    color="#ef4444" alert={breached>0}                   sub="need immediate action" />
        <Metric label="Fraud Cases"     value={openFraud}   color="#ef4444" alert={criticalFraud>0}              sub={criticalFraud>0?`${criticalFraud} critical`:undefined} />
        <Metric label="Content Reports" value={pendingMod}  color="#f97316" alert={criticalMod>0}                sub={criticalMod>0?`${criticalMod} critical`:undefined} />
        <Metric label="Verification Q"  value={pending}     color="#8b5cf6" sub={overdue>0?`${overdue} overdue`:undefined} alert={overdue>0} />
        <Metric label="Recovery Locked" value={locked}      color="#f59e0b" sub="users in recovery" />
        <Metric label="Total Users"     value={users.length} color={C.green} />
      </div>

      {/* Two-column panels */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:20 }}>
        {/* Recent tickets */}
        <div style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:10, padding:20 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <h3 style={{ color:"#57534e", fontSize:12, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", margin:0 }}>Recent Tickets</h3>
            <Btn size="sm" variant="ghost" onClick={() => onNavigate("tickets")}>View all →</Btn>
          </div>
          {tickets.slice(0,6).map(t => (
            <div key={t.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", padding:"8px 0", borderBottom:`1px solid ${C.border2}` }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  {t.slaBreached && <span style={{ color:"#ef4444", fontSize:10, fontWeight:700 }}>⚑</span>}
                  <p style={{ color:"#cbd5e1", fontSize:12, fontWeight:600, margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.subject}</p>
                </div>
                <p style={{ color:C.textDim, fontSize:11, margin:"2px 0 0" }}>{t.userName} · {t.queue||""} · {timeAgo(t.createdAt)}</p>
              </div>
              <PriorityChip priority={t.priority} />
            </div>
          ))}
          {tickets.length===0 && <p style={{ color:C.textDim, fontSize:13 }}>No tickets yet.</p>}
        </div>

        {/* Verification queue */}
        <div style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:10, padding:20 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <h3 style={{ color:"#57534e", fontSize:12, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", margin:0 }}>Verification Queue</h3>
            <Btn size="sm" variant="ghost" onClick={() => onNavigate("verification")}>View all →</Btn>
          </div>
          {verificationQueue.filter(v=>v.status==="pending").slice(0,6).map(v => (
            <div key={v.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:`1px solid ${C.border2}` }}>
              <div>
                <p style={{ color:"#cbd5e1", fontSize:12, fontWeight:600, margin:0 }}>{v.companyName||v.companyId}</p>
                <p style={{ color:C.textDim, fontSize:11, margin:"2px 0 0" }}>{v.recruiterEmail}</p>
              </div>
              <span style={{ color:v.ageHours>=24?"#ef4444":"#f59e0b", fontSize:12, fontWeight:v.ageHours>=24?700:400 }}>{v.ageHours}h</span>
            </div>
          ))}
          {verificationQueue.filter(v=>v.status==="pending").length===0 && (
            <p style={{ color:C.textDim, fontSize:13 }}>Queue is clear ✓</p>
          )}
        </div>
      </div>

      {/* Agent Performance panel — admin/manager */}
      {(isAdmin || isManager) && (
        <AgentPerformancePanel tickets={tickets} onNavigate={onNavigate} staff={staff} />
      )}
    </div>
  );
}

// ─── AGENT PERFORMANCE PANEL ──────────────────────────────────────────────────

function AgentPerformancePanel({ tickets, onNavigate, staff }) {
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    subscribeToOpsStaff(data => setAgents(data.filter(m => m.isActive !== false && isTierAgent(m.role))));
  }, []);

  const isAdmin   = isTierAdmin(staff.role);
  const staffQueue = ROLES[staff.role]?.queue;

  // Build per-agent stats from tickets
  const agentStats = useMemo(() => {
    const visible = isAdmin ? agents : agents.filter(a => ROLES[a.role]?.queue === staffQueue);
    return visible.map(agent => {
      const mine = tickets.filter(t => t.assignedTo === agent.uid);
      const resolved = mine.filter(t => ["resolved","closed"].includes(t.status));
      const open     = mine.filter(t => !["resolved","closed"].includes(t.status));
      const breached  = mine.filter(t => t.slaBreached);
      const avgResMs  = resolved.length
        ? resolved.reduce((sum, t) => {
            const ms = (t.resolvedAt?.getTime?.() || 0) - (t.createdAt?.getTime?.() || 0);
            return sum + (ms > 0 ? ms : 0);
          }, 0) / resolved.length
        : null;
      const avgResHrs = avgResMs ? (avgResMs / 3600000) : null;
      const slaRate = mine.length ? Math.round(((mine.length - breached.length) / mine.length) * 100) : null;
      return { agent, total:mine.length, resolved:resolved.length, open:open.length, breached:breached.length, avgResHrs, slaRate };
    }).sort((a,b) => b.resolved - a.resolved);
  }, [agents, tickets, isAdmin, staffQueue]);

  const handleDownloadPerf = () => {
    downloadCSV([
      ["AgentName","AgentEmail","Role","Queue","TotalTickets","Resolved","Open","SLABreaches","SLARate%","AvgResolutionHrs"],
      ...agentStats.map(s => [
        s.agent.name, s.agent.email, ROLES[s.agent.role]?.label||s.agent.role,
        ROLES[s.agent.role]?.queue||"",
        s.total, s.resolved, s.open, s.breached,
        s.slaRate!=null?s.slaRate+"":"-",
        s.avgResHrs!=null?s.avgResHrs.toFixed(1):"-",
      ])
    ], `bewatu-agent-perf-${Date.now()}.csv`);
  };

  if (agentStats.length === 0) return null;

  return (
    <div style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:10, padding:20 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
        <div>
          <h3 style={{ color:"#57534e", fontSize:12, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", margin:"0 0 3px" }}>Agent Performance</h3>
          <p style={{ color:C.textDim, fontSize:11, margin:0 }}>Based on ticket history · {agentStats.length} agents</p>
        </div>
        <Btn size="sm" variant="default" onClick={handleDownloadPerf}>⬇ Export</Btn>
      </div>

      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead>
            <tr>
              {["Agent","Role / Queue","Total","Resolved","Open","SLA Breaches","SLA Rate","Avg Resolution"].map(h => (
                <th key={h} style={{ color:C.textDim, fontWeight:700, textTransform:"uppercase", fontSize:10, letterSpacing:"0.06em", padding:"6px 10px", textAlign:"left", borderBottom:`1px solid ${C.border}`, whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agentStats.map(({ agent, total, resolved, open, breached, avgResHrs, slaRate }) => {
              const role = ROLES[agent.role];
              const slaColor = slaRate == null ? C.textDim : slaRate >= 90 ? "#1a4a3a" : slaRate >= 70 ? "#f59e0b" : "#ef4444";
              return (
                <tr key={agent.uid} style={{ borderBottom:`1px solid ${C.border2}` }}>
                  <td style={{ padding:"10px 10px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                      <div style={{ width:28, height:28, borderRadius:6, background:`${role?.color||"#64748b"}20`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:role?.color||"#64748b", flexShrink:0 }}>
                        {agent.name?.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()}
                      </div>
                      <div>
                        <p style={{ color:C.text, fontWeight:600, margin:0, fontSize:12 }}>{agent.name}</p>
                        <p style={{ color:C.textDim, fontSize:10, margin:0 }}>{agent.email}</p>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding:"10px 10px" }}>
                    <span style={{ color:role?.color||C.textMuted, fontWeight:700, fontSize:11 }}>{role?.label||agent.role}</span>
                    {role?.queue && <p style={{ color:C.textDim, fontSize:10, margin:"1px 0 0" }}>{role.queue}</p>}
                  </td>
                  <td style={{ padding:"10px 10px", color:C.textMuted }}>{total||"—"}</td>
                  <td style={{ padding:"10px 10px" }}>
                    <span style={{ color:"#1a4a3a", fontWeight:600 }}>{resolved||"—"}</span>
                  </td>
                  <td style={{ padding:"10px 10px" }}>
                    <span style={{ color:open>0?"#f59e0b":C.textDim }}>{open||"—"}</span>
                  </td>
                  <td style={{ padding:"10px 10px" }}>
                    <span style={{ color:breached>0?"#ef4444":C.textDim, fontWeight:breached>0?700:400 }}>{breached||"—"}</span>
                  </td>
                  <td style={{ padding:"10px 10px" }}>
                    {slaRate != null ? (
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <div style={{ width:48, height:5, borderRadius:3, background:C.surface, overflow:"hidden" }}>
                          <div style={{ width:`${slaRate}%`, height:"100%", background:slaColor, borderRadius:3 }} />
                        </div>
                        <span style={{ color:slaColor, fontWeight:700, fontSize:11 }}>{slaRate}%</span>
                      </div>
                    ) : <span style={{ color:C.textDim }}>—</span>}
                  </td>
                  <td style={{ padding:"10px 10px", color:C.textMuted }}>
                    {avgResHrs != null ? (
                      <span style={{ color: avgResHrs < 8 ? "#1a4a3a" : avgResHrs < 24 ? "#f59e0b" : "#ef4444" }}>
                        {avgResHrs < 1 ? `${Math.round(avgResHrs*60)}m` : `${avgResHrs.toFixed(1)}h`}
                      </span>
                    ) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── MODULE: FRAUD INVESTIGATION (live Firestore) ────────────────────────────

const FRAUD_TYPES = [
  "account_takeover","fake_recruiter","mass_spam","identity_fraud",
  "payment_fraud","fake_company","credential_stuffing","bot_network",
];
const FRAUD_SIGNAL_TYPES = Object.keys(FRAUD_SIGNAL_WEIGHTS);

const FRAUD_STATUS_MAP = {
  open:                { color:"#ef4444", label:"Open"               },
  investigating:       { color:"#f97316", label:"Investigating"      },
  pending_attestation: { color:"#f59e0b", label:"Pending Attestation"},
  resolved_fraud:      { color:"#6b7280", label:"Resolved: Fraud"    },
  resolved_clean:      { color:C.green,   label:"Resolved: Clean"    },
  escalated:           { color:"#8b5cf6", label:"Escalated"          },
};

function FraudInvestigation({ staff }) {
  const [cases,        setCases]       = useState([]);
  const [loading,      setLoading]     = useState(true);
  const [selected,     setSelected]    = useState(null);
  const [showCreate,   setShowCreate]  = useState(false);
  const [filterStatus, setFilter]      = useState("all");
  const [filterSev,    setFilterSev]   = useState("all");
  const [toast,        setToast]       = useState(null);
  const [submitting,   setSubmitting]  = useState(false);

  const canWrite = ["platform_admin","fraud_ops"].includes(staff.role);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToFraudCases(data => {
      setCases(data);
      setLoading(false);
      setSelected(prev => prev ? data.find(c => c.id === prev.id) || prev : null);
    });
    return unsub;
  }, []);

  const showToast = (msg, type="success") => setToast({ message:msg, type });

  const filtered = useMemo(() => cases.filter(c => {
    if (filterStatus !== "all" && c.status !== filterStatus) return false;
    if (filterSev    !== "all" && c.severity !== filterSev)  return false;
    return true;
  }), [cases, filterStatus, filterSev]);

  const stats = useMemo(() => ({
    open:         cases.filter(c => c.status === "open").length,
    investigating:cases.filter(c => c.status === "investigating").length,
    attestation:  cases.filter(c => c.status === "pending_attestation").length,
    critical:     cases.filter(c => c.severity === "critical").length,
    avgRisk:      cases.length ? Math.round(cases.reduce((s,c)=>s+(c.riskScore||0),0)/cases.length) : 0,
  }), [cases]);

  const handleStatusChange = async (fraudCase, newStatus, reason) => {
    if (!reason?.trim()) return;
    setSubmitting(true);
    try {
      await updateFraudCase(fraudCase.id,
        { status: newStatus, ...(["resolved_fraud","resolved_clean"].includes(newStatus) ? { resolvedAt: serverTimestamp(), resolution: reason } : {}) },
        staff, reason
      );
      showToast(`Case ${newStatus.replace(/_/g," ")}`);
      if (["resolved_fraud","resolved_clean"].includes(newStatus)) setSelected(null);
    } catch(e) { showToast(e.message,"error"); }
    finally { setSubmitting(false); }
  };

  const handleAssign = async (fraudCase) => {
    setSubmitting(true);
    try {
      await updateFraudCase(fraudCase.id, { assignedTo: staff.uid, assignedName: staff.name, status: fraudCase.status === "open" ? "investigating" : fraudCase.status }, staff, "Assigned to investigator");
      showToast("Case assigned");
    } catch(e) { showToast(e.message,"error"); }
    finally { setSubmitting(false); }
  };

  return (
    <div style={{ padding:28 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <h2 style={{ color:C.text, fontSize:20, fontWeight:800, margin:"0 0 4px" }}>Fraud Investigation</h2>
          <p style={{ color:C.textMuted, fontSize:13, margin:0 }}>Real-time · {cases.length} total cases</p>
        </div>
        {canWrite && <Btn variant="danger" onClick={() => setShowCreate(true)}>+ Open Case</Btn>}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, marginBottom:20 }}>
        <Metric label="Open"              value={stats.open}          color="#ef4444" alert={stats.open>5} />
        <Metric label="Investigating"     value={stats.investigating}  color="#f97316" />
        <Metric label="Pending Attest."   value={stats.attestation}   color="#f59e0b" />
        <Metric label="Critical"          value={stats.critical}      color="#ef4444" alert={stats.critical>0} />
        <Metric label="Avg Risk Score"    value={stats.avgRisk}       color={stats.avgRisk>60?"#ef4444":stats.avgRisk>40?"#f59e0b":C.green} />
      </div>

      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
        <Select value={filterStatus} onChange={setFilter} options={[
          { value:"all", label:"All Statuses" },
          ...Object.entries(FRAUD_STATUS_MAP).map(([k,v])=>({ value:k, label:v.label }))
        ]} />
        <Select value={filterSev} onChange={setFilterSev} options={[
          { value:"all", label:"All Severity" },
          { value:"critical", label:"Critical" },
          { value:"high",     label:"High"     },
          { value:"medium",   label:"Medium"   },
        ]} />
        <span style={{ color:C.textDim, fontSize:12, alignSelf:"center", marginLeft:"auto" }}>{filtered.length} cases</span>
      </div>

      <div style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:10, overflow:"hidden" }}>
        <Table loading={loading} emptyMsg="No fraud cases yet" cols={[
          { key:"id", label:"Case ID", render: c => <span style={{ color:C.textMuted, fontFamily:"monospace", fontSize:11 }}>{c.id?.slice(0,8)}…</span> },
          { key:"type", label:"Type", render: c => <span style={{ color:C.text, fontWeight:600, fontSize:12 }}>{c.type?.replace(/_/g," ")}</span> },
          { key:"userName", label:"Subject", render: c => (
            <div>
              <p style={{ color:C.text, margin:0, fontSize:13 }}>{c.userName}</p>
              {c.userEmail && <p style={{ color:C.textMuted, fontSize:11, margin:"2px 0 0" }}>{c.userEmail}</p>}
            </div>
          )},
          { key:"severity", label:"Severity", render: c => <RiskBadge score={c.severity==="critical"?92:c.severity==="high"?68:38} /> },
          { key:"riskScore", label:"Risk", render: c => <RiskBadge score={c.riskScore||0} /> },
          { key:"signals", label:"Signals", render: c => (
            <span style={{ color:"#f59e0b", fontWeight:700 }}>{(c.signals||[]).length}</span>
          )},
          { key:"attestations", label:"Attestation", render: c => {
            const needed = c.attestationsNeeded || 2;
            const recv   = c.attestationsReceived || 0;
            return (
              <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                {Array.from({length:needed}).map((_,i)=>(
                  <div key={i} style={{ width:10, height:10, borderRadius:2, background: i<recv?C.green:C.border }} />
                ))}
                <span style={{ color:C.textMuted, fontSize:11, marginLeft:4 }}>{recv}/{needed}</span>
              </div>
            );
          }},
          { key:"status", label:"Status", render: c => <StatusPill status={c.status||"open"} map={FRAUD_STATUS_MAP} /> },
          { key:"assignedName", label:"Assigned", render: c => <span style={{ color:c.assignedName?C.textMuted:"#ef4444", fontSize:12 }}>{c.assignedName||"Unassigned"}</span> },
          { key:"createdAt", label:"Opened", render: c => <span style={{ color:C.textMuted, fontSize:12 }}>{timeAgo(c.createdAt)}</span> },
          { key:"actions", label:"", render: c => canWrite && !c.assignedTo && (
            <Btn size="sm" disabled={submitting} onClick={e=>{e.stopPropagation();handleAssign(c);}}>Claim</Btn>
          )},
        ]} rows={filtered} onRow={setSelected} />
      </div>

      {selected && (
        <FraudCaseModal
          fraudCase={selected} staff={staff} canWrite={canWrite} submitting={submitting}
          onClose={()=>setSelected(null)}
          onStatusChange={handleStatusChange}
          onAssign={()=>handleAssign(selected)}
          onAddSignal={async (sig)=>{
            try { await addFraudSignal(selected.id, sig, staff); showToast("Signal added"); }
            catch(e){ showToast(e.message,"error"); }
          }}
          showToast={showToast}
        />
      )}

      {showCreate && (
        <CreateFraudCaseModal staff={staff} onClose={()=>setShowCreate(false)}
          onCreated={id=>{ setShowCreate(false); showToast(`Case opened: ${id.slice(0,8)}`); }}
          showToast={showToast}
        />
      )}

      {toast && <Toast {...toast} onDone={()=>setToast(null)} />}
    </div>
  );
}

function FraudCaseModal({ fraudCase, staff, canWrite, submitting, onClose, onStatusChange, onAssign, onAddSignal, showToast }) {
  const [activeTab,   setActiveTab]   = useState("overview");
  const [resolveMode, setResolveMode] = useState(false);
  const [resolution,  setResolution]  = useState("");
  const [newSignal,   setNewSignal]   = useState({ type:"new_device", description:"" });
  const [showSignal,  setShowSignal]  = useState(false);
  const isActive = !["resolved_fraud","resolved_clean"].includes(fraudCase.status);

  return (
    <Modal title={`Fraud Case: ${fraudCase.type?.replace(/_/g," ")}`} subtitle={`${fraudCase.id?.slice(0,8)} · ${fraudCase.userName}`} onClose={onClose} width={820}>
      {/* Status bar */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:20 }}>
        <StatusPill status={fraudCase.status||"open"} map={FRAUD_STATUS_MAP} />
        <RiskBadge score={fraudCase.riskScore||0} />
        <span style={{ background:`${fraudCase.severity==="critical"?"#ef4444":fraudCase.severity==="high"?"#f97316":"#f59e0b"}20`, color:fraudCase.severity==="critical"?"#ef4444":fraudCase.severity==="high"?"#f97316":"#f59e0b", border:`1px solid ${fraudCase.severity==="critical"?"#ef4444":fraudCase.severity==="high"?"#f97316":"#f59e0b"}40`, borderRadius:4, padding:"2px 8px", fontSize:11, fontWeight:700, textTransform:"uppercase" }}>
          {fraudCase.severity}
        </span>
      </div>

      <div style={{ display:"flex", gap:0, borderBottom:`1px solid ${C.border}`, marginBottom:20 }}>
        {["overview","signals","attestation","notes"].map(t=>(
          <button key={t} onClick={()=>setActiveTab(t)} style={{ background:"none", border:"none", cursor:"pointer", padding:"8px 16px", fontSize:13, fontWeight:600, color:activeTab===t?C.green:C.textMuted, borderBottom:activeTab===t?`2px solid ${C.green}`:"2px solid transparent", fontFamily:"inherit", textTransform:"capitalize", marginBottom:-1 }}>{t}</button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24 }}>
          <div>
            <p style={{ color:C.textMuted, fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", margin:"0 0 10px" }}>Subject</p>
            <InfoRow label="Name"    value={fraudCase.userName} />
            <InfoRow label="Email"   value={fraudCase.userEmail} />
            <InfoRow label="User ID" value={fraudCase.userId} />
            <p style={{ color:C.textMuted, fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", margin:"20px 0 10px" }}>Case</p>
            <InfoRow label="Type"       value={fraudCase.type?.replace(/_/g," ")} />
            <InfoRow label="Opened"     value={fmtDateTime(fraudCase.createdAt)} />
            <InfoRow label="Assigned"   value={fraudCase.assignedName||"Unassigned"} valueColor={!fraudCase.assignedName?"#ef4444":undefined} />
            <InfoRow label="Risk Score" value={fraudCase.riskScore} />
            {fraudCase.resolution && <InfoRow label="Resolution" value={fraudCase.resolution} />}
          </div>
          <div>
            {canWrite && isActive && (
              <div>
                <p style={{ color:C.textMuted, fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", margin:"0 0 10px" }}>Actions</p>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {fraudCase.assignedTo !== staff.uid && (
                    <Btn variant="primary" disabled={submitting} onClick={onAssign}>
                      {fraudCase.assignedTo ? "Reassign to Me" : "Claim Investigation"}
                    </Btn>
                  )}
                  {fraudCase.status === "open" && (
                    <Btn variant="warning" disabled={submitting} onClick={()=>onStatusChange(fraudCase,"investigating","Beginning active investigation")}>
                      Begin Investigation
                    </Btn>
                  )}
                  {fraudCase.status === "investigating" && (
                    <Btn variant="warning" disabled={submitting} onClick={()=>onStatusChange(fraudCase,"pending_attestation","Requesting social attestation from trusted connections")}>
                      Request Attestation
                    </Btn>
                  )}
                  {!resolveMode && (
                    <>
                      <Btn variant="danger" disabled={submitting} onClick={()=>{setResolveMode("fraud");}}>Confirm Fraud → Suspend</Btn>
                      <Btn variant="success" disabled={submitting} onClick={()=>{setResolveMode("clean");}}>Resolve as Clean</Btn>
                      <Btn variant="purple" disabled={submitting} onClick={()=>onStatusChange(fraudCase,"escalated","Escalated for senior review")}>Escalate</Btn>
                    </>
                  )}
                  {resolveMode && (
                    <div style={{ background:C.surface2, border:`1px solid ${resolveMode==="fraud"?"#ef444440":`${C.green}40`}`, borderRadius:8, padding:12 }}>
                      <p style={{ color:resolveMode==="fraud"?"#ef4444":C.green, fontWeight:700, fontSize:13, margin:"0 0 8px" }}>
                        {resolveMode==="fraud"?"⚠ Confirm Fraud — user will be suspended":"✓ Resolve as Clean"}
                      </p>
                      <Textarea value={resolution} onChange={setResolution} placeholder="Document your finding and evidence…" rows={3} />
                      <div style={{ display:"flex", gap:8, marginTop:8 }}>
                        <Btn variant={resolveMode==="fraud"?"danger":"success"} disabled={submitting||!resolution.trim()}
                          onClick={()=>onStatusChange(fraudCase, resolveMode==="fraud"?"resolved_fraud":"resolved_clean", resolution)}>
                          Confirm
                        </Btn>
                        <Btn variant="ghost" onClick={()=>{setResolveMode(false);setResolution("");}}>Cancel</Btn>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "signals" && (
        <div>
          {(fraudCase.signals||[]).length === 0
            ? <p style={{ color:C.textDim }}>No signals recorded yet.</p>
            : (fraudCase.signals||[]).map((sig,i)=>(
              <div key={i} style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:8, padding:14, marginBottom:10, display:"flex", gap:14, alignItems:"flex-start" }}>
                <div style={{ width:36, height:36, borderRadius:8, background:"#ef444420", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>
                  {{impossible_travel:"✈️",credential_stuffing:"🔑",velocity_spike:"⚡",vpn_proxy:"🔒",new_device:"📱",mass_messaging:"📨",fake_profile_signals:"👤",payment_anomaly:"💳",manual_flag:"⚑"}[sig.type]||"⚠️"}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                    <span style={{ color:C.text, fontWeight:700, fontSize:13 }}>{sig.type?.replace(/_/g," ")}</span>
                    <span style={{ color:"#ef4444", fontWeight:700, fontSize:12 }}>+{FRAUD_SIGNAL_WEIGHTS[sig.type]||10} risk</span>
                  </div>
                  {sig.description && <p style={{ color:"#57534e", fontSize:12, margin:"0 0 4px" }}>{sig.description}</p>}
                  <p style={{ color:C.textDim, fontSize:11, margin:0 }}>{timeAgo(sig.ts)} {sig.addedBy ? "· manual flag" : "· auto-detected"}</p>
                </div>
              </div>
            ))
          }
          {canWrite && isActive && (
            <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:16, marginTop:8 }}>
              {!showSignal
                ? <Btn variant="warning" onClick={()=>setShowSignal(true)}>+ Add Manual Signal</Btn>
                : (
                  <div style={{ background:C.surface2, border:"1px solid #f59e0b40", borderRadius:8, padding:14 }}>
                    <Field label="Signal Type">
                      <Select value={newSignal.type} onChange={v=>setNewSignal(p=>({...p,type:v}))} style={{ width:"100%" }} options={
                        FRAUD_SIGNAL_TYPES.map(t=>({ value:t, label:t.replace(/_/g," ") }))
                      } />
                    </Field>
                    <Field label="Description">
                      <Input value={newSignal.description} onChange={v=>setNewSignal(p=>({...p,description:v}))} placeholder="Describe what you observed…" style={{ width:"100%" }} />
                    </Field>
                    <div style={{ display:"flex", gap:8 }}>
                      <Btn variant="warning" disabled={!newSignal.description.trim()} onClick={async()=>{ await onAddSignal(newSignal); setNewSignal({type:"new_device",description:""}); setShowSignal(false); }}>Add Signal</Btn>
                      <Btn variant="ghost" onClick={()=>setShowSignal(false)}>Cancel</Btn>
                    </div>
                  </div>
                )
              }
            </div>
          )}
        </div>
      )}

      {activeTab === "attestation" && (
        <div>
          <div style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:10, padding:20, marginBottom:20 }}>
            <p style={{ color:"#57534e", fontWeight:700, margin:"0 0 12px" }}>Social Attestation Progress</p>
            <p style={{ color:C.textMuted, fontSize:13, margin:"0 0 16px" }}>
              Requires <strong style={{ color:C.text }}>{fraudCase.attestationsNeeded||2}</strong> trusted connections to vouch for this account's legitimacy.
            </p>
            <div style={{ display:"flex", gap:10, marginBottom:16 }}>
              {Array.from({length:fraudCase.attestationsNeeded||2}).map((_,i)=>(
                <div key={i} style={{ flex:1, height:48, borderRadius:8, border:`2px solid ${i<(fraudCase.attestationsReceived||0)?C.green:C.border}`, background:i<(fraudCase.attestationsReceived||0)?`${C.green}15`:C.surface2, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, color:i<(fraudCase.attestationsReceived||0)?C.green:C.textDim }}>
                  {i<(fraudCase.attestationsReceived||0)?"✓":"·"}
                </div>
              ))}
            </div>
            <p style={{ color:C.textMuted, fontSize:13, margin:0 }}>
              {fraudCase.attestationsReceived||0} of {fraudCase.attestationsNeeded||2} attestations received
              {(fraudCase.attestationsReceived||0) >= (fraudCase.attestationsNeeded||2) && <span style={{ color:C.green, fontWeight:700 }}> — threshold met ✓</span>}
            </p>
          </div>
          {(fraudCase.attestations||[]).map((a,i)=>(
            <div key={i} style={{ background:C.surface2, border:`1px solid ${C.green}30`, borderRadius:8, padding:14, marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <span style={{ color:C.green, fontWeight:700, fontSize:13 }}>✓ Attested by {a.attestorName}</span>
                <span style={{ color:C.textDim, fontSize:11 }}>{timeAgo(a.ts)}</span>
              </div>
              {a.message && <p style={{ color:"#57534e", fontSize:12, margin:"6px 0 0" }}>{a.message}</p>}
            </div>
          ))}
          {(fraudCase.attestations||[]).length === 0 && <p style={{ color:C.textDim, fontSize:13 }}>No attestations received yet.</p>}
        </div>
      )}

      {activeTab === "notes" && (
        <div>
          {(fraudCase.notes||[]).map((n,i)=>(
            <div key={i} style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:8, padding:14, marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                <span style={{ color:"#3b82f6", fontSize:12, fontWeight:700 }}>🔒 {n.authorName}</span>
                <span style={{ color:C.textDim, fontSize:11 }}>{timeAgo(n.ts)}</span>
              </div>
              <p style={{ color:"#57534e", fontSize:13, margin:0 }}>{n.body}</p>
            </div>
          ))}
          {(fraudCase.notes||[]).length===0 && <p style={{ color:C.textDim, fontSize:13 }}>No notes yet.</p>}
        </div>
      )}
    </Modal>
  );
}

function CreateFraudCaseModal({ staff, onClose, onCreated, showToast }) {
  const [userId,      setUserId]     = useState("");
  const [userName,    setUserName]   = useState("");
  const [userEmail,   setUserEmail]  = useState("");
  const [type,        setType]       = useState("account_takeover");
  const [severity,    setSeverity]   = useState("high");
  const [notes,       setNotes]      = useState("");
  const [sigTypes,    setSigTypes]   = useState([]);
  const [saving,      setSaving]     = useState(false);

  const handleCreate = async () => {
    if (!userId.trim()) { showToast("User ID required","error"); return; }
    setSaving(true);
    try {
      const signals = sigTypes.map(t => ({ type:t, description:"Flagged at case creation", ts:new Date().toISOString() }));
      const id = await createFraudCase({ userId:userId.trim(), userName, userEmail, type, severity, signals, notes, staffInfo:staff });
      onCreated(id);
    } catch(e) { showToast(e.message,"error"); }
    finally { setSaving(false); }
  };

  const toggleSig = (t) => setSigTypes(prev => prev.includes(t) ? prev.filter(x=>x!==t) : [...prev,t]);

  return (
    <Modal title="Open Fraud Case" onClose={onClose} width={600}>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <Field label="Fraud Type" required>
          <Select value={type} onChange={setType} style={{ width:"100%" }} options={FRAUD_TYPES.map(t=>({ value:t, label:t.replace(/_/g," ") }))} />
        </Field>
        <Field label="Severity" required>
          <Select value={severity} onChange={setSeverity} style={{ width:"100%" }} options={[
            {value:"critical",label:"Critical"},{value:"high",label:"High"},{value:"medium",label:"Medium"}
          ]} />
        </Field>
      </div>
      <Field label="User Firestore ID" required>
        <Input value={userId} onChange={setUserId} placeholder="Firebase Auth UID" style={{ width:"100%", fontFamily:"monospace" }} />
      </Field>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <Field label="User Name">
          <Input value={userName} onChange={setUserName} placeholder="Display name" style={{ width:"100%" }} />
        </Field>
        <Field label="User Email">
          <Input value={userEmail} onChange={setUserEmail} placeholder="user@example.com" style={{ width:"100%" }} />
        </Field>
      </div>
      <Field label="Initial Signals Detected">
        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
          {FRAUD_SIGNAL_TYPES.map(t => (
            <button key={t} onClick={()=>toggleSig(t)} style={{ background:sigTypes.includes(t)?"#ef444420":C.surface2, border:`1px solid ${sigTypes.includes(t)?"#ef4444":C.border}`, color:sigTypes.includes(t)?"#ef4444":C.textMuted, borderRadius:6, padding:"4px 10px", fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
              {t.replace(/_/g," ")}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Opening Notes">
        <Textarea value={notes} onChange={setNotes} placeholder="Initial observations and evidence…" rows={3} />
      </Field>
      <div style={{ display:"flex", gap:10 }}>
        <Btn variant="danger" disabled={saving||!userId.trim()} onClick={handleCreate}>{saving?"Opening…":"Open Case"}</Btn>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}

// ─── MODULE: CONTENT MODERATION (live Firestore) ──────────────────────────────

const REPORT_REASONS = [
  "harassment","hate_speech","spam","misinformation","fake_account",
  "scam","fraud","doxxing","self_harm","violence","csam","other",
];

const CONTENT_TYPES = ["post","comment","profile","video","job_listing","message","reel_vibe"];

const REPORT_STATUS_MAP = {
  pending:   { color:"#f59e0b", label:"Pending"   },
  reviewing: { color:"#3b82f6", label:"Reviewing" },
  actioned:  { color:C.green,   label:"Actioned"  },
  dismissed: { color:"#57534e", label:"Dismissed" },
  appealed:  { color:"#8b5cf6", label:"Appealed"  },
};

const MOD_ACTIONS = [
  { value:"remove",         label:"Remove Content"          },
  { value:"warning",        label:"Issue Warning to User"   },
  { value:"restrict",       label:"Restrict User Account"   },
  { value:"suspend",        label:"Suspend User Account"    },
  { value:"label",          label:"Add Misleading Label"    },
  { value:"age_restrict",   label:"Age-Restrict Content"    },
];

function ContentModeration({ staff }) {
  const [reports,    setReports]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [selected,   setSelected]   = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filter,     setFilter]     = useState("pending");
  const [filterSev,  setFilterSev]  = useState("all");
  const [toast,      setToast]      = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const canWrite = ["platform_admin","trust_safety"].includes(staff.role);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToContentReports(data => {
      setReports(data);
      setLoading(false);
      setSelected(prev => prev ? data.find(r=>r.id===prev.id)||prev : null);
    });
    return unsub;
  }, []);

  const showToast = (msg, type="success") => setToast({ message:msg, type });

  const filtered = useMemo(() => reports.filter(r => {
    if (filter   !== "all" && r.status   !== filter)   return false;
    if (filterSev !== "all" && r.severity !== filterSev) return false;
    return true;
  }), [reports, filter, filterSev]);

  const stats = useMemo(() => ({
    pending:  reports.filter(r=>r.status==="pending").length,
    critical: reports.filter(r=>r.severity==="critical").length,
    today:    reports.filter(r=>{ const d=toDate(r.createdAt); return Date.now()-d.getTime()<86400000; }).length,
    actioned: reports.filter(r=>r.status==="actioned").length,
  }), [reports]);

  const handleModerate = async (reportId, action, note) => {
    if (!note?.trim()) return;
    setSubmitting(true);
    try {
      await moderateContent(reportId, action, note, staff);
      showToast(`Action taken: ${action.replace(/_/g," ")}`);
      setSelected(null);
    } catch(e){ showToast(e.message,"error"); }
    finally { setSubmitting(false); }
  };

  const handleDismiss = async (reportId, reason) => {
    if (!reason?.trim()) return;
    setSubmitting(true);
    try {
      await dismissReport(reportId, reason, staff);
      showToast("Report dismissed");
      setSelected(null);
    } catch(e){ showToast(e.message,"error"); }
    finally { setSubmitting(false); }
  };

  return (
    <div style={{ padding:28 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <h2 style={{ color:C.text, fontSize:20, fontWeight:800, margin:"0 0 4px" }}>Content Moderation</h2>
          <p style={{ color:C.textMuted, fontSize:13, margin:0 }}>Real-time · {reports.length} total reports</p>
        </div>
        {canWrite && <Btn variant="warning" onClick={()=>setShowCreate(true)}>+ File Report</Btn>}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }}>
        <Metric label="Pending Review"  value={stats.pending}  color="#f59e0b" alert={stats.pending>10} />
        <Metric label="Critical"        value={stats.critical} color="#ef4444" alert={stats.critical>0} />
        <Metric label="Reported Today"  value={stats.today}    color="#3b82f6" />
        <Metric label="Actioned Total"  value={stats.actioned} color={C.green} />
      </div>

      {stats.critical > 0 && (
        <div style={{ background:"#ef444415", border:"1px solid #ef444440", borderRadius:8, padding:"12px 16px", marginBottom:16, display:"flex", alignItems:"center", gap:12 }}>
          <span>🚨</span>
          <p style={{ color:"#ef4444", fontWeight:700, margin:0 }}>{stats.critical} critical report{stats.critical>1?"s require":"requires"} immediate review (potential CSAM / violence)</p>
        </div>
      )}

      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
        <Select value={filter} onChange={setFilter} options={[
          {value:"all",label:"All Statuses"},
          ...Object.entries(REPORT_STATUS_MAP).map(([k,v])=>({value:k,label:v.label}))
        ]} />
        <Select value={filterSev} onChange={setFilterSev} options={[
          {value:"all",label:"All Severity"},
          {value:"critical",label:"Critical"},{value:"high",label:"High"},{value:"medium",label:"Medium"}
        ]} />
        <span style={{ color:C.textDim, fontSize:12, alignSelf:"center", marginLeft:"auto" }}>{filtered.length} reports</span>
      </div>

      <div style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:10, overflow:"hidden" }}>
        <Table loading={loading} emptyMsg="No content reports" cols={[
          { key:"contentType", label:"Content", render: r => <span style={{ color:"#57534e", fontSize:12, textTransform:"capitalize" }}>{r.contentType?.replace(/_/g," ")}</span> },
          { key:"reason", label:"Reason", render: r => <span style={{ color:C.text, fontWeight:600, fontSize:12, textTransform:"capitalize" }}>{r.reason?.replace(/_/g," ")}</span> },
          { key:"severity", label:"Severity", render: r => <RiskBadge score={r.severity==="critical"?92:r.severity==="high"?68:38} /> },
          { key:"reportCount", label:"Reports", render: r => <span style={{ color:r.reportCount>=5?"#ef4444":"#f59e0b", fontWeight:700 }}>{r.reportCount||1}</span> },
          { key:"status", label:"Status", render: r => <StatusPill status={r.status||"pending"} map={REPORT_STATUS_MAP} /> },
          { key:"assignedName", label:"Reviewer", render: r => <span style={{ color:r.assignedName?C.textMuted:"#57534e", fontSize:12 }}>{r.assignedName||"—"}</span> },
          { key:"createdAt", label:"Reported", render: r => <span style={{ color:C.textMuted, fontSize:12 }}>{timeAgo(r.createdAt)}</span> },
        ]} rows={filtered} onRow={setSelected} />
      </div>

      {selected && (
        <ReportDetailModal
          report={selected} staff={staff} canWrite={canWrite} submitting={submitting}
          onClose={()=>setSelected(null)}
          onModerate={handleModerate}
          onDismiss={handleDismiss}
        />
      )}

      {showCreate && (
        <CreateReportModal staff={staff} onClose={()=>setShowCreate(false)}
          onCreated={()=>{ setShowCreate(false); showToast("Report filed"); }}
          showToast={showToast}
        />
      )}

      {toast && <Toast {...toast} onDone={()=>setToast(null)} />}
    </div>
  );
}

function ReportDetailModal({ report, staff, canWrite, submitting, onClose, onModerate, onDismiss }) {
  const [action,      setAction]      = useState("remove");
  const [actionNote,  setActionNote]  = useState("");
  const [dismissNote, setDismissNote] = useState("");
  const [activeTab,   setActiveTab]   = useState("details");
  const isActive = !["actioned","dismissed"].includes(report.status);

  return (
    <Modal title={`Report: ${report.reason?.replace(/_/g," ")}`} subtitle={`${report.id?.slice(0,8)} · ${report.contentType}`} onClose={onClose} width={700}>
      <div style={{ display:"flex", gap:8, marginBottom:20 }}>
        <StatusPill status={report.status||"pending"} map={REPORT_STATUS_MAP} />
        <RiskBadge score={report.severity==="critical"?92:report.severity==="high"?68:38} />
        {report.reportCount > 1 && (
          <span style={{ background:"#ef444420", color:"#ef4444", border:"1px solid #ef444440", borderRadius:4, padding:"2px 8px", fontSize:11, fontWeight:700 }}>
            {report.reportCount} reports
          </span>
        )}
      </div>

      <div style={{ display:"flex", borderBottom:`1px solid ${C.border}`, marginBottom:20 }}>
        {["details","action"].map(t=>(
          <button key={t} onClick={()=>setActiveTab(t)} style={{ background:"none", border:"none", cursor:"pointer", padding:"8px 16px", fontSize:13, fontWeight:600, color:activeTab===t?C.green:C.textMuted, borderBottom:activeTab===t?`2px solid ${C.green}`:"2px solid transparent", fontFamily:"inherit", textTransform:"capitalize", marginBottom:-1 }}>{t}</button>
        ))}
      </div>

      {activeTab === "details" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24 }}>
          <div>
            <p style={{ color:C.textMuted, fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", margin:"0 0 10px" }}>Content</p>
            <InfoRow label="Type"       value={report.contentType} />
            <InfoRow label="Content ID" value={report.contentId}   />
            {report.contentPreview && (
              <div style={{ marginTop:12, background:C.surface2, border:`1px solid ${C.border}`, borderRadius:8, padding:12 }}>
                <p style={{ color:C.textMuted, fontSize:11, fontWeight:700, textTransform:"uppercase", marginBottom:6 }}>Preview</p>
                <p style={{ color:"#57534e", fontSize:13, margin:0 }}>{report.contentPreview}</p>
              </div>
            )}
          </div>
          <div>
            <p style={{ color:C.textMuted, fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", margin:"0 0 10px" }}>Report</p>
            <InfoRow label="Reason"      value={report.reason?.replace(/_/g," ")} />
            <InfoRow label="Reported By" value={report.reportedByName} />
            <InfoRow label="Filed"       value={fmtDateTime(report.createdAt)} />
            <InfoRow label="Assigned"    value={report.assignedName||"Unassigned"} />
            {report.details && (
              <div style={{ marginTop:12, background:C.surface2, border:`1px solid ${C.border}`, borderRadius:8, padding:12 }}>
                <p style={{ color:C.textMuted, fontSize:11, fontWeight:700, textTransform:"uppercase", marginBottom:6 }}>Details</p>
                <p style={{ color:"#57534e", fontSize:13, margin:0 }}>{report.details}</p>
              </div>
            )}
            {report.actionNote && (
              <div style={{ marginTop:12, background:`${C.green}10`, border:`1px solid ${C.green}30`, borderRadius:8, padding:12 }}>
                <p style={{ color:C.textMuted, fontSize:11, fontWeight:700, textTransform:"uppercase", marginBottom:6 }}>Action Taken</p>
                <p style={{ color:"#57534e", fontSize:13, margin:0 }}>{report.action?.replace(/_/g," ")} — {report.actionNote}</p>
                <p style={{ color:C.textDim, fontSize:11, marginTop:4 }}>by {report.actionName} · {timeAgo(report.actionAt)}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "action" && canWrite && isActive && (
        <div>
          <Field label="Moderation Action" required>
            <Select value={action} onChange={setAction} style={{ width:"100%" }} options={MOD_ACTIONS} />
          </Field>
          <Field label="Action Notes" required>
            <Textarea value={actionNote} onChange={setActionNote} placeholder="Document what you found and why you're taking this action…" rows={4} />
          </Field>
          <div style={{ display:"flex", gap:8, marginBottom:24, flexWrap:"wrap" }}>
            <Btn variant="danger" disabled={submitting||!actionNote.trim()} onClick={()=>onModerate(report.id, action, actionNote)}>
              Take Action: {MOD_ACTIONS.find(a=>a.value===action)?.label}
            </Btn>
          </div>
          <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:20 }}>
            <p style={{ color:C.textMuted, fontSize:12, marginBottom:8 }}>— Or dismiss this report —</p>
            <Textarea value={dismissNote} onChange={setDismissNote} placeholder="Reason for dismissal (required)…" rows={2} />
            <div style={{ marginTop:8 }}>
              <Btn variant="ghost" disabled={submitting||!dismissNote.trim()} onClick={()=>onDismiss(report.id, dismissNote)}>
                Dismiss Report
              </Btn>
            </div>
          </div>
        </div>
      )}
      {activeTab === "action" && !isActive && (
        <div style={{ background:C.surface2, borderRadius:8, padding:20, textAlign:"center" }}>
          <p style={{ color:C.textMuted, fontSize:13 }}>This report has already been {report.status}.</p>
        </div>
      )}
    </Modal>
  );
}

function CreateReportModal({ staff, onClose, onCreated, showToast }) {
  const [contentType,    setContentType]    = useState("post");
  const [contentId,      setContentId]      = useState("");
  const [contentPreview, setContentPreview] = useState("");
  const [reason,         setReason]         = useState("spam");
  const [details,        setDetails]        = useState("");
  const [reportedByName, setReportedByName] = useState("");
  const [saving,         setSaving]         = useState(false);

  const handleCreate = async () => {
    if (!contentId.trim()) { showToast("Content ID required","error"); return; }
    setSaving(true);
    try {
      await createContentReport({ contentType, contentId:contentId.trim(), contentPreview, reason, details, reportedByName: reportedByName||"Ops team", staffInfo:staff });
      onCreated();
    } catch(e){ showToast(e.message,"error"); }
    finally { setSaving(false); }
  };

  return (
    <Modal title="File Content Report" onClose={onClose}>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <Field label="Content Type" required>
          <Select value={contentType} onChange={setContentType} style={{ width:"100%" }} options={CONTENT_TYPES.map(t=>({value:t,label:t.replace(/_/g," ")}))} />
        </Field>
        <Field label="Reason" required>
          <Select value={reason} onChange={setReason} style={{ width:"100%" }} options={REPORT_REASONS.map(r=>({value:r,label:r.replace(/_/g," ")}))} />
        </Field>
      </div>
      <Field label="Content / Document ID" required>
        <Input value={contentId} onChange={setContentId} placeholder="Firestore document ID of the content" style={{ width:"100%", fontFamily:"monospace" }} />
      </Field>
      <Field label="Content Preview (optional)">
        <Textarea value={contentPreview} onChange={setContentPreview} placeholder="Paste the content text or describe what was seen…" rows={3} />
      </Field>
      <Field label="Reported By">
        <Input value={reportedByName} onChange={setReportedByName} placeholder="Username or 'Ops team'" style={{ width:"100%" }} />
      </Field>
      <Field label="Additional Details">
        <Textarea value={details} onChange={setDetails} placeholder="Any additional context…" rows={2} />
      </Field>
      <div style={{ display:"flex", gap:10 }}>
        <Btn variant="warning" disabled={saving||!contentId.trim()} onClick={handleCreate}>{saving?"Filing…":"File Report"}</Btn>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}

// ─── MODULE: TEAM MANAGEMENT (live Firestore) ─────────────────────────────────

function TeamManagement({ staff }) {
  const [members,       setMembers]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [showInvite,    setShowInvite]    = useState(false);
  const [editMember,    setEditMember]    = useState(null);
  const [confirmRevoke, setConfirmRevoke] = useState(null);
  const [revokeReason,  setRevokeReason]  = useState("");
  const [submitting,    setSubmitting]    = useState(false);
  const [toast,         setToast]         = useState(null);
  const [tierFilter,    setTierFilter]    = useState("all");

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToOpsStaff(data => { setMembers(data); setLoading(false); });
    return unsub;
  }, []);

  const showToast = (msg, type="success") => setToast({ message:msg, type });

  const isAdmin = isTierAdmin(staff.role);
  const isManager = isTierManager(staff.role);

  // Managers only see their own queue's agents
  const visibleActive = members.filter(m => {
    if (m.isActive === false) return false;
    if (isAdmin) return true;
    if (isManager) return ROLES[m.role]?.queue === ROLES[staff.role]?.queue || m.uid === staff.uid;
    return false;
  });

  const byTier = tierFilter === "all" ? visibleActive : visibleActive.filter(m => ROLES[m.role]?.tier === tierFilter);
  const mfaMissing = visibleActive.filter(m => !m.mfaEnabled).length;

  const handleRoleChange = async (member, newRole) => {
    if (member.uid === staff.uid) { showToast("You cannot change your own role","error"); return; }
    if (!canChangeRole(staff.role, member.role, newRole)) { showToast("You don't have permission to make this role change","error"); return; }
    setSubmitting(true);
    try {
      await updateStaffRole(member.uid, newRole, staff);
      // Also update assignedQueue to match new role's queue
      if (ROLES[newRole]?.queue) {
        await updateDoc(doc(db, "ops_staff", member.uid), { assignedQueue: ROLES[newRole].queue });
      }
      showToast(`${member.name} → ${ROLES[newRole]?.label}`);
      setEditMember(null);
    } catch(e) { showToast(e.message,"error"); }
    finally { setSubmitting(false); }
  };

  const handleRevoke = async () => {
    if (!revokeReason.trim() || !confirmRevoke) return;
    if (confirmRevoke.uid === staff.uid) { showToast("You cannot revoke your own access","error"); return; }
    if (!canChangeRole(staff.role, confirmRevoke.role, "auditor")) { showToast("You don't have permission to revoke this member","error"); return; }
    setSubmitting(true);
    try {
      await revokeStaffAccess(confirmRevoke.uid, revokeReason, staff);
      showToast(`${confirmRevoke.name}'s access revoked`,"warning");
      setConfirmRevoke(null);
      setRevokeReason("");
    } catch(e) { showToast(e.message,"error"); }
    finally { setSubmitting(false); }
  };

  // Roles this actor can assign to target member
  const availableRolesFor = (member) =>
    Object.entries(ROLES).filter(([k]) => canChangeRole(staff.role, member.role, k) && k !== member.role);

  // Group active members by tier for display
  const tiers = ["admin","manager","agent"];
  const tierLabels = { admin:"Admins", manager:"Managers", agent:"Agents" };

  return (
    <div style={{ padding:28 }}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <h2 style={{ color:C.text, fontSize:20, fontWeight:800, margin:"0 0 4px" }}>Team Management</h2>
          <p style={{ color:C.textMuted, fontSize:13, margin:0 }}>
            {visibleActive.length} active · {members.filter(m=>m.isActive===false).length} revoked
            {isManager && ` · ${ROLES[staff.role]?.queue} queue`}
          </p>
        </div>
        <Btn variant="primary" onClick={() => setShowInvite(true)}>+ Add Staff Member</Btn>
      </div>

      {mfaMissing > 0 && (
        <div style={{ background:"#f59e0b15", border:"1px solid #f59e0b40", borderRadius:8, padding:"12px 16px", marginBottom:20 }}>
          <p style={{ color:"#f59e0b", fontWeight:700, margin:0, fontSize:13 }}>
            ⚠ {mfaMissing} staff member{mfaMissing>1?"s":""}  without MFA enabled — required for ops access
          </p>
        </div>
      )}

      {/* Tier filter tabs */}
      <div style={{ display:"flex", gap:2, marginBottom:20, background:C.surface2, borderRadius:8, padding:3, width:"fit-content" }}>
        {["all",...tiers].map(t => {
          const cnt = t === "all" ? visibleActive.length : visibleActive.filter(m=>ROLES[m.role]?.tier===t).length;
          return (
            <button key={t} onClick={() => setTierFilter(t)}
              style={{ padding:"6px 16px", borderRadius:6, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:700, background:tierFilter===t?C.surface:"transparent", color:tierFilter===t?C.text:C.textMuted, textTransform:"capitalize" }}>
              {t === "all" ? "All" : tierLabels[t]} ({cnt})
            </button>
          );
        })}
      </div>

      {/* Members grouped by tier */}
      {(tierFilter === "all" ? tiers : [tierFilter]).map(tier => {
        const group = byTier.filter(m => ROLES[m.role]?.tier === tier);
        if (group.length === 0) return null;
        return (
          <div key={tier} style={{ marginBottom:24 }}>
            <p style={{ color:C.textDim, fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10 }}>
              {tierLabels[tier]} · {group.length}
            </p>
            <div style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:10, overflow:"hidden" }}>
              {group.map((m, i) => {
                const role = ROLES[m.role];
                const canEdit = m.uid !== staff.uid && isAdmin || (isManager && isTierAgent(m.role) && ROLES[m.role]?.queue === ROLES[staff.role]?.queue);
                return (
                  <div key={m.uid} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"13px 18px", borderBottom: i<group.length-1?`1px solid ${C.border}`:"none" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                      {/* Avatar */}
                      <div style={{ width:34, height:34, borderRadius:8, background:`${role?.color||"#64748b"}20`, border:`1px solid ${role?.color||"#64748b"}40`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:800, color:role?.color||"#64748b", flexShrink:0 }}>
                        {m.name?.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <p style={{ color:C.text, fontWeight:600, fontSize:13, margin:0 }}>{m.name}</p>
                          {m.uid === staff.uid && <span style={{ color:C.textDim, fontSize:10, background:C.surface, border:`1px solid ${C.border}`, borderRadius:4, padding:"1px 6px" }}>you</span>}
                        </div>
                        <p style={{ color:C.textMuted, fontSize:11, margin:"1px 0 0" }}>{m.email}</p>
                      </div>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      {/* Role pill */}
                      <span style={{ background:`${role?.color||"#64748b"}20`, color:role?.color||"#64748b", border:`1px solid ${role?.color||"#64748b"}40`, borderRadius:4, padding:"2px 8px", fontSize:11, fontWeight:700 }}>
                        {role?.label||m.role}
                      </span>
                      {/* Queue badge */}
                      {role?.queue && (
                        <span style={{ color:C.textDim, fontSize:10, background:C.surface, border:`1px solid ${C.border}`, borderRadius:4, padding:"2px 7px" }}>{role.queue}</span>
                      )}
                      {/* MFA */}
                      {!m.mfaEnabled && <span style={{ color:"#ef4444", fontSize:10, fontWeight:700 }}>NO MFA</span>}
                      {/* Actions */}
                      {canEdit && (
                        <div style={{ display:"flex", gap:6 }}>
                          <Btn size="sm" onClick={() => setEditMember(m)}>Change Role</Btn>
                          <Btn size="sm" variant="danger" onClick={() => setConfirmRevoke(m)}>Revoke</Btn>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Revoked section */}
      {isAdmin && members.filter(m=>m.isActive===false).length > 0 && (
        <div style={{ marginTop:8 }}>
          <p style={{ color:C.textDim, fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:10 }}>Revoked Access</p>
          <div style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:10, overflow:"hidden", opacity:0.55 }}>
            {members.filter(m=>m.isActive===false).map((m, i, arr) => (
              <div key={m.uid} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 18px", borderBottom: i<arr.length-1?`1px solid ${C.border}`:"none" }}>
                <div>
                  <p style={{ color:C.textMuted, fontSize:13, fontWeight:600, margin:0 }}>{m.name}</p>
                  <p style={{ color:C.textDim, fontSize:11, margin:"1px 0 0" }}>{m.email}</p>
                </div>
                <span style={{ color:C.textDim, fontSize:11 }}>Was: {ROLES[m.role]?.label||m.role}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Change Role modal */}
      {editMember && (
        <Modal title={`Change Role: ${editMember.name}`} subtitle={editMember.email} onClose={() => setEditMember(null)} width={540}>
          {/* Current state */}
          <div style={{ background:C.surface2, borderRadius:8, padding:"12px 14px", marginBottom:20 }}>
            <p style={{ color:C.textDim, fontSize:11, fontWeight:700, textTransform:"uppercase", margin:"0 0 6px" }}>Current role</p>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ background:`${ROLES[editMember.role]?.color}20`, color:ROLES[editMember.role]?.color, border:`1px solid ${ROLES[editMember.role]?.color}40`, borderRadius:4, padding:"3px 10px", fontSize:12, fontWeight:700 }}>
                {ROLES[editMember.role]?.label}
              </span>
              <span style={{ color:C.textDim, fontSize:11 }}>{ROLES[editMember.role]?.tier?.toUpperCase()} · Level {ROLES[editMember.role]?.level}</span>
            </div>
            <p style={{ color:C.textDim, fontSize:11, margin:"6px 0 0" }}>{ROLES[editMember.role]?.description}</p>
          </div>

          <p style={{ color:C.textMuted, fontSize:12, fontWeight:600, margin:"0 0 8px" }}>Graduate to / Demote to</p>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {availableRolesFor(editMember).map(([k, v]) => {
              const isPromotion = v.level > (ROLES[editMember.role]?.level||0);
              const isDemotion  = v.level < (ROLES[editMember.role]?.level||0);
              return (
                <button key={k} onClick={() => handleRoleChange(editMember, k)} disabled={submitting}
                  style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:C.surface2, border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 14px", cursor:"pointer", fontFamily:"inherit", opacity:submitting?0.5:1 }}>
                  <div>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ color:v.color, fontWeight:700, fontSize:13 }}>{v.label}</span>
                      <span style={{ fontSize:10, fontWeight:700, color: isPromotion?"#1a4a3a":"#f59e0b", background: isPromotion?"#e8f4f0":"#f59e0b20", borderRadius:4, padding:"1px 6px" }}>
                        {isPromotion ? "▲ Graduate" : isDemotion ? "▼ Demote" : "→ Lateral"}
                      </span>
                    </div>
                    <p style={{ color:C.textDim, fontSize:11, margin:"3px 0 0" }}>{v.description}</p>
                  </div>
                  <span style={{ color:C.textDim, fontSize:11, whiteSpace:"nowrap", marginLeft:12 }}>L{v.level}</span>
                </button>
              );
            })}
            {availableRolesFor(editMember).length === 0 && (
              <p style={{ color:C.textDim, fontSize:12, padding:12 }}>No role changes available with your permission level.</p>
            )}
          </div>
          <div style={{ marginTop:16 }}>
            <Btn variant="ghost" onClick={() => setEditMember(null)}>Cancel</Btn>
          </div>
        </Modal>
      )}

      {/* Revoke confirm modal */}
      {confirmRevoke && (
        <Modal title={`Revoke Access: ${confirmRevoke.name}`} onClose={() => { setConfirmRevoke(null); setRevokeReason(""); }} width={480}>
          <div style={{ background:"#ef444415", border:"1px solid #ef444440", borderRadius:8, padding:"12px 14px", marginBottom:20 }}>
            <p style={{ color:"#ef4444", fontWeight:700, margin:0 }}>
              ⚠ This will immediately block {confirmRevoke.name} from the ops platform.
            </p>
          </div>
          <Field label="Reason for revocation" required>
            <Textarea value={revokeReason} onChange={setRevokeReason} placeholder="Document the reason — immutably logged…" rows={3} />
          </Field>
          <div style={{ display:"flex", gap:10 }}>
            <Btn variant="danger" disabled={submitting||!revokeReason.trim()} onClick={handleRevoke}>Confirm Revoke</Btn>
            <Btn variant="ghost" onClick={() => { setConfirmRevoke(null); setRevokeReason(""); }}>Cancel</Btn>
          </div>
        </Modal>
      )}

      {showInvite && (
        <InviteStaffModal staff={staff} onClose={() => setShowInvite(false)}
          onCreated={() => { setShowInvite(false); showToast("Staff record created — send them the login link"); }}
          showToast={showToast}
        />
      )}

      {toast && <Toast {...toast} onDone={() => setToast(null)} />}
    </div>
  );
}

function InviteStaffModal({ staff, onClose, onCreated, showToast }) {
  const [email,     setEmail]     = useState("");
  const [name,      setName]      = useState("");
  const [role,      setRole]      = useState("support_agent");
  const [saving,    setSaving]    = useState(false);
  const [step,      setStep]      = useState("form");  // form | success
  const [tempPass,  setTempPass]  = useState("");

  const allowedRoles = Object.entries(ROLES).filter(([k, v]) => {
    if (k === "platform_admin") return false;
    if (isTierAdmin(staff.role)) return true;
    if (isTierManager(staff.role)) return isTierAgent(v.tier) && v.queue === ROLES[staff.role]?.queue;
    return false;
  });

  // Generate a secure temporary password
  const genTempPass = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
    return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  };

  const handleCreate = async () => {
    if (!email.trim() || !name.trim()) {
      showToast("Email and name are required", "error"); return;
    }
    setSaving(true);
    let secondaryApp = null;
    try {
      // ── Key fix: use a secondary Firebase app instance ──────────────────────
      // createUserWithEmailAndPassword signs IN as the new user, which would
      // replace the admin's auth session and cause all subsequent Firestore
      // writes to fail with "missing or insufficient permissions".
      //
      // A secondary app has its own auth state, completely isolated from the
      // primary app. The admin stays signed in on the primary app throughout.

      const { initializeApp, deleteApp, getApps } = await import("firebase/app");
      const { getAuth: getSecondaryAuth } = await import("firebase/auth");

      // Re-use existing secondary app or create a fresh one
      const SECONDARY = "bewatu-ops-staff-creator";
      secondaryApp = getApps().find(a => a.name === SECONDARY) ||
        initializeApp(firebaseConfig, SECONDARY);
      const secondaryAuth = getSecondaryAuth(secondaryApp);

      // 1. Create the Firebase Auth account on the secondary app
      const tmpPwd = genTempPass();
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), tmpPwd);
      const newUid = cred.user.uid;

      // Sign out the secondary session immediately — we don't need it anymore
      await secondaryAuth.signOut();

      // 2. Write ops_staff Firestore record (admin's session is still active)
      await createOpsStaffRecord({
        uid: newUid,
        email: email.trim(),
        name: name.trim(),
        role,
        invitedBy: staff.uid,
        assignedQueue: ROLES[role]?.queue,
      });

      // 3. Audit log
      await writeAuditEntry({
        action: "staff.invited", actorUid: staff.uid,
        actorEmail: staff.email, actorRole: staff.role,
        targetId: newUid, targetType: "staff",
        after: { email: email.trim(), role, tier: ROLES[role]?.tier },
        reason: `Staff member created by ${staff.name} with role ${ROLES[role]?.label}`,
      });

      // 4. Send password reset email so the new staff member sets their own password
      await sendPasswordResetEmail(auth, email.trim());

      setStep("success");
    } catch(e) {
      const msg = e.code === "auth/email-already-in-use"
        ? "An account with this email already exists in Firebase Auth."
        : e.code === "auth/invalid-email"
        ? "Invalid email address."
        : e.code === "permission-denied" || e.code === "PERMISSION_DENIED"
        ? "Permission denied — ensure your account has platform_admin role and Firestore rules are deployed."
        : e.message;
      showToast(msg, "error");
    } finally {
      // Clean up secondary app to avoid memory leaks on repeated invites
      if (secondaryApp) {
        const { deleteApp } = await import("firebase/app").catch(() => ({}));
        deleteApp?.(secondaryApp).catch(() => {});
      }
      setSaving(false);
    }
  };

  if (step === "success") return (
    <Modal title="Staff Member Created" onClose={onClose} width={500}>
      <div style={{ background:"#e8f4f0", border:"1px solid #10b98140", borderRadius:10, padding:20, marginBottom:20, textAlign:"center" }}>
        <div style={{ fontSize:32, marginBottom:8 }}>✓</div>
        <p style={{ color:C.green, fontWeight:800, fontSize:15, margin:"0 0 4px" }}>Account created</p>
        <p style={{ color:"#10b98199", fontSize:12, margin:0 }}>{name} · {email}</p>
      </div>

      <div style={{ background:C.surface2, borderRadius:8, padding:16, marginBottom:16 }}>
        <p style={{ color:C.textMuted, fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", margin:"0 0 8px" }}>What happened automatically</p>
        {[
          ["✓", "Firebase Auth account created"],
          ["✓", "Ops staff record written to Firestore"],
          ["✓", `Role assigned: ${ROLES[role]?.label}`],
          ["✓", "Password reset email sent to their inbox"],
          ["✓", "Action recorded in audit log"],
        ].map(([icon, text]) => (
          <div key={text} style={{ display:"flex", gap:8, marginBottom:6 }}>
            <span style={{ color:C.green, fontSize:12, flexShrink:0 }}>{icon}</span>
            <span style={{ color:C.textMuted, fontSize:12 }}>{text}</span>
          </div>
        ))}
      </div>

      <div style={{ background:"#f59e0b15", border:"1px solid #f59e0b40", borderRadius:8, padding:12, marginBottom:20 }}>
        <p style={{ color:"#f59e0b", fontSize:12, fontWeight:700, margin:"0 0 4px" }}>⚠ Tell them to check their email</p>
        <p style={{ color:"#f59e0b99", fontSize:11, margin:0, lineHeight:1.5 }}>
          A password reset link was sent to <strong>{email}</strong>. They must use it to set their password before they can log in. The link expires in 1 hour.
        </p>
      </div>

      <Btn variant="primary" fullWidth onClick={onCreated}>Done</Btn>
    </Modal>
  );

  return (
    <Modal title="Add Staff Member" onClose={onClose} width={560}>
      <div style={{ background:"#e8f4f0", border:"1px solid #10b98140", borderRadius:8, padding:"11px 14px", marginBottom:20 }}>
        <p style={{ color:C.green, fontSize:12, margin:0 }}>
          ✓ Just fill in the details below. The Firebase account, password reset email, and staff record are all created automatically.
        </p>
      </div>

      <Field label="Work Email" required>
        <Input value={email} onChange={setEmail} placeholder="name@bewatu.com" type="email" style={{ width:"100%" }} />
      </Field>
      <Field label="Display Name" required>
        <Input value={name} onChange={setName} placeholder="Full name" style={{ width:"100%" }} />
      </Field>
      <Field label="Role" required>
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {allowedRoles.map(([k, v]) => (
            <button key={k} onClick={() => setRole(k)}
              style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                background:k===role?`${v.color}20`:C.surface2,
                border:`1px solid ${k===role?v.color:C.border}`,
                borderRadius:8, padding:"10px 14px", cursor:"pointer", fontFamily:"inherit", textAlign:"left" }}>
              <div>
                <span style={{ color:v.color, fontWeight:700, fontSize:13 }}>{v.label}</span>
                <span style={{ color:C.textDim, fontSize:10, marginLeft:8 }}>{v.tier.toUpperCase()} · L{v.level}</span>
                <p style={{ color:C.textMuted, fontSize:11, margin:"2px 0 0" }}>{v.description}</p>
              </div>
              {v.queue && <span style={{ color:C.textDim, fontSize:11, whiteSpace:"nowrap", marginLeft:12 }}>{v.queue}</span>}
            </button>
          ))}
        </div>
      </Field>

      <div style={{ display:"flex", gap:10, marginTop:16 }}>
        <Btn variant="primary" disabled={saving||!email.trim()||!name.trim()} onClick={handleCreate} fullWidth>
          {saving ? "Creating account…" : "Create Staff Member"}
        </Btn>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}

// ─── RECRUITER APPLICATIONS ───────────────────────────────────────────────────

function RecruiterApplications({ staff }) {
  const [applications, setApplications] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [activeTab,    setActiveTab]    = useState("pending");
  const [selected,     setSelected]     = useState(null);
  const [rejectNote,   setRejectNote]   = useState("");
  const [submitting,   setSubmitting]   = useState(false);
  const [toast,        setToast]        = useState(null);

  useEffect(() => {
    const unsub = subscribeToRecruiterApplications(data => { setApplications(data); setLoading(false); });
    return unsub;
  }, []);

  const showToast = (msg, type="success") => setToast({ message:msg, type });

  const filtered = applications.filter(a => a.status === activeTab);

  const handleApprove = async (app) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await approveRecruiterApplication(app.id, staff);
      showToast(`${app.recruiterName || app.name} approved`);
      setSelected(null);
    } catch(e) { showToast(e.message, "error"); }
    finally { setSubmitting(false); }
  };

  const handleReject = async (app) => {
    if (!rejectNote.trim()) { showToast("Rejection reason required", "error"); return; }
    if (submitting) return;
    setSubmitting(true);
    try {
      await rejectRecruiterApplication(app.id, rejectNote, staff);
      showToast(`${app.recruiterName || app.name} rejected`);
      setSelected(null);
      setRejectNote("");
    } catch(e) { showToast(e.message, "error"); }
    finally { setSubmitting(false); }
  };

  const tabs = ["pending","approved","rejected"];
  const counts = Object.fromEntries(tabs.map(t => [t, applications.filter(a=>a.status===t).length]));

  return (
    <div style={{ padding:28 }}>
      <div style={{ marginBottom:20 }}>
        <h2 style={{ color:C.text, fontSize:20, fontWeight:800, margin:"0 0 4px" }}>Recruiter Applications</h2>
        <p style={{ color:C.textMuted, fontSize:13, margin:0 }}>{counts.pending} pending review</p>
      </div>

      {/* Tab bar */}
      <div style={{ display:"flex", gap:2, marginBottom:20, background:C.surface2, borderRadius:8, padding:3, width:"fit-content" }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            style={{ padding:"6px 16px", borderRadius:6, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:700, background:activeTab===t?C.surface:"transparent", color:activeTab===t?C.text:C.textMuted, textTransform:"capitalize" }}>
            {t} {counts[t] > 0 && <span style={{ marginLeft:4, background:"#ef444430", color:"#ef4444", borderRadius:10, padding:"0 5px", fontSize:10 }}>{counts[t]}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color:C.textMuted, fontSize:13 }}>Loading…</p>
      ) : filtered.length === 0 ? (
        <div style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:10, padding:40, textAlign:"center" }}>
          <p style={{ color:C.textDim, fontSize:14, margin:0 }}>No {activeTab} applications</p>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {filtered.map(app => (
            <div key={app.id} style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:10, padding:18, cursor:"pointer" }} onClick={() => setSelected(app)}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div>
                  <p style={{ color:C.text, fontWeight:700, fontSize:14, margin:"0 0 2px" }}>{app.recruiterName || app.name || "Unknown"}</p>
                  <p style={{ color:C.textMuted, fontSize:12, margin:"0 0 4px" }}>{app.recruiterEmail || app.email}</p>
                  {app.company && <p style={{ color:C.textDim, fontSize:12, margin:0 }}>{app.company}</p>}
                </div>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>
                  <span style={{ fontSize:11, color:C.textMuted }}>{timeAgo(app.createdAt)}</span>
                  {app.status === "pending" && (
                    <div style={{ display:"flex", gap:6 }} onClick={e => e.stopPropagation()}>
                      <Btn size="sm" variant="success" disabled={submitting} onClick={() => handleApprove(app)}>Approve</Btn>
                      <Btn size="sm" variant="danger"  disabled={submitting} onClick={() => setSelected(app)}>Reject</Btn>
                    </div>
                  )}
                  {app.status === "approved" && <span style={{ color:"#1a4a3a", fontSize:11, fontWeight:700 }}>✓ Approved</span>}
                  {app.status === "rejected" && <span style={{ color:"#ef4444", fontSize:11, fontWeight:700 }}>✕ Rejected</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail / Reject modal */}
      {selected && (
        <Modal title={selected.recruiterName || selected.name || "Application"} subtitle={selected.recruiterEmail || selected.email} onClose={() => { setSelected(null); setRejectNote(""); }} width={520}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:20 }}>
            {[
              ["Company",  selected.company],
              ["Applied",  fmtDateTime(selected.createdAt)],
              ["LinkedIn", selected.linkedin],
              ["Website",  selected.website],
            ].filter(([,v])=>v).map(([label, val]) => (
              <div key={label} style={{ background:C.surface2, borderRadius:8, padding:"10px 12px" }}>
                <p style={{ color:C.textDim, fontSize:10, fontWeight:700, textTransform:"uppercase", margin:"0 0 3px" }}>{label}</p>
                <p style={{ color:C.text, fontSize:12, margin:0, wordBreak:"break-all" }}>{val}</p>
              </div>
            ))}
          </div>
          {selected.notes && (
            <div style={{ background:C.surface2, borderRadius:8, padding:12, marginBottom:16 }}>
              <p style={{ color:C.textDim, fontSize:10, fontWeight:700, textTransform:"uppercase", margin:"0 0 4px" }}>Notes / Message</p>
              <p style={{ color:C.textMuted, fontSize:12, margin:0, lineHeight:1.6 }}>{selected.notes}</p>
            </div>
          )}
          {selected.status === "pending" && (
            <>
              <Field label="Rejection reason (required if rejecting)">
                <Textarea value={rejectNote} onChange={setRejectNote} placeholder="Reason visible in audit log only…" rows={3} />
              </Field>
              <div style={{ display:"flex", gap:10 }}>
                <Btn variant="success" disabled={submitting} onClick={() => handleApprove(selected)}>✓ Approve</Btn>
                <Btn variant="danger"  disabled={submitting||!rejectNote.trim()} onClick={() => handleReject(selected)}>✕ Reject</Btn>
                <Btn variant="ghost"   onClick={() => { setSelected(null); setRejectNote(""); }}>Cancel</Btn>
              </div>
            </>
          )}
          {selected.status !== "pending" && (
            <div style={{ background:C.surface2, borderRadius:8, padding:12 }}>
              <p style={{ color:C.textDim, fontSize:11, margin:"0 0 2px" }}>Reviewed by {selected.reviewedByName}</p>
              {selected.rejectionReason && <p style={{ color:"#ef4444", fontSize:12, margin:"4px 0 0" }}>{selected.rejectionReason}</p>}
            </div>
          )}
        </Modal>
      )}

      {toast && <Toast {...toast} onDone={() => setToast(null)} />}
    </div>
  );
}

// ─── CREDENTIAL CHANGE REQUESTS ───────────────────────────────────────────────

function CredentialChanges({ staff }) {
  const [requests,   setRequests]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [activeTab,  setActiveTab]  = useState("pending");
  const [selected,   setSelected]   = useState(null);
  const [rejectNote, setRejectNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast,      setToast]      = useState(null);

  useEffect(() => {
    const unsub = subscribeToCredentialRequests(data => { setRequests(data); setLoading(false); });
    return unsub;
  }, []);

  const showToast = (msg, type="success") => setToast({ message:msg, type });
  const filtered = requests.filter(r => r.status === activeTab);
  const counts = { pending: requests.filter(r=>r.status==="pending").length, approved: requests.filter(r=>r.status==="approved").length, rejected: requests.filter(r=>r.status==="rejected").length };

  const handleApprove = async (req) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await approveCredentialRequest(req.id, staff);
      showToast("Change approved — Firebase Auth will be updated by Cloud Function");
      setSelected(null);
    } catch(e) { showToast(e.message, "error"); }
    finally { setSubmitting(false); }
  };

  const handleReject = async (req) => {
    if (!rejectNote.trim()) { showToast("Rejection reason required", "error"); return; }
    if (submitting) return;
    setSubmitting(true);
    try {
      await rejectCredentialRequest(req.id, rejectNote, staff);
      showToast("Change rejected and user notified");
      setSelected(null);
      setRejectNote("");
    } catch(e) { showToast(e.message, "error"); }
    finally { setSubmitting(false); }
  };

  return (
    <div style={{ padding:28 }}>
      <div style={{ marginBottom:20 }}>
        <h2 style={{ color:C.text, fontSize:20, fontWeight:800, margin:"0 0 4px" }}>Credential Change Requests</h2>
        <p style={{ color:C.textMuted, fontSize:13, margin:0 }}>User requests to change email or password. Must be reviewed before Firebase Auth is updated.</p>
      </div>

      <div style={{ background:"#f59e0b15", border:"1px solid #f59e0b40", borderRadius:8, padding:"12px 16px", marginBottom:20 }}>
        <p style={{ color:"#f59e0b", fontSize:12, margin:0 }}>⚠ Verify the user's identity before approving email changes. Cross-check with their account document and any recent activity.</p>
      </div>

      {/* Tab bar */}
      <div style={{ display:"flex", gap:2, marginBottom:20, background:C.surface2, borderRadius:8, padding:3, width:"fit-content" }}>
        {["pending","approved","rejected"].map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            style={{ padding:"6px 16px", borderRadius:6, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:700, background:activeTab===t?C.surface:"transparent", color:activeTab===t?C.text:C.textMuted, textTransform:"capitalize" }}>
            {t} {counts[t] > 0 && <span style={{ marginLeft:4, background:"#ef444430", color:"#ef4444", borderRadius:10, padding:"0 5px", fontSize:10 }}>{counts[t]}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color:C.textMuted, fontSize:13 }}>Loading…</p>
      ) : filtered.length === 0 ? (
        <div style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:10, padding:40, textAlign:"center" }}>
          <p style={{ color:C.textDim, fontSize:14, margin:0 }}>No {activeTab} requests</p>
        </div>
      ) : (
        <div style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:10, overflow:"hidden" }}>
          {filtered.map((req, i) => (
            <div key={req.id} style={{ padding:"14px 18px", borderBottom: i < filtered.length-1 ? `1px solid ${C.border}` : "none", display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer" }} onClick={() => setSelected(req)}>
              <div>
                <p style={{ color:C.text, fontWeight:600, fontSize:13, margin:"0 0 2px" }}>{req.userName} <span style={{ color:C.textMuted, fontWeight:400 }}>— {req.type === "email" ? "Email change" : "Password change"}</span></p>
                <p style={{ color:C.textMuted, fontSize:11, margin:0 }}>{req.userEmail} · {timeAgo(req.requestedAt)}</p>
                {req.type === "email" && req.newValue && (
                  <p style={{ color:"#3b82f6", fontSize:11, margin:"2px 0 0" }}>→ {req.newValue}</p>
                )}
              </div>
              <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                {req.status === "pending" && (
                  <>
                    <Btn size="sm" variant="success" disabled={submitting} onClick={e => { e.stopPropagation(); handleApprove(req); }}>Approve</Btn>
                    <Btn size="sm" variant="danger"  disabled={submitting} onClick={e => { e.stopPropagation(); setSelected(req); }}>Reject</Btn>
                  </>
                )}
                {req.status === "approved" && <span style={{ color:"#1a4a3a", fontSize:11, fontWeight:700 }}>✓ Approved</span>}
                {req.status === "rejected" && <span style={{ color:"#ef4444", fontSize:11, fontWeight:700 }}>✕ Rejected</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail/action modal */}
      {selected && (
        <Modal title={`${selected.type === "email" ? "Email" : "Password"} Change Request`} subtitle={`${selected.userName} · ${selected.userEmail}`} onClose={() => { setSelected(null); setRejectNote(""); }} width={500}>
          <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:20 }}>
            <div style={{ background:C.surface2, borderRadius:8, padding:12 }}>
              <p style={{ color:C.textDim, fontSize:10, fontWeight:700, textTransform:"uppercase", margin:"0 0 3px" }}>Request type</p>
              <p style={{ color:C.text, fontSize:13, fontWeight:600, margin:0 }}>{selected.type === "email" ? "Email address change" : "Password reset"}</p>
            </div>
            {selected.type === "email" && selected.newValue && (
              <div style={{ background:C.surface2, borderRadius:8, padding:12 }}>
                <p style={{ color:C.textDim, fontSize:10, fontWeight:700, textTransform:"uppercase", margin:"0 0 3px" }}>Requested new email</p>
                <p style={{ color:"#3b82f6", fontSize:13, margin:0 }}>{selected.newValue}</p>
              </div>
            )}
            <div style={{ background:C.surface2, borderRadius:8, padding:12 }}>
              <p style={{ color:C.textDim, fontSize:10, fontWeight:700, textTransform:"uppercase", margin:"0 0 3px" }}>Submitted</p>
              <p style={{ color:C.text, fontSize:13, margin:0 }}>{fmtDateTime(selected.requestedAt)}</p>
            </div>
          </div>
          {selected.status === "pending" && (
            <>
              <Field label="Rejection reason (required if rejecting)">
                <Textarea value={rejectNote} onChange={setRejectNote} placeholder="Reason for rejection — logged in audit trail…" rows={3} />
              </Field>
              <div style={{ display:"flex", gap:10 }}>
                <Btn variant="success" disabled={submitting} onClick={() => handleApprove(selected)}>✓ Approve Change</Btn>
                <Btn variant="danger"  disabled={submitting||!rejectNote.trim()} onClick={() => handleReject(selected)}>✕ Reject</Btn>
                <Btn variant="ghost"   onClick={() => { setSelected(null); setRejectNote(""); }}>Cancel</Btn>
              </div>
            </>
          )}
          {selected.status !== "pending" && (
            <div style={{ background:C.surface2, borderRadius:8, padding:12 }}>
              <p style={{ color:C.textDim, fontSize:11, margin:"0 0 2px" }}>Reviewed by {selected.reviewedByName} · {fmtDateTime(selected.reviewedAt)}</p>
              {selected.rejectionReason && <p style={{ color:"#ef4444", fontSize:12, margin:"4px 0 0" }}>{selected.rejectionReason}</p>}
            </div>
          )}
        </Modal>
      )}
      {toast && <Toast {...toast} onDone={() => setToast(null)} />}
    </div>
  );
}

// ─── LOGO COMPONENTS ─────────────────────────────────────────────────────────
function BewatuLogoMark({ size = 28, color = "#1a4a3a" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 960 948"
      width={size}
      height={size}
      style={{ flexShrink: 0 }}
    >
      <g transform="scale(8.108108108108109) translate(10, 10)">
        <g transform="matrix(1.0970785445864348,0,0,1.0970785445864348,-4.869122522979331,-6.419242310879041)" fill={color}>
          <g><g><g><g>
            <path d="M51.5,85.2c-0.4-0.5-0.8-0.2-0.8-0.5c-2.4,0.6-6.9-1-8.8-0.8c0.4-0.6-0.6-0.5-0.6-0.9c-0.4,0.6-0.8,0-1.4,0.2      c-0.6-1.5-3-0.4-3.3-2.3c-1.4,0-1.9-0.8-3.3-1.6c0.1-0.1,0.2-0.1,0.3-0.2c-0.7-0.1-0.7-0.5-1.3-0.5l0.2-0.4      c-1.1-0.2-1.5-1.9-3.1-2.5c-0.5-0.1-1.6-1.8-2.2-2.2c-0.3-0.2-0.8-0.2-0.1-0.3c-0.1-0.1-0.1-0.3,0-0.4c-0.7-0.2-0.8-0.8-1.7-1.1      c-0.1-0.3,0.2-0.5,0-0.7c-0.2-0.1-0.5,0.1-0.7,0c-0.1,1.8,1.9,2,2.5,3.5c-0.2-0.2-0.5-0.8-0.7-0.4c-0.1,0.3,0.8,1.4,0.8,0.8      c-0.3,0.2-0.4-0.3-0.2-0.4c0.3,0.5,0.9,0.4,0.9,0.8c-0.3,0.3-0.7-0.3-0.6,0.2c0.9,0.5,0.8,1,1.3,1.7c-0.4-0.5-0.5,0.4-0.9,0      c-0.1-1.5-1.8-1.2-1.8-2.7c-0.2-0.5-0.4-0.1-0.7-0.3c0.4-0.4-1.2-1.8-1.2-1.3c-0.5-0.6-0.2-0.8-0.3-1.2      c-0.4-0.1-0.1,0.4-0.4,0.1c0.4-0.7-0.5-1.6-1.1-2.3l0.4-0.2c-0.7-0.4-0.8-1.2-1.3-2.1c-0.6,0.9,1.2,2.9,0.9,3.3      c0,0.1,0.7,0.9,0.9,1.3c0.8,1.4,1.4,3.1,2.5,3.9c-0.2-0.1-0.1-0.7,0.2-0.4c0,0.3-0.2,0.6-0.2,0.9c0.6,0.6,1.1,1.1,1.7,1.7      c-1.3-0.8-2.6-1.6-3.5-2.8c0.5-0.1,1,0.8,1.4,0.7c-1-0.8-0.7-1.1-1.1-2.1c-0.4-0.3,0.1,0.4-0.3,0.5c-1.3-1.2-2.3-1.9-2.9-3      c0.1-0.1,0.2-0.2,0.2-0.4c-0.1-0.1-0.1-0.1-0.2-0.2c0.6,0.6,0.8,1.1,1.5,1.2c-0.3-0.3,0-0.4-0.4-0.7c-0.2-0.4-0.5,0.2-0.7-0.1      c0.2-0.3,0-0.7,0-1c-0.2,0-0.4,0-0.5-0.3c-0.2-0.1-0.3,0-0.4,0.2c-0.1-0.1-0.1-0.3-0.2-0.4c0,0,0-0.1,0-0.1      c-0.1-0.1-0.2-0.3-0.3-0.4c-0.8-2.1-1.3-4.9-2.4-6.7c0.3-1.2-0.2-3.6-0.5-4.2c0.3-0.5,0.1-2.8-0.1-3.2c-0.5,0.2,0.1,1.3-0.4,1.6      c-0.5-2.2,0.3-4.7,0.1-6.7c0.2,0,0.4,0,0.4-0.1c-0.3-0.3,0.2-0.9,0.1-1.6c0.4-0.9-0.9,1.3-0.9,2.2c-0.1,0.2-0.5,0-0.4,0.5      c0,0.7,0.2,2.1-0.2,3.1c-0.2,0-0.2-0.2-0.4-0.1c-0.1,0.5-0.2,1.1-0.3,1.6c-0.1-0.2-0.2-0.5-0.2-0.6c-0.5-2.5,0-5.4-0.2-7.5      c0.4,0,0.4-0.6,0.7-0.8c-0.1,0.8-0.3,1.8,0.2,2c0.4-3.9,1.2-8.2,3-12.4c1.3-3.1,3.2-6.2,5.5-8.7c0.2,0.3-0.1,1,0,1.3      c2-2.1,3.3-4.6,5.5-6c0.1,0.5-0.9,0.9-0.9,1.3c0.9-0.9,1.2-0.6,2.2-0.9c0.3-0.4-0.4,0-0.5-0.4c0.6-0.4,1-0.9,1.4-1.2      c0,0.1-0.1,0.1-0.1,0.2c1.1-0.3,1.2-0.9,2-1.1c-0.1-0.1-0.3-0.2-0.6-0.1c0.2-0.1,0.5-0.3,0.8-0.4c-0.1,0-0.1,0.1-0.2,0.1      c0.6-0.3,0.1,0.1,0.1,0.3c0.1,0,0.2-0.1,0.2-0.1c-0.6,0.4-1,0.6-1.2,1.3c0.3-0.2,0.4,0,0.8-0.3c0.4-0.2-0.1-0.5,0.2-0.7      c0.3,0.2,0.7,0.1,1,0.1c0-0.2,0.1-0.4,0.3-0.5c0.1-0.2,0-0.3-0.1-0.3c0.1-0.1,0.2-0.1,0.4-0.2c0,0,0.1,0,0.1,0.1      c1.7-0.8,3.6-1.5,5.4-2.1c1.1-0.1,2.5-0.1,3.1-0.8c-0.2,0-0.4,0.1-0.5,0c0.1,0,0.3-0.1,0.4-0.1c0.2,0.2,0.5,0,0.2,0.4      c0.1,0,0.1,0,0.2-0.1c0,0.1,0,0.1,0.1,0.2c0.1,0,0.2-0.1,0.3-0.3c0.1,0,0.2,0,0.3-0.1c0,0-0.1,0.1-0.1,0.1      c0.8-0.2,1.5-0.1,2.6-0.3c0-0.1,0-0.2,0-0.3c0.2,0,0.3-0.1,0.5-0.1c0,0,0,0.1,0,0.1c0.4-0.2,0.8,0.2,0.8,0c0.1,0,0.1,0,0.2,0      c0,0.2-0.1,0.3-0.1,0.4c0.5,0,0.8,0,1-0.3c-0.1-0.1-0.2-0.1-0.3-0.1c0.2,0,0.4-0.1,0.6-0.2c0.3,0.1,0.4,0.2,0.4,0.6      c0.5-0.9,2.1,0.2,2.8,0c0.3,0,0.2-0.4,0.4-0.6c0.1,0,0.2,0,0.3,0c0.5,0.4,1.2,0.8,2.1,0.9c-0.8-0.2,0.1-0.3,0.2-0.4      c-0.2,0-0.2-0.1-0.2-0.2c0.3,0,0.6,0.1,0.9,0.1c0,0.2,0.1,0.3,0.3,0.3c0.2,0,0.2-0.1,0.2-0.3c0.3,0,0.5,0,0.8,0.1      c-0.1,0.4,0.5,0.5,0.7,0.8c-0.8-0.2-1.7-0.5-2,0c3.2,0.7,6.7,1.7,10.1,3.4c0,0,0,0,0,0.1c0,0,0.1,0,0.1,0      c0.6,0.3,1.2,0.6,1.8,0.9c0.4,0.2,0.7,0.4,1.1,0.7c0,0.1,0,0.2,0.2,0.2c0,0,0.1,0,0.1,0c0.4,0.3,0.8,0.5,1.2,0.8      c0.4,0.6,0.8,1.4,1.5,1.2c1.5,2.3,3.1,3.2,4.4,5.6c0.1-0.4,0.4,0.9,0.9,1c-0.8-0.1,0.5,0.5-0.3,0.4c0.7,0.7,0.9,1,1,1.8      c-0.2-0.4-0.3-0.5-0.4-0.1c-0.1,0.6,0.7-0.1,1,0.5c-0.6,0-0.4,0.4-0.3,0.9c0.3-0.3,0.2-0.6,0.5-0.5c0.4,0.4-0.2,0.5-0.1,0.8      c0.3-0.4,0.4-0.2,0.8,0c-0.5,0.1,0.3,0.8-0.3,0.5c0.4,0.5,0.5,0.8,0.3,1.3c-0.4-0.6-0.1-1-0.7-0.9c1.2,1,0.6,3.3,2,3.5      c-0.9,0.2,0,0.6-0.5,0.7c0.6,0.2,0.3,1,1,1.2c-0.1,0.5-0.3,0.8-0.4,1.3c0.3,0.4,0.4,1.2,0.9,1.3c-0.3,0.3-0.1,1.1-0.4,1.4      c0.4-0.2,0.6-0.2,0.9,0.2c-0.5,0.4-0.1,0.8-0.4,0.9c0.9,2.3-0.2,7,0.3,8.8c-0.6-0.3-0.4,0.7-0.8,0.7c0.7,0.3,0.1,0.8,0.4,1.3      c-1.4,0.8,0,3-1.9,3.5c0.2,1.4-0.6,2-1.2,3.5c-0.1-0.1-0.1-0.2-0.2-0.3c-0.1,0.7-0.5,0.8-0.3,1.4l-0.4-0.2      c0,1.1-1.7,1.7-2.1,3.4c-0.1,0.5-1.6,1.8-2,2.5c-0.2,0.3-0.1,0.8-0.3,0.1c-0.1,0.1-0.3,0.1-0.4,0.1c-0.1,0.7-0.7,0.9-0.9,1.8      c-0.2,0.1-0.5-0.2-0.7,0.1c0,0.2,0.2,0.5,0.1,0.7c1.8-0.1,1.8-2.2,3.2-2.9c-0.1,0.3-0.7,0.6-0.3,0.8c0.3,0,1.2-1,0.7-0.9      c0.3,0.2-0.3,0.4-0.4,0.3c0.5-0.4,0.3-0.9,0.7-1c0.3,0.2-0.3,0.7,0.3,0.6c0.4-0.9,0.9-1,1.5-1.5c-0.4,0.4,0.5,0.5,0.1,0.9      c-1.5,0.3-1,2-2.5,2.2c-0.4,0.3-0.1,0.4-0.2,0.7c-0.5-0.3-1.6,1.4-1.2,1.3c-0.5,0.5-0.8,0.3-1.2,0.4c-0.1,0.4,0.4,0.1,0.2,0.4      c-0.7-0.3-1.6,0.7-2.2,1.4l-0.3-0.3c-0.3,0.8-1.1,0.9-2,1.5c1,0.5,2.7-1.6,3.2-1.3c0.1,0,0.9-0.8,1.2-1.1c1.3-1,2.9-1.8,3.5-2.9      c-0.1,0.2-0.7,0.2-0.4-0.1c0.3-0.1,0.6,0.1,0.9,0.1c1.6-2.2,3.6-4,5.1-6.6c0.1-0.1,0.2-0.3,0.3-0.5c-0.2,0.6-0.5,1.1-0.7,1.7      c-1.6,1.1-2.2,4.3-4.1,4.8c0.1,1.1-0.9,1.4-1.4,2.7c-0.3,0.4-0.5-0.3-0.8,0.2c0.3,1.4-2.5,1.3-2.4,2.6c-0.2,0.1-0.5,0.2-0.7,0.4      c0,0-0.1,0-0.1,0c-0.1,0.1-0.1,0.1-0.2,0.2c-0.5,0.3-0.9,0.6-1.3,0.9c-1.4,0.8-3.3,1.4-4.8,2.2c0,0,0-0.1,0-0.1      c-0.4,0.2-0.9,0.1-0.8,0.5c-0.3,0.2-0.6,0.4-0.9,0.6c-0.1,0-0.1,0-0.2,0c0,0-0.1-0.1-0.2-0.1c-0.2,0-0.2,0-0.3,0.1      c-1.3,0.1-3,0.7-3.5,1.1c-0.5-0.3-2.8,0.2-3.2,0.4c0.2,0.3,0.8,0,1.3,0c-0.3,0.1-0.6,0.2-0.7,0.4c-0.1,0-0.1,0-0.2,0      c-0.1-0.3-0.4,0-0.5-0.1c0,0,0.1,0,0.1,0c-0.1-0.4-0.4-0.6-0.9-0.5c0,0.2,0,0.3-0.1,0.5c0.2,0,0.8-0.3,0.8,0      c-0.1,0-0.1,0.1,0,0.1c-0.2,0.2-0.5,0.2-0.7,0.3c-0.4,0-0.9,0-1.3,0c-0.1-0.1-0.2-0.1-0.4-0.2c-0.1,0.1-0.3,0.1-0.4,0.2      c-0.6,0-1.3,0.1-1.8,0.2c0-0.2,0-0.4-0.2-0.4c-0.3,0.4-0.9-0.1-1.6,0.1c-0.7-0.2,0.4,0.3,1.4,0.5C51.9,85,51.8,85.1,51.5,85.2       M37.5,86.6c-1.4-1.3-4.3-1.9-4.8-2.9c-0.8-0.1-2-1.6-3-1.8c0.5,0,0.1-0.3,0-0.5c-0.2,0.2-0.4,0.3-0.6,0.3      c0-0.8-0.8-1.3-1.5-1.8c0.5,0.3,0.9,0.5,1.5,0.6c0-0.2,0-0.4,0.2-0.4c0.7,0.7,1.5,1.4,2.4,2.1c1.2,1.1,7.4,3.9,8.5,4.4      c0,0-0.2,0.4-0.1,0.4c0.5,0.3,0.9-0.3,1,0.4C39.5,87.6,38.9,86.5,37.5,86.6 M83.6,63.4c0,0,0,0.1,0,0.1c0,0,0,0,0,0      C83.5,63.5,83.6,63.4,83.6,63.4 M43.2,17.1c-0.1,0.1-0.2,0.1-0.2,0.1C43,17.1,43.1,17.1,43.2,17.1 M41.3,17.6      C41.3,17.7,41.3,17.7,41.3,17.6C41.3,17.7,41.3,17.7,41.3,17.6C41.3,17.7,41.3,17.6,41.3,17.6 M34.7,19.7      C34.7,19.7,34.7,19.7,34.7,19.7c0.1-0.1,0.1-0.1,0.2-0.1C34.8,19.6,34.7,19.7,34.7,19.7 M50.7,16.4c-0.2,0-0.3,0-0.4-0.1      c0.1,0,0.2,0,0.3,0c0,0,0.1,0,0.1,0C50.7,16.3,50.7,16.3,50.7,16.4 M52.5,16.6c-0.1-0.1-0.4-0.2-0.7-0.2c0-0.1,0.1-0.2,0.1-0.2      c0.1,0,0.2,0,0.3,0c0,0,0.1,0,0.1,0.1c0,0,0,0,0-0.1c0.1,0,0.1,0,0.2,0C52.6,16.4,52.7,16.5,52.5,16.6 M55.8,16.9      c-0.5,0.1-0.8-0.1-1.3-0.4c0.3,0,0.7,0.1,1,0.2C55.6,16.7,55.7,16.8,55.8,16.9 M91.4,31.1c-0.2,0.1-0.3,0.1-0.5-0.3      c-1.6-3.4-4.5-8.3-8.7-12.4c-4.1-4.2-9.6-7.6-14.6-9.4c0.3,0.1,0.7,0.3,0.5,0.5c-4.4-1.7-8.6-2.7-12.6-3.1      C44.7,4.7,33.4,7,24.7,12.6c0.1,0.2,0.1,0.3-0.2,0.5c-3.2,2-7.7,5.5-11.3,10.1c-3.6,4.6-6.4,10.4-7.6,15.6      C5.7,38.5,5.8,38,6,38.2C3.4,48.5,4.1,57.3,7.7,64.9c0.2-0.2-0.5-1.2,0.1-1.1c0.4,1.1,0.9,2.3,1.5,3.4c0.7,1.6,1.5,3.7,2.6,4.2      C9.1,65.9,7.2,59.6,7,54c0.4,0.8,0.3,2.5,0.9,3.2c0.2-3.8-0.7-8.9,0.6-12.5c-0.3,1.9-0.5,4.5-0.3,7.1c0,1.9,0.9,7.2,1.5,7.7      c-0.1-0.1-0.1-0.6,0-0.6c0.3,0.6-0.4,0.9,0.1,1c0-0.2,0.1-0.2,0.2-0.2c1,2.2,2.3,5.6,3.3,7.3c1.2,2.2,2.8,4.2,4.6,6      c0,0.1,0.1,0.1,0.1,0.2c0.2,0.5,0.9,1.1,1.1,1.5c0.1,0.2-0.1,0.5,0,0.7c1.5,2.8,3.7,5.6,6.4,7.8c1.7,2,4.4,4.1,7.7,5.9      c3.2,1.7,6.9,3.1,10.3,3.9c2.4,0.6,5.3,0.7,7.1,1.1c2.4,0.5,6.6-0.2,8.7-0.6c12.6-1.9,25.1-10.5,31.4-22.9      C97.2,58.1,97,42.8,91.4,31.1"/>
          </g></g></g></g>
        </g>
      </g>
    </svg>
  );
}



function BewatuWordmark({ height = 24, color = "#1a4a3a" }) {
  const aspectRatio = 3162.16 / 948.70;
  const width = height * aspectRatio;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 3162 948"
      height={height}
      width={width}
      style={{ flexShrink: 0 }}
    >
      <g transform="scale(8.108108108108109) translate(10, 10)">
        <g transform="matrix(1.0970785445864348,0,0,1.0970785445864348,-4.869122522979331,-6.419242310879041)" fill={color}>
          <g><g><g><g>
            <path d="M51.5,85.2c-0.4-0.5-0.8-0.2-0.8-0.5c-2.4,0.6-6.9-1-8.8-0.8c0.4-0.6-0.6-0.5-0.6-0.9c-0.4,0.6-0.8,0-1.4,0.2      c-0.6-1.5-3-0.4-3.3-2.3c-1.4,0-1.9-0.8-3.3-1.6c0.1-0.1,0.2-0.1,0.3-0.2c-0.7-0.1-0.7-0.5-1.3-0.5l0.2-0.4      c-1.1-0.2-1.5-1.9-3.1-2.5c-0.5-0.1-1.6-1.8-2.2-2.2c-0.3-0.2-0.8-0.2-0.1-0.3c-0.1-0.1-0.1-0.3,0-0.4c-0.7-0.2-0.8-0.8-1.7-1.1      c-0.1-0.3,0.2-0.5,0-0.7c-0.2-0.1-0.5,0.1-0.7,0c-0.1,1.8,1.9,2,2.5,3.5c-0.2-0.2-0.5-0.8-0.7-0.4c-0.1,0.3,0.8,1.4,0.8,0.8      c-0.3,0.2-0.4-0.3-0.2-0.4c0.3,0.5,0.9,0.4,0.9,0.8c-0.3,0.3-0.7-0.3-0.6,0.2c0.9,0.5,0.8,1,1.3,1.7c-0.4-0.5-0.5,0.4-0.9,0      c-0.1-1.5-1.8-1.2-1.8-2.7c-0.2-0.5-0.4-0.1-0.7-0.3c0.4-0.4-1.2-1.8-1.2-1.3c-0.5-0.6-0.2-0.8-0.3-1.2      c-0.4-0.1-0.1,0.4-0.4,0.1c0.4-0.7-0.5-1.6-1.1-2.3l0.4-0.2c-0.7-0.4-0.8-1.2-1.3-2.1c-0.6,0.9,1.2,2.9,0.9,3.3      c0,0.1,0.7,0.9,0.9,1.3c0.8,1.4,1.4,3.1,2.5,3.9c-0.2-0.1-0.1-0.7,0.2-0.4c0,0.3-0.2,0.6-0.2,0.9c0.6,0.6,1.1,1.1,1.7,1.7      c-1.3-0.8-2.6-1.6-3.5-2.8c0.5-0.1,1,0.8,1.4,0.7c-1-0.8-0.7-1.1-1.1-2.1c-0.4-0.3,0.1,0.4-0.3,0.5c-1.3-1.2-2.3-1.9-2.9-3      c0.1-0.1,0.2-0.2,0.2-0.4c-0.1-0.1-0.1-0.1-0.2-0.2c0.6,0.6,0.8,1.1,1.5,1.2c-0.3-0.3,0-0.4-0.4-0.7c-0.2-0.4-0.5,0.2-0.7-0.1      c0.2-0.3,0-0.7,0-1c-0.2,0-0.4,0-0.5-0.3c-0.2-0.1-0.3,0-0.4,0.2c-0.1-0.1-0.1-0.3-0.2-0.4c0,0,0-0.1,0-0.1      c-0.1-0.1-0.2-0.3-0.3-0.4c-0.8-2.1-1.3-4.9-2.4-6.7c0.3-1.2-0.2-3.6-0.5-4.2c0.3-0.5,0.1-2.8-0.1-3.2c-0.5,0.2,0.1,1.3-0.4,1.6      c-0.5-2.2,0.3-4.7,0.1-6.7c0.2,0,0.4,0,0.4-0.1c-0.3-0.3,0.2-0.9,0.1-1.6c0.4-0.9-0.9,1.3-0.9,2.2c-0.1,0.2-0.5,0-0.4,0.5      c0,0.7,0.2,2.1-0.2,3.1c-0.2,0-0.2-0.2-0.4-0.1c-0.1,0.5-0.2,1.1-0.3,1.6c-0.1-0.2-0.2-0.5-0.2-0.6c-0.5-2.5,0-5.4-0.2-7.5      c0.4,0,0.4-0.6,0.7-0.8c-0.1,0.8-0.3,1.8,0.2,2c0.4-3.9,1.2-8.2,3-12.4c1.3-3.1,3.2-6.2,5.5-8.7c0.2,0.3-0.1,1,0,1.3      c2-2.1,3.3-4.6,5.5-6c0.1,0.5-0.9,0.9-0.9,1.3c0.9-0.9,1.2-0.6,2.2-0.9c0.3-0.4-0.4,0-0.5-0.4c0.6-0.4,1-0.9,1.4-1.2      c0,0.1-0.1,0.1-0.1,0.2c1.1-0.3,1.2-0.9,2-1.1c-0.1-0.1-0.3-0.2-0.6-0.1c0.2-0.1,0.5-0.3,0.8-0.4c-0.1,0-0.1,0.1-0.2,0.1      c0.6-0.3,0.1,0.1,0.1,0.3c0.1,0,0.2-0.1,0.2-0.1c-0.6,0.4-1,0.6-1.2,1.3c0.3-0.2,0.4,0,0.8-0.3c0.4-0.2-0.1-0.5,0.2-0.7      c0.3,0.2,0.7,0.1,1,0.1c0-0.2,0.1-0.4,0.3-0.5c0.1-0.2,0-0.3-0.1-0.3c0.1-0.1,0.2-0.1,0.4-0.2c0,0,0.1,0,0.1,0.1      c1.7-0.8,3.6-1.5,5.4-2.1c1.1-0.1,2.5-0.1,3.1-0.8c-0.2,0-0.4,0.1-0.5,0c0.1,0,0.3-0.1,0.4-0.1c0.2,0.2,0.5,0,0.2,0.4      c0.1,0,0.1,0,0.2-0.1c0,0.1,0,0.1,0.1,0.2c0.1,0,0.2-0.1,0.3-0.3c0.1,0,0.2,0,0.3-0.1c0,0-0.1,0.1-0.1,0.1      c0.8-0.2,1.5-0.1,2.6-0.3c0-0.1,0-0.2,0-0.3c0.2,0,0.3-0.1,0.5-0.1c0,0,0,0.1,0,0.1c0.4-0.2,0.8,0.2,0.8,0c0.1,0,0.1,0,0.2,0      c0,0.2-0.1,0.3-0.1,0.4c0.5,0,0.8,0,1-0.3c-0.1-0.1-0.2-0.1-0.3-0.1c0.2,0,0.4-0.1,0.6-0.2c0.3,0.1,0.4,0.2,0.4,0.6      c0.5-0.9,2.1,0.2,2.8,0c0.3,0,0.2-0.4,0.4-0.6c0.1,0,0.2,0,0.3,0c0.5,0.4,1.2,0.8,2.1,0.9c-0.8-0.2,0.1-0.3,0.2-0.4      c-0.2,0-0.2-0.1-0.2-0.2c0.3,0,0.6,0.1,0.9,0.1c0,0.2,0.1,0.3,0.3,0.3c0.2,0,0.2-0.1,0.2-0.3c0.3,0,0.5,0,0.8,0.1      c-0.1,0.4,0.5,0.5,0.7,0.8c-0.8-0.2-1.7-0.5-2,0c3.2,0.7,6.7,1.7,10.1,3.4c0,0,0,0,0,0.1c0,0,0.1,0,0.1,0      c0.6,0.3,1.2,0.6,1.8,0.9c0.4,0.2,0.7,0.4,1.1,0.7c0,0.1,0,0.2,0.2,0.2c0,0,0.1,0,0.1,0c0.4,0.3,0.8,0.5,1.2,0.8      c0.4,0.6,0.8,1.4,1.5,1.2c1.5,2.3,3.1,3.2,4.4,5.6c0.1-0.4,0.4,0.9,0.9,1c-0.8-0.1,0.5,0.5-0.3,0.4c0.7,0.7,0.9,1,1,1.8      c-0.2-0.4-0.3-0.5-0.4-0.1c-0.1,0.6,0.7-0.1,1,0.5c-0.6,0-0.4,0.4-0.3,0.9c0.3-0.3,0.2-0.6,0.5-0.5c0.4,0.4-0.2,0.5-0.1,0.8      c0.3-0.4,0.4-0.2,0.8,0c-0.5,0.1,0.3,0.8-0.3,0.5c0.4,0.5,0.5,0.8,0.3,1.3c-0.4-0.6-0.1-1-0.7-0.9c1.2,1,0.6,3.3,2,3.5      c-0.9,0.2,0,0.6-0.5,0.7c0.6,0.2,0.3,1,1,1.2c-0.1,0.5-0.3,0.8-0.4,1.3c0.3,0.4,0.4,1.2,0.9,1.3c-0.3,0.3-0.1,1.1-0.4,1.4      c0.4-0.2,0.6-0.2,0.9,0.2c-0.5,0.4-0.1,0.8-0.4,0.9c0.9,2.3-0.2,7,0.3,8.8c-0.6-0.3-0.4,0.7-0.8,0.7c0.7,0.3,0.1,0.8,0.4,1.3      c-1.4,0.8,0,3-1.9,3.5c0.2,1.4-0.6,2-1.2,3.5c-0.1-0.1-0.1-0.2-0.2-0.3c-0.1,0.7-0.5,0.8-0.3,1.4l-0.4-0.2      c0,1.1-1.7,1.7-2.1,3.4c-0.1,0.5-1.6,1.8-2,2.5c-0.2,0.3-0.1,0.8-0.3,0.1c-0.1,0.1-0.3,0.1-0.4,0.1c-0.1,0.7-0.7,0.9-0.9,1.8      c-0.2,0.1-0.5-0.2-0.7,0.1c0,0.2,0.2,0.5,0.1,0.7c1.8-0.1,1.8-2.2,3.2-2.9c-0.1,0.3-0.7,0.6-0.3,0.8c0.3,0,1.2-1,0.7-0.9      c0.3,0.2-0.3,0.4-0.4,0.3c0.5-0.4,0.3-0.9,0.7-1c0.3,0.2-0.3,0.7,0.3,0.6c0.4-0.9,0.9-1,1.5-1.5c-0.4,0.4,0.5,0.5,0.1,0.9      c-1.5,0.3-1,2-2.5,2.2c-0.4,0.3-0.1,0.4-0.2,0.7c-0.5-0.3-1.6,1.4-1.2,1.3c-0.5,0.5-0.8,0.3-1.2,0.4c-0.1,0.4,0.4,0.1,0.2,0.4      c-0.7-0.3-1.6,0.7-2.2,1.4l-0.3-0.3c-0.3,0.8-1.1,0.9-2,1.5c1,0.5,2.7-1.6,3.2-1.3c0.1,0,0.9-0.8,1.2-1.1c1.3-1,2.9-1.8,3.5-2.9      c-0.1,0.2-0.7,0.2-0.4-0.1c0.3-0.1,0.6,0.1,0.9,0.1c1.6-2.2,3.6-4,5.1-6.6c0.1-0.1,0.2-0.3,0.3-0.5c-0.2,0.6-0.5,1.1-0.7,1.7      c-1.6,1.1-2.2,4.3-4.1,4.8c0.1,1.1-0.9,1.4-1.4,2.7c-0.3,0.4-0.5-0.3-0.8,0.2c0.3,1.4-2.5,1.3-2.4,2.6c-0.2,0.1-0.5,0.2-0.7,0.4      c0,0-0.1,0-0.1,0c-0.1,0.1-0.1,0.1-0.2,0.2c-0.5,0.3-0.9,0.6-1.3,0.9c-1.4,0.8-3.3,1.4-4.8,2.2c0,0,0-0.1,0-0.1      c-0.4,0.2-0.9,0.1-0.8,0.5c-0.3,0.2-0.6,0.4-0.9,0.6c-0.1,0-0.1,0-0.2,0c0,0-0.1-0.1-0.2-0.1c-0.2,0-0.2,0-0.3,0.1      c-1.3,0.1-3,0.7-3.5,1.1c-0.5-0.3-2.8,0.2-3.2,0.4c0.2,0.3,0.8,0,1.3,0c-0.3,0.1-0.6,0.2-0.7,0.4c-0.1,0-0.1,0-0.2,0      c-0.1-0.3-0.4,0-0.5-0.1c0,0,0.1,0,0.1,0c-0.1-0.4-0.4-0.6-0.9-0.5c0,0.2,0,0.3-0.1,0.5c0.2,0,0.8-0.3,0.8,0      c-0.1,0-0.1,0.1,0,0.1c-0.2,0.2-0.5,0.2-0.7,0.3c-0.4,0-0.9,0-1.3,0c-0.1-0.1-0.2-0.1-0.4-0.2c-0.1,0.1-0.3,0.1-0.4,0.2      c-0.6,0-1.3,0.1-1.8,0.2c0-0.2,0-0.4-0.2-0.4c-0.3,0.4-0.9-0.1-1.6,0.1c-0.7-0.2,0.4,0.3,1.4,0.5C51.9,85,51.8,85.1,51.5,85.2       M37.5,86.6c-1.4-1.3-4.3-1.9-4.8-2.9c-0.8-0.1-2-1.6-3-1.8c0.5,0,0.1-0.3,0-0.5c-0.2,0.2-0.4,0.3-0.6,0.3      c0-0.8-0.8-1.3-1.5-1.8c0.5,0.3,0.9,0.5,1.5,0.6c0-0.2,0-0.4,0.2-0.4c0.7,0.7,1.5,1.4,2.4,2.1c1.2,1.1,7.4,3.9,8.5,4.4      c0,0-0.2,0.4-0.1,0.4c0.5,0.3,0.9-0.3,1,0.4C39.5,87.6,38.9,86.5,37.5,86.6 M83.6,63.4c0,0,0,0.1,0,0.1c0,0,0,0,0,0      C83.5,63.5,83.6,63.4,83.6,63.4 M43.2,17.1c-0.1,0.1-0.2,0.1-0.2,0.1C43,17.1,43.1,17.1,43.2,17.1 M41.3,17.6      C41.3,17.7,41.3,17.7,41.3,17.6C41.3,17.7,41.3,17.7,41.3,17.6C41.3,17.7,41.3,17.6,41.3,17.6 M34.7,19.7      C34.7,19.7,34.7,19.7,34.7,19.7c0.1-0.1,0.1-0.1,0.2-0.1C34.8,19.6,34.7,19.7,34.7,19.7 M50.7,16.4c-0.2,0-0.3,0-0.4-0.1      c0.1,0,0.2,0,0.3,0c0,0,0.1,0,0.1,0C50.7,16.3,50.7,16.3,50.7,16.4 M52.5,16.6c-0.1-0.1-0.4-0.2-0.7-0.2c0-0.1,0.1-0.2,0.1-0.2      c0.1,0,0.2,0,0.3,0c0,0,0.1,0,0.1,0.1c0,0,0,0,0-0.1c0.1,0,0.1,0,0.2,0C52.6,16.4,52.7,16.5,52.5,16.6 M55.8,16.9      c-0.5,0.1-0.8-0.1-1.3-0.4c0.3,0,0.7,0.1,1,0.2C55.6,16.7,55.7,16.8,55.8,16.9 M91.4,31.1c-0.2,0.1-0.3,0.1-0.5-0.3      c-1.6-3.4-4.5-8.3-8.7-12.4c-4.1-4.2-9.6-7.6-14.6-9.4c0.3,0.1,0.7,0.3,0.5,0.5c-4.4-1.7-8.6-2.7-12.6-3.1      C44.7,4.7,33.4,7,24.7,12.6c0.1,0.2,0.1,0.3-0.2,0.5c-3.2,2-7.7,5.5-11.3,10.1c-3.6,4.6-6.4,10.4-7.6,15.6      C5.7,38.5,5.8,38,6,38.2C3.4,48.5,4.1,57.3,7.7,64.9c0.2-0.2-0.5-1.2,0.1-1.1c0.4,1.1,0.9,2.3,1.5,3.4c0.7,1.6,1.5,3.7,2.6,4.2      C9.1,65.9,7.2,59.6,7,54c0.4,0.8,0.3,2.5,0.9,3.2c0.2-3.8-0.7-8.9,0.6-12.5c-0.3,1.9-0.5,4.5-0.3,7.1c0,1.9,0.9,7.2,1.5,7.7      c-0.1-0.1-0.1-0.6,0-0.6c0.3,0.6-0.4,0.9,0.1,1c0-0.2,0.1-0.2,0.2-0.2c1,2.2,2.3,5.6,3.3,7.3c1.2,2.2,2.8,4.2,4.6,6      c0,0.1,0.1,0.1,0.1,0.2c0.2,0.5,0.9,1.1,1.1,1.5c0.1,0.2-0.1,0.5,0,0.7c1.5,2.8,3.7,5.6,6.4,7.8c1.7,2,4.4,4.1,7.7,5.9      c3.2,1.7,6.9,3.1,10.3,3.9c2.4,0.6,5.3,0.7,7.1,1.1c2.4,0.5,6.6-0.2,8.7-0.6c12.6-1.9,25.1-10.5,31.4-22.9      C97.2,58.1,97,42.8,91.4,31.1"/>
          </g></g></g></g>
        </g>
        <g transform="matrix(3.719131565527618,0,0,3.719131565527618,112.78488455006601,0.28027818350477673)" fill={color}>
          <path d="M6.38 18.8 q1.7 0 2.6 -0.73 t0.9 -1.99 q0 -1.36 -0.93 -2.14 t-2.43 -0.78 l-3.26 0 l0 5.64 l3.12 0 z M6.08 11.96 q1.44 0 2.31 -0.62 t0.87 -1.76 q0 -2.48 -3 -2.54 l-3 0 l0 4.92 l2.82 0 z M6.12 5.84 q2.22 0 3.33 0.9 t1.13 2.84 q0 1.12 -0.66 1.91 t-1.88 1.03 l0 0.04 q1.38 0.08 2.26 1.04 t0.9 2.44 q0 1.88 -1.25 2.91 t-3.45 1.05 l-4.56 0 l0 -14.16 l4.18 0 z M21.439999999999998 14.6 q0 -1.26 -0.94 -2.13 t-2.28 -0.87 q-1.3 0 -2.24 0.87 t-1.1 2.13 l6.56 0 z M18.3 10.52 q1.92 0 3.12 1.24 t1.22 3.2 l0 0.72 l-7.76 0 q0.08 1.56 1.03 2.51 t2.47 0.97 q0.94 0 1.79 -0.45 t1.31 -1.19 l0.88 0.74 q-1.3 1.98 -4 1.98 q-2.12 -0.02 -3.39 -1.38 t-1.29 -3.5 q0 -2.08 1.31 -3.45 t3.31 -1.39 z M25.18 5.84 l3.52 12.54 l0.04 0 l3.58 -12.54 l1.68 0 l3.58 12.54 l0.04 0 l3.52 -12.54 l1.36 0 l-4.12 14.14 l-0.02 0.02 l-1.6 0 l-3.58 -12.6 l-0.04 0 l-3.58 12.6 l-1.62 0 l-4.12 -14.16 l1.36 0 z M44.98 17.44 q0 0.76 0.61 1.24 t1.51 0.48 q1.62 0 2.41 -0.85 t0.79 -2.31 l0 -0.64 l-1.44 0 q-1.84 0 -2.86 0.56 t-1.02 1.52 z M47.699999999999996 10.52 q1.86 0 2.76 0.86 t0.92 2.4 l0 2.74 q0 2.24 0.18 3.48 l-1.12 0 q-0.12 -0.62 -0.12 -1.5 l-0.04 0 q-1 1.74 -3.22 1.74 q-1.5 0 -2.38 -0.74 t-0.9 -2 q0 -1.54 1.33 -2.32 t3.71 -0.78 l1.48 0 l0 -0.54 q0 -1.14 -0.7 -1.7 t-1.9 -0.56 q-1.6 0 -2.82 1.04 l-0.7 -0.82 q0.66 -0.64 1.63 -0.97 t1.89 -0.33 z M55.26 8.1 l1.2 0 l0 2.66 l2.64 0 l0 1.08 l-2.64 0 l0 6.04 q0 0.58 0.34 0.93 t0.94 0.35 q0.66 0 1.36 -0.32 l0.1 1.08 q-0.9 0.32 -1.58 0.32 q-1.18 0 -1.77 -0.66 t-0.59 -1.7 l0 -6.04 l-2 0 l0 -1.08 l2 0 l0 -2.66 z M64.66 20.24 q-1.76 0 -2.64 -0.99 t-0.88 -3.03 l0 -5.46 l1.2 0 l0 5.4 q0 1.5 0.57 2.25 t1.75 0.75 q1.46 0 2.32 -1 t0.88 -2.82 l0 -4.58 l1.2 0 l0 6.74 q0.04 1.02 0.1 2.5 l-1.2 0 q-0.02 -1.14 -0.08 -1.62 l-0.06 0 q-0.4 0.86 -1.27 1.36 t-1.89 0.5 z"/>
        </g>
      </g>
    </svg>
  );
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────

// ─── NAV GROUPS ───────────────────────────────────────────────────────────────
// Each group is shown as a labelled section in the sidebar.
// Items are filtered by PERMISSIONS[id] at render time — no extra config needed.
// Group label is hidden when all items in the group are hidden for the current role.

const NAV_GROUPS = [
  {
    // Every role sees this — it's the landing pad
    label: null, // no section header for the top item
    items: [
      { id:"dashboard", icon:"◈", label:"Dashboard" },
    ],
  },
  {
    label: "MY WORK",
    // Agents see their personal queue + their ticket list only.
    // Managers see all tickets + their queue filtered view.
    items: [
      { id:"myqueue",  icon:"📥", label:"My Queue",    badge:"mine"    },
      { id:"tickets",  icon:"🎫", label:"All Tickets", badge:"tickets" },
    ],
  },
  {
    label: "OPERATIONS",
    // Core ops work — visible to the relevant domain agents and all managers/admin.
    // Each agent only sees the modules their role has permission for.
    items: [
      { id:"users",        icon:"👤", label:"Users"              },
      { id:"fraud",        icon:"🔴", label:"Trust & Fraud",     badge:"fraud"      },
      { id:"moderation",   icon:"🛡",  label:"Moderation",        badge:"moderation" },
      { id:"verification", icon:"✅", label:"Verification",      badge:"verif"      },
      { id:"recruiters",   icon:"🤝", label:"Recruiters",        badge:"recruiters" },
      { id:"finance",      icon:"💳", label:"Finance"            },
      { id:"queues",       icon:"📬", label:"Queue Management"                      },
      { id:"watchlists",   icon:"👁",  label:"Watchlists",         badge:null            },
      { id:"appeals",      icon:"⚖",  label:"Appeals",           badge:"appeals"    },
      { id:"sla",          icon:"⏱",  label:"SLA Config"                            },
      { id:"policies",     icon:"📋", label:"Policy Admin"                          },
      { id:"security",     icon:"🔐", label:"Security",          badge:null             },
      { id:"kb",           icon:"📚", label:"Knowledge Base"                        },
      { id:"reports",      icon:"📊",  label:"Reports"                               },
    ],
  },
  {
    label: "SENSITIVE",
    // Credential changes are legal/support-manager gated.
    // Audit log visible to managers + admin + auditor — agents never see it.
    items: [
      { id:"credentials",  icon:"🔑", label:"Cred. Changes",   badge:"creds"     },
      { id:"data_requests", icon:"📦", label:"Data Requests",   badge:"dataReqs"  },
      { id:"audit",         icon:"📋", label:"Audit Log"                           },
    ],
  },
  {
    label: "ADMIN",
    // Team management: managers see their team, admin sees all.
    // This whole group collapses for pure agents — they have no items here.
    items: [
      { id:"team", icon:"👥", label:"Team" },
    ],
  },
];

// Badge value resolver
function getBadge(badgeKey, badges) {
  return (
    badgeKey === "tickets"    ? badges.openTickets      :
    badgeKey === "mine"       ? badges.myTickets        :
    badgeKey === "verif"      ? badges.pendingVerif     :
    badgeKey === "fraud"      ? badges.openFraud        :
    badgeKey === "moderation" ? badges.pendingReports   :
    badgeKey === "recruiters" ? badges.pendingRecruiters :
    badgeKey === "creds"      ? badges.pendingCreds      :
    badgeKey === "appeals"    ? badges.pendingAppeals    : 0
  );
}

function Sidebar({ active, onNav, staff, badges, onSignOut }) {
  const role      = staff.role;
  const roleInfo  = ROLES[role] || {};
  const tierLabel = roleInfo.tier === "admin" ? "Admin" : roleInfo.tier === "manager" ? "Manager" : "Agent";
  const tierColor = roleInfo.tier === "admin" ? "#f59e0b" : roleInfo.tier === "manager" ? "#3b82f6" : "#64748b";

  return (
    <div style={{ width:226, flexShrink:0, background:"#1a4a3a", borderRight:"none", display:"flex", flexDirection:"column", height:"100vh", position:"sticky", top:0 }}>

      {/* Logo */}
      <div style={{ padding:"14px 16px 12px", borderBottom:"1px solid rgba(255,255,255,0.12)" }}>
        <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
          <BewatuWordmark height={18} color="#ffffff" />
          <p style={{ color:"rgba(255,255,255,0.55)", fontSize:9, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.18em", margin:0, paddingLeft:1 }}>
            OPERATIONS
          </p>
        </div>
      </div>

      {/* Identity card */}
      <div style={{ padding:"10px 14px 11px", borderBottom:"1px solid rgba(255,255,255,0.12)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
          {/* Avatar */}
          <div style={{ width:26, height:26, borderRadius:6, background:"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.25)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:"#ffffff", flexShrink:0 }}>
            {staff.name?.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()}
          </div>
          <div style={{ minWidth:0 }}>
            <p style={{ color:"#ffffff", fontSize:12, fontWeight:600, margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{staff.name}</p>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:5 }}>
          <span style={{ background:"rgba(255,255,255,0.15)", color:"#ffffff", fontSize:9, fontWeight:600, borderRadius:3, padding:"2px 6px", letterSpacing:"0.04em" }}>
            {roleInfo.label||role}
          </span>
          <span style={{ background:"rgba(255,255,255,0.10)", color:"rgba(255,255,255,0.7)", fontSize:9, fontWeight:600, borderRadius:3, padding:"2px 6px" }}>
            {tierLabel}
          </span>
        </div>
        {roleInfo.queue && (
          <p style={{ color:"rgba(255,255,255,0.45)", fontSize:9, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.06em", margin:"5px 0 0" }}>
            {roleInfo.queue} Queue
          </p>
        )}
      </div>

      {/* Nav groups */}
      <nav style={{ flex:1, padding:"6px 6px 6px", overflowY:"auto" }}>
        {NAV_GROUPS.map((group, gi) => {
          // Filter to items this role can see
          const visible = group.items.filter(item => PERMISSIONS[item.id]?.includes(role));
          if (visible.length === 0) return null;
          return (
            <div key={gi} style={{ marginBottom:4 }}>
              {/* Group label */}
              {group.label && (
                <p style={{ color:"rgba(255,255,255,0.55)", fontSize:9, fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", margin:"10px 4px 4px", userSelect:"none" }}>
                  {group.label}
                </p>
              )}
              {visible.map(item => {
                const isActive = active === item.id;
                const badge    = item.badge ? getBadge(item.badge, badges) : 0;
                return (
                  <button key={item.id} onClick={() => onNav(item.id)}
                    style={{
                      display:"flex", alignItems:"center", gap:8, width:"100%",
                      padding:"7px 9px", borderRadius:6, border:"none",
                      cursor:"pointer", marginBottom:1, textAlign:"left",
                      background: isActive ? "rgba(255,255,255,0.18)" : "transparent",
                      color:      isActive ? "#ffffff" : "rgba(255,255,255,0.88)",
                      fontSize:12, fontWeight: isActive ? 600 : 400,
                      fontFamily:"inherit", transition:"background 0.1s, color 0.1s",
                      borderLeft: isActive ? "2px solid rgba(255,255,255,0.6)" : "2px solid transparent",
                      paddingLeft: isActive ? "7px" : "7px",
                    }}
                    onMouseEnter={e => { if(!isActive){ e.currentTarget.style.background="rgba(255,255,255,0.08)"; e.currentTarget.style.color="#ffffff"; }}}
                    onMouseLeave={e => { if(!isActive){ e.currentTarget.style.background="transparent"; e.currentTarget.style.color="rgba(255,255,255,0.88)"; }}}
                  >
                    <span style={{ fontSize:13, opacity: isActive ? 1 : 0.80, flexShrink:0 }}>{item.icon}</span>
                    <span style={{ flex:1 }}>{item.label}</span>
                    {badge > 0 && (
                      <span style={{ background:"rgba(239,68,68,0.25)", color:"#fca5a5", borderRadius:8, padding:"1px 5px", fontSize:9, fontWeight:700, flexShrink:0 }}>
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding:"8px 10px", borderTop:"1px solid rgba(255,255,255,0.12)" }}>
        <button onClick={onSignOut}
          style={{ width:"100%", background:"none", border:"none", color:"rgba(255,255,255,0.70)", fontSize:11, cursor:"pointer", fontFamily:"inherit", padding:"5px 4px", textAlign:"left", borderRadius:4, display:"flex", alignItems:"center", gap:6 }}
          onMouseEnter={e => e.currentTarget.style.color="#64748b"}
          onMouseLeave={e => e.currentTarget.style.color="#e7e5e4"}>
          ⎋ Sign out
        </button>
        <p style={{ color:"rgba(255,255,255,0.30)", fontSize:9, margin:"5px 4px 0", fontWeight:600, letterSpacing:"0.04em" }}>ALL ACTIONS LOGGED · UNAUTHORISED ACCESS PROHIBITED</p>
      </div>
    </div>
  );
}


// ─── WATCHLISTS MODULE ────────────────────────────────────────────────────────

const INVESTIGATION_STATUSES = [
  { id:"under_review",        label:"Under Review",          color:"#f97316" },
  { id:"investigating",       label:"Investigating",          color:"#dc2626" },
  { id:"pending_evidence",    label:"Pending Evidence",       color:"#f59e0b" },
  { id:"confirmed_fraud",     label:"⚑ Confirmed Fraud",     color:"#b91c1c" },
  { id:"confirmed_abuse",     label:"⚑ Confirmed Abuse",     color:"#9f1239" },
  { id:"identity_fraud",      label:"Identity Fraud",         color:"#831843" },
  { id:"aml_confirmed",       label:"AML Confirmed",          color:"#4c1d95" },
  { id:"policy_violation",    label:"Policy Violation",       color:"#7c2d12" },
  { id:"cleared",             label:"✓ Cleared",              color:"#059669" },
  { id:"cleared_with_warning",label:"✓ Cleared w/ Warning",  color:"#0891b2" },
  { id:"referred_externally", label:"Referred Externally",    color:"#374151" },
];

function WatchlistsModule({ staff }) {
  const [activeList, setActiveList] = useState("all");
  const [entries,    setEntries]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [selected,   setSelected]   = useState(null);
  const [updating,   setUpdating]   = useState(false);
  const [newStatus,  setNewStatus]  = useState("");
  const [notes,      setNotes]      = useState("");
  const [toast,      setToast]      = useState(null);
  const isAdmin   = isTierAdmin(staff.role);
  const isManager = isTierManager(staff.role);
  const canAct    = isAdmin || isManager || staff.role === "investigator";

  // Subscribe to all watchlist collections combined, or specific one
  useEffect(() => {
    setLoading(true);
    const lists = activeList === "all"
      ? WATCHLIST_CATEGORIES.map(c => c.list)
      : [activeList];

    // Flatten by subscribing to each list in parallel
    let allDocs = {};
    let unsubs  = [];
    let resolved = 0;

    lists.forEach(listName => {
      const q = query(
        collection(db, listName),
        orderBy("addedAt", "desc"),
        limit(50)
      );
      const unsub = onSnapshot(q, snap => {
        snap.docs.forEach(d => {
          allDocs[d.id] = { _listId: d.id, _listName: listName, ...d.data() };
        });
        snap.docChanges().forEach(change => {
          if (change.type === "removed") delete allDocs[change.doc.id];
        });
        setEntries(Object.values(allDocs).sort((a,b) => {
          const ta = a.addedAt?.toDate?.()?.getTime?.() || 0;
          const tb = b.addedAt?.toDate?.()?.getTime?.() || 0;
          return tb - ta;
        }));
        setLoading(false);
      }, (err) => {
        // Permission denied = rules not yet deployed; show empty state silently
        if (err?.code === "permission-denied") { setLoading(false); return; }
        console.error("Watchlist subscription error:", err);
        setLoading(false);
      });
      unsubs.push(unsub);
    });

    return () => unsubs.forEach(u => u());
  }, [activeList]);

  const handleDetermination = async () => {
    if (!newStatus || !selected) return;
    setUpdating(true);
    try {
      const isFraud = FRAUD_DETERMINATION_STATUSES.includes(newStatus);
      // Update the watchlist entry
      await updateDoc(doc(db, selected._listName, selected._listId), {
        status: newStatus,
        resolution: notes || null,
        resolvedBy: staff.uid,
        resolvedByName: staff.name,
        resolvedAt: serverTimestamp(),
      });
      // Update the user document
      if (selected.userId) {
        await updateDoc(doc(db, "users", selected.userId), {
          investigationStatus: newStatus,
          investigationResolution: notes || null,
        });
      }
      // If confirmed fraud/abuse — add to fraud_list and update user
      if (isFraud && selected.userId) {
        await setDoc(doc(db, "fraud_list", selected.userId), {
          userId: selected.userId,
          userName: selected.userName || "",
          userEmail: selected.userEmail || "",
          determination: newStatus,
          originalCategory: selected.category,
          notes: notes || "",
          addedBy: staff.uid,
          addedByName: staff.name,
          addedAt: serverTimestamp(),
          source: "watchlist_investigation",
        });
        await updateDoc(doc(db, "users", selected.userId), {
          isFraudConfirmed: true,
          fraudDetermination: newStatus,
          fraudDeterminedAt: serverTimestamp(),
          fraudDeterminedBy: staff.name,
        });
      }
      // Write audit entry
      await addDoc(collection(db, "audit_log"), {
        action: "investigation.determination", actorUid: staff.uid,
        actorEmail: staff.email, actorRole: staff.role,
        targetId: selected.userId, targetType: "user",
        after: { status: newStatus, notes, addedToFraudList: isFraud },
        reason: `Investigation determination: ${newStatus}`,
        ts: serverTimestamp(),
      });
      showT(`Determination recorded${isFraud ? " · User added to fraud list" : ""}`, isFraud?"warning":"success");
      setSelected(null); setNewStatus(""); setNotes("");
    } catch(e) { showT(e.message, "error"); }
    finally { setUpdating(false); }
  };

  const showT = (msg, type="success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const cats = [{ id:"all", label:"All watchlists", icon:"👁", color:"#1a4a3a" }, ...WATCHLIST_CATEGORIES];

  return (
    <div style={{ display:"flex", height:"100%" }}>
      {/* Sidebar */}
      <div style={{ width:220, flexShrink:0, borderRight:`1px solid ${C.border}`, padding:"16px 8px", overflowY:"auto" }}>
        <p style={{ color:C.textMuted, fontSize:11, fontWeight:700, textTransform:"uppercase",
          letterSpacing:"0.08em", margin:"0 8px 10px" }}>Watchlists</p>
        {cats.map(cat => {
          const count = cat.id === "all" ? entries.length
            : entries.filter(e => e.category === cat.id).length;
          return (
            <button key={cat.id} onClick={() => setActiveList(cat.id === "all" ? "all" : cat.list || "all")}
              style={{ display:"flex", alignItems:"center", gap:8, width:"100%", padding:"8px 10px",
                borderRadius:7, border:"none", cursor:"pointer", fontFamily:"inherit", textAlign:"left",
                background: (activeList === "all" && cat.id === "all") || activeList === cat.list
                  ? `${cat.color}15` : "transparent",
                borderLeft: (activeList === "all" && cat.id === "all") || activeList === cat.list
                  ? `3px solid ${cat.color}` : "3px solid transparent",
                marginBottom:2 }}>
              <span style={{ fontSize:13 }}>{cat.icon}</span>
              <span style={{ flex:1, color:C.text, fontSize:12, fontWeight:500 }}>{cat.label}</span>
              {count > 0 && (
                <span style={{ background:`${cat.color}20`, color:cat.color, fontSize:10,
                  fontWeight:700, borderRadius:8, padding:"0 5px" }}>{count}</span>
              )}
            </button>
          );
        })}

        <div style={{ margin:"16px 8px 8px", padding:"10px 0", borderTop:`1px solid ${C.border}` }}>
          <p style={{ color:C.textMuted, fontSize:11, fontWeight:700, textTransform:"uppercase",
            letterSpacing:"0.08em", margin:"0 0 8px" }}>Fraud Registry</p>
          <button onClick={() => setActiveList("fraud_list")}
            style={{ display:"flex", alignItems:"center", gap:8, width:"100%", padding:"8px 10px",
              borderRadius:7, border:"none", cursor:"pointer", fontFamily:"inherit", textAlign:"left",
              background: activeList === "fraud_list" ? "#ef444415" : "transparent",
              borderLeft: activeList === "fraud_list" ? "3px solid #ef4444" : "3px solid transparent" }}>
            <span style={{ fontSize:13 }}>🚫</span>
            <span style={{ flex:1, color:C.text, fontSize:12, fontWeight:500 }}>Fraud List</span>
          </button>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex:1, overflowY:"auto", padding:24 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div>
            <h2 style={{ color:C.text, fontSize:18, fontWeight:700, margin:"0 0 3px" }}>
              {cats.find(c => (c.id==="all"&&activeList==="all")||c.list===activeList)?.label || "Watchlists"}
            </h2>
            <p style={{ color:C.textMuted, fontSize:12, margin:0 }}>{entries.length} entries</p>
          </div>
        </div>

        {loading ? <p style={{ color:C.textMuted }}>Loading…</p> : entries.length === 0 ? (
          <div style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:10,
            padding:40, textAlign:"center" }}>
            <p style={{ color:C.textDim, fontSize:13, margin:0 }}>No entries in this list.</p>
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {entries.map(entry => {
              const cat = WATCHLIST_CATEGORIES.find(c => c.id === entry.category);
              const status = INVESTIGATION_STATUSES.find(s => s.id === entry.status);
              const isFraudEntry = entry._listName === "fraud_list";
              return (
                <div key={entry._listId}
                  onClick={() => canAct && setSelected(entry)}
                  style={{ background:C.surface, border:`1px solid ${C.border}`,
                    borderLeft:`3px solid ${isFraudEntry?"#ef4444":cat?.color||"#64748b"}`,
                    borderRadius:8, padding:"12px 16px", cursor:canAct?"pointer":"default" }}
                  onMouseEnter={e => canAct && (e.currentTarget.style.boxShadow="0 2px 8px rgba(28,25,23,0.08)")}
                  onMouseLeave={e => e.currentTarget.style.boxShadow="none"}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                        {isFraudEntry && (
                          <span style={{ background:"#fef2f2", border:"1px solid #fecaca",
                            borderRadius:3, padding:"1px 6px", fontSize:10, color:"#b91c1c", fontWeight:700 }}>
                            🚫 FRAUD REGISTRY
                          </span>
                        )}
                        {!isFraudEntry && cat && (
                          <span style={{ background:`${cat.color}15`, border:`1px solid ${cat.color}30`,
                            borderRadius:3, padding:"1px 6px", fontSize:10, color:cat.color, fontWeight:700 }}>
                            {cat.icon} {cat.label}
                          </span>
                        )}
                        {status && (
                          <span style={{ background:`${status.color}15`, borderRadius:3,
                            padding:"1px 6px", fontSize:10, color:status.color, fontWeight:700 }}>
                            {status.label}
                          </span>
                        )}
                      </div>
                      <p style={{ color:C.text, fontSize:13, fontWeight:600, margin:"0 0 2px" }}>
                        {entry.userName || entry.userId}
                      </p>
                      <p style={{ color:C.textMuted, fontSize:11, margin:0 }}>
                        {entry.userEmail} · Added by {entry.addedByName} · {
                          entry.addedAt?.toDate ? new Date(entry.addedAt.toDate()).toLocaleDateString() : "—"
                        }
                      </p>
                      {entry.notes && <p style={{ color:C.textDim, fontSize:11, margin:"4px 0 0" }}>{entry.notes}</p>}
                    </div>
                    {canAct && (
                      <span style={{ color:C.textDim, fontSize:11 }}>
                        {isFraudEntry ? "View →" : "Determine →"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Determination panel */}
        {selected && (
          <div style={{ position:"fixed", inset:0, background:"rgba(28,25,23,0.5)", zIndex:200,
            display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}
            onClick={e => { if(e.target===e.currentTarget) setSelected(null); }}>
            <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14,
              padding:28, maxWidth:520, width:"100%", maxHeight:"80vh", overflowY:"auto" }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}>
                <h3 style={{ color:C.text, fontSize:16, fontWeight:700, margin:0 }}>
                  Investigation Determination
                </h3>
                <button onClick={() => setSelected(null)}
                  style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:C.textMuted }}>×</button>
              </div>
              <div style={{ background:C.surface2, borderRadius:8, padding:14, marginBottom:16 }}>
                <p style={{ color:C.text, fontSize:14, fontWeight:600, margin:"0 0 4px" }}>
                  {selected.userName} · {selected.userEmail}
                </p>
                <p style={{ color:C.textMuted, fontSize:12, margin:0 }}>
                  Category: {WATCHLIST_CATEGORIES.find(c=>c.id===selected.category)?.label || selected.category}
                  {selected.notes && ` · Notes: ${selected.notes}`}
                </p>
              </div>
              <p style={{ color:C.textMuted, fontSize:11, fontWeight:600, margin:"0 0 8px" }}>
                Final determination <span style={{ color:"#ef4444" }}>*</span>
              </p>
              <select value={newStatus} onChange={e=>setNewStatus(e.target.value)}
                style={{ width:"100%", background:"#fff", border:"0.5px solid #e7e5e4",
                  borderRadius:6, padding:"8px 10px", fontSize:13, color:C.text,
                  outline:"none", fontFamily:"inherit", marginBottom:12, cursor:"pointer" }}>
                <option value="">Select determination…</option>
                <optgroup label="Active investigation">
                  {["under_review","investigating","pending_evidence"].map(s => {
                    const st = INVESTIGATION_STATUSES.find(i=>i.id===s);
                    return <option key={s} value={s}>{st?.label}</option>;
                  })}
                </optgroup>
                <optgroup label="⚑ Adverse findings (adds to fraud list)">
                  {["confirmed_fraud","identity_fraud","aml_confirmed","confirmed_abuse","policy_violation"].map(s => {
                    const st = INVESTIGATION_STATUSES.find(i=>i.id===s);
                    return <option key={s} value={s}>{st?.label}</option>;
                  })}
                </optgroup>
                <optgroup label="✓ Cleared">
                  {["cleared","cleared_with_warning","referred_externally"].map(s => {
                    const st = INVESTIGATION_STATUSES.find(i=>i.id===s);
                    return <option key={s} value={s}>{st?.label}</option>;
                  })}
                </optgroup>
              </select>
              {FRAUD_DETERMINATION_STATUSES.includes(newStatus) && (
                <div style={{ background:"#fef2f2", border:"1px solid #fecaca",
                  borderRadius:6, padding:"8px 12px", marginBottom:12 }}>
                  <p style={{ color:"#b91c1c", fontSize:12, fontWeight:700, margin:0 }}>
                    ⚑ This determination will add the user to the Fraud Registry and flag their account.
                  </p>
                </div>
              )}
              <p style={{ color:C.textMuted, fontSize:11, fontWeight:600, margin:"0 0 6px" }}>Notes</p>
              <textarea value={notes} onChange={e=>setNotes(e.target.value)}
                placeholder="Summary of findings, evidence reviewed, action taken…"
                rows={3} style={{ width:"100%", background:"#fff", border:"0.5px solid #e7e5e4",
                  borderRadius:6, padding:"8px 10px", fontSize:12, color:C.text,
                  outline:"none", fontFamily:"inherit", resize:"vertical",
                  boxSizing:"border-box", marginBottom:16 }} />
              <div style={{ display:"flex", gap:10 }}>
                <button onClick={handleDetermination}
                  disabled={updating || !newStatus}
                  style={{ background:FRAUD_DETERMINATION_STATUSES.includes(newStatus)?"#b91c1c":"#1a4a3a",
                    border:"none", borderRadius:8, padding:"9px 22px", cursor:!newStatus?"not-allowed":"pointer",
                    color:"#fff", fontSize:13, fontWeight:700, fontFamily:"inherit",
                    opacity:updating||!newStatus?0.5:1 }}>
                  {updating ? "Recording…" : "Record determination →"}
                </button>
                <button onClick={() => setSelected(null)}
                  style={{ background:"none", border:"0.5px solid #e7e5e4", borderRadius:8,
                    padding:"9px 16px", cursor:"pointer", color:C.textMuted,
                    fontSize:13, fontFamily:"inherit" }}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {toast && (
          <div style={{ position:"fixed", bottom:24, right:24,
            background:toast.type==="error"?"#b91c1c":toast.type==="warning"?"#92400e":"#1a4a3a",
            color:"#fff", borderRadius:8, padding:"10px 16px", fontSize:13,
            fontWeight:600, zIndex:9999 }}>
            {toast.msg}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────

function Login({ onLogin }) {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [step,     setStep]     = useState("credentials"); // "credentials" | "reset"
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const staffDoc = await fetchOpsStaff(cred.user.uid);
      if (!staffDoc) {
        await signOut(auth);
        setError("Access denied — your account is not authorised for the ops platform. Contact your platform admin.");
        setLoading(false);
        return;
      }
      if (!staffDoc.isActive) {
        await signOut(auth);
        setError("Your ops account has been deactivated. Contact your platform admin.");
        setLoading(false);
        return;
      }
      await writeAuditEntry({
        action: "staff.login", actorUid: cred.user.uid,
        actorEmail: email, actorRole: staffDoc.role,
        targetId: cred.user.uid, targetType: "staff",
        reason: "Staff login",
      });
      onLogin({ uid: cred.user.uid, email, name: staffDoc.name || email.split("@")[0], role: staffDoc.role });
    } catch (e) {
      const msg = e.code === "auth/invalid-credential" || e.code === "auth/wrong-password"
        ? "Invalid email or password"
        : e.code === "auth/too-many-requests"
        ? "Too many failed attempts — try again later"
        : e.message;
      setError(msg);
      setLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    if (!email.trim()) { setError("Enter your staff email above first."); return; }
    setError("");
    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setResetSent(true);
    } catch (e) {
      const msg = e.code === "auth/user-not-found"
        ? "No account found for that email address."
        : e.code === "auth/invalid-email"
        ? "Invalid email address."
        : e.code === "auth/too-many-requests"
        ? "Too many requests — wait a few minutes and try again."
        : e.message;
      setError(msg);
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div style={{ minHeight:"100vh", background:"#f5f5f4", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ width:"100%", maxWidth:400 }}>
        {/* Logo + title */}
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <BewatuWordmark height={26} color="#1a4a3a" />
          <p style={{ color:"#1a4a3a", fontSize:10, fontWeight:700, letterSpacing:"0.2em", margin:"4px 0 10px", textTransform:"uppercase" }}>OPERATIONS</p>
          <p style={{ color:C.textMuted, fontSize:12, margin:0 }}>Internal staff access only</p>
        </div>

        <div style={{ background:"#ffffff", border:"0.5px solid #e7e5e4", borderRadius:14, padding:32 }}>

          {/* ── Sign in form ── */}
          {step === "credentials" && (
            <form onSubmit={handleSignIn}>
              <Field label="Staff Email" required>
                <Input value={email} onChange={setEmail} placeholder="name@bewatu.com" type="email" style={{ width:"100%", boxSizing:"border-box" }} />
              </Field>
              <Field label="Password" required>
                <Input value={password} onChange={setPassword} placeholder="••••••••" type="password" style={{ width:"100%", boxSizing:"border-box" }} />
              </Field>

              {/* Forgot password link */}
              <div style={{ textAlign:"right", marginTop:-8, marginBottom:16 }}>
                <button type="button" onClick={() => { setStep("reset"); setError(""); setResetSent(false); }}
                  style={{ background:"none", border:"none", color:C.textMuted, fontSize:12, cursor:"pointer", fontFamily:"inherit", padding:0, textDecoration:"underline" }}>
                  Forgot password?
                </button>
              </div>

              {error && (
                <div style={{ background:"#ef444415", border:"1px solid #ef444440", borderRadius:6, padding:"10px 14px", marginBottom:16 }}>
                  <p style={{ color:"#ef4444", fontSize:13, margin:0 }}>{error}</p>
                </div>
              )}
              <button type="submit" disabled={loading || !email || !password}
                style={{ width:"100%", background:loading?"#e7e5e4":C.green, border:"none", borderRadius:8, color:"#fff", padding:11, fontSize:14, fontWeight:700, cursor:loading?"wait":"pointer", fontFamily:"inherit", transition:"background 0.2s", opacity:!email||!password?0.5:1 }}>
                {loading ? "Signing in…" : "Sign In →"}
              </button>
            </form>
          )}

          {/* ── Reset password form ── */}
          {step === "reset" && (
            <div>
              <button onClick={() => { setStep("credentials"); setError(""); setResetSent(false); }}
                style={{ background:"none", border:"none", color:C.textMuted, fontSize:12, cursor:"pointer", fontFamily:"inherit", padding:"0 0 16px", display:"flex", alignItems:"center", gap:4 }}>
                ← Back to sign in
              </button>

              <p style={{ color:C.text, fontWeight:700, fontSize:15, margin:"0 0 6px" }}>Reset your password</p>
              <p style={{ color:C.textMuted, fontSize:13, margin:"0 0 20px", lineHeight:1.5 }}>
                Enter your staff email and we'll send a reset link. Check your spam folder if it doesn't arrive within a minute.
              </p>

              {!resetSent ? (
                <form onSubmit={handleReset}>
                  <Field label="Staff Email" required>
                    <Input value={email} onChange={setEmail} placeholder="name@bewatu.com" type="email" style={{ width:"100%", boxSizing:"border-box" }} />
                  </Field>
                  {error && (
                    <div style={{ background:"#ef444415", border:"1px solid #ef444440", borderRadius:6, padding:"10px 14px", marginBottom:16 }}>
                      <p style={{ color:"#ef4444", fontSize:13, margin:0 }}>{error}</p>
                    </div>
                  )}
                  <button type="submit" disabled={resetLoading || !email.trim()}
                    style={{ width:"100%", background:resetLoading?"#e7e5e4":"#3b82f6", border:"none", borderRadius:8, color:"#fff", padding:11, fontSize:14, fontWeight:700, cursor:resetLoading?"wait":"pointer", fontFamily:"inherit", opacity:!email.trim()?0.5:1 }}>
                    {resetLoading ? "Sending…" : "Send Reset Link"}
                  </button>
                </form>
              ) : (
                <div>
                  <div style={{ background:"#e8f4f0", border:"1px solid #10b98140", borderRadius:8, padding:"14px 16px", marginBottom:20 }}>
                    <p style={{ color:C.green, fontWeight:700, fontSize:13, margin:"0 0 4px" }}>✓ Reset email sent</p>
                    <p style={{ color:"#10b98199", fontSize:12, margin:0 }}>
                      A reset link was sent to <strong>{email}</strong>. Check your inbox and spam folder — it usually arrives within 1–2 minutes.
                    </p>
                  </div>
                  <p style={{ color:C.textMuted, fontSize:12, margin:"0 0 16px" }}>
                    Didn't receive it? Firebase sometimes delays delivery. You can also ask your platform admin to reset it directly from the Firebase Console.
                  </p>
                  <button onClick={() => { setResetSent(false); setError(""); }}
                    style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:6, color:C.textMuted, padding:"7px 14px", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
                    Resend
                  </button>
                  <button onClick={() => { setStep("credentials"); setError(""); setResetSent(false); }}
                    style={{ background:"none", border:"none", color:"#3b82f6", padding:"7px 14px", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit", marginLeft:8 }}>
                    Back to sign in
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ background:"#f59e0b15", border:"1px solid #f59e0b30", borderRadius:8, padding:"10px 16px", marginTop:16 }}>
          <p style={{ color:"#f59e0b", fontSize:12, margin:0, textAlign:"center" }}>
            ⚠ Unauthorised access violates company policy and may result in legal action
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────

export default function BeWatuOps() {
  const [staff,       setStaff]       = useState(null);
  const [showMFAGate,    setShowMFAGate]    = useState(false);
  const [showPolicyGate, setShowPolicyGate] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [agentStatus,   setAgentStatus]   = useState("available");
  const [loading,      setLoading]      = useState(true);
  const [active,       setActive]       = useState("dashboard");
  const [queueConfig,  setQueueConfig]  = useState(DEFAULT_QUEUE_CONFIG);

  // Live data for dashboard badges
  const [tickets,              setTickets]              = useState([]);
  const [verificationQueue,    setVerificationQueue]    = useState([]);
  const [users,                setUsers]                = useState([]);
  const [fraudCases,           setFraudCases]           = useState([]);
  const [contentReports,       setContentReports]       = useState([]);
  const [recruiterApplications,setRecruiterApplications] = useState([]);
  const [credentialRequests,   setCredentialRequests]   = useState([]);
  const [dataRequests,         setDataRequests]         = useState([]);
  const [appeals,              setAppeals]              = useState([]);
  const [staffList,            setStaffList]            = useState([]);

  // Restore session on reload
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const staffDoc = await fetchOpsStaff(user.uid).catch(() => null);
        if (staffDoc?.isActive) {
          const staffObj = { uid: user.uid, email: user.email, name: staffDoc.name || user.email, role: staffDoc.role };
          setStaff(staffObj);
          if (!staffDoc.mfaEnabled) setShowMFAGate(true);
          setShowPolicyGate(true);  // always check on login; gate decides if needed
          loadSLAConfig().then(setQueueConfig).catch(() => {});
        } else {
          await signOut(auth);
        }
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  // Subscribe to live data for badges + dashboard once logged in
  useEffect(() => {
    if (!staff) return;
    const u1 = subscribeToTickets({}, setTickets);
    const u2 = subscribeToVerificationQueue(setVerificationQueue);
    const u3 = subscribeToUsers(setUsers);
    const u4 = subscribeToFraudCases(setFraudCases);
    const u5 = subscribeToContentReports(setContentReports);
    const u6 = subscribeToRecruiterApplications(setRecruiterApplications);
    const u7 = subscribeToCredentialRequests(setCredentialRequests);
    const u8 = subscribeToAppeals(setAppeals);
    const u9 = subscribeToOpsStaff(data => setStaffList(data.filter(s => s.isActive !== false)));
    const u10 = subscribeToDataRequests(setDataRequests);
    return () => { u1(); u2(); u3(); u4(); u5(); u6(); u7(); u8(); u9(); u10(); };
  }, [staff]);

  const handleSignOut = async () => {
    await writeAuditEntry({ action:"staff.logout", actorUid:staff.uid, actorEmail:staff.email, actorRole:staff.role, targetId:staff.uid, targetType:"staff", reason:"Staff logout" }).catch(()=>{});
    await signOut(auth);
    setStaff(null);
    setActive("dashboard");
  };

  // Global keyboard shortcut: ? to show help
  useEffect(() => {
    if (!staff) return;
    const h = e => {
      if (e.key === "?" && !["input","textarea"].includes(e.target.tagName.toLowerCase())) {
        setShowShortcuts(p => !p);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [staff]);

  if (loading) return (
    <div style={{ minHeight:"100vh", background:"#f5f5f4", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <p style={{ color:C.textMuted, fontSize:14 }}>Loading…</p>
    </div>
  );

  if (!staff) return <Login onLogin={setStaff} />;

  const badges = {
    openTickets:       tickets.filter(t=>t.status==="open").length,
    myTickets:         tickets.filter(t=>t.assignedTo===staff.uid && !["resolved","closed"].includes(t.status)).length,
    pendingVerif:      verificationQueue.filter(v=>v.status==="pending").length,
    openFraud:         fraudCases.filter(c=>c.status==="open").length,
    pendingReports:    contentReports.filter(r=>r.status==="pending").length,
    pendingRecruiters: recruiterApplications.filter(a=>a.status==="pending").length,
    pendingCreds:      credentialRequests.filter(r=>r.status==="pending").length,
    pendingAppeals:    appeals.filter(a=>a.status==="open"||a.status==="under_review").length,
    dataReqs:          dataRequests.filter(r=>r.status==="pending").length,
  };


// ── DATA REQUESTS — subscribe function ───────────────────────────────────────
function subscribeToDataRequests(callback) {
  const q = query(
    collection(db, 'data_requests'),
    orderBy('requestedAt', 'desc'),
    limit(100)
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      requestedAt: d.data().requestedAt?.toDate?.() ?? new Date(),
      reviewedAt:  d.data().reviewedAt?.toDate?.()  ?? null,
    })));
  });
}


// ── Firestore helpers ─────────────────────────────────────────────────────────


async function approveDataRequest(requestId, downloadUrl, staffInfo) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await updateDoc(doc(db, 'data_requests', requestId), {
    status:      'approved',
    downloadUrl,
    expiresAt:   Timestamp.fromDate(expiresAt),
    reviewedBy:   staffInfo.uid,
    reviewedByName: staffInfo.name,
    reviewedAt:  serverTimestamp(),
  });

  // Write notification to user's notifications subcollection
  const req = await getDoc(doc(db, 'data_requests', requestId));
  const uid = req.data()?.uid;
  if (uid) {
    await addDoc(collection(db, 'users', uid, 'notifications'), {
      type:        'data_request_approved',
      message:     'Your data export is ready to download',
      downloadUrl,
      isRead:      false,
      createdAt:   serverTimestamp(),
    });
  }

  await writeAuditEntry({
    action:      'user.data_request_approved',
    actorUid:    staffInfo.uid,
    actorEmail:  staffInfo.email,
    actorRole:   staffInfo.role,
    targetId:    requestId,
    targetType:  'data_request',
    reason:      'Data export request approved',
  });
}

async function denyDataRequest(requestId, reason, staffInfo) {
  await updateDoc(doc(db, 'data_requests', requestId), {
    status:         'denied',
    denyReason:     reason,
    reviewedBy:     staffInfo.uid,
    reviewedByName: staffInfo.name,
    reviewedAt:     serverTimestamp(),
  });

  const req = await getDoc(doc(db, 'data_requests', requestId));
  const uid = req.data()?.uid;
  if (uid) {
    await addDoc(collection(db, 'users', uid, 'notifications'), {
      type:    'data_request_denied',
      message: `Your data export request was not approved: ${reason}`,
      isRead:  false,
      createdAt: serverTimestamp(),
    });
  }

  await writeAuditEntry({
    action:      'user.data_request_denied',
    actorUid:    staffInfo.uid,
    actorEmail:  staffInfo.email,
    actorRole:   staffInfo.role,
    targetId:    requestId,
    targetType:  'data_request',
    reason:      `Data request denied: ${reason}`,
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

function DataRequestsQueue({ staff, dataRequests = [] }) {
  const requests = dataRequests;
  const loading  = false;  // data is managed by parent App
  const [selected, setSelected] = useState(null);
  const [filter,   setFilter]   = useState('pending');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [denyReason,  setDenyReason]  = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [toast,       setToast]       = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleApprove = async () => {
    if (!downloadUrl.trim()) { showToast('Enter the download URL first', 'error'); return; }
    if (!selected) return;
    setSubmitting(true);
    try {
      await approveDataRequest(selected.id, downloadUrl.trim(), staff);
      showToast(`Approved — user notified`);
      setSelected(null);
      setDownloadUrl('');
    } catch (e) {
      showToast(e.message ?? 'Failed', 'error');
    } finally { setSubmitting(false); }
  };

  const handleDeny = async () => {
    if (!denyReason.trim()) { showToast('Enter a reason for denial', 'error'); return; }
    if (!selected) return;
    setSubmitting(true);
    try {
      await denyDataRequest(selected.id, denyReason.trim(), staff);
      showToast(`Denied — user notified`);
      setSelected(null);
      setDenyReason('');
    } catch (e) {
      showToast(e.message ?? 'Failed', 'error');
    } finally { setSubmitting(false); }
  };

  const filtered = requests.filter(r => filter === 'all' ? true : r.status === filter);

  const statusColor = s => ({
    pending:  { bg: '#fef3c7', fg: '#92400e', label: 'Pending' },
    approved: { bg: '#d1fae5', fg: '#065f46', label: 'Approved' },
    denied:   { bg: '#fee2e2', fg: '#991b1b', label: 'Denied'   },
  }[s] ?? { bg: C.surface2, fg: C.textMuted, label: s });

  const ago = d => {
    if (!d) return '';
    const diff = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (diff < 60)    return `${diff}s ago`;
    if (diff < 3600)  return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    return `${Math.floor(diff/86400)}d ago`;
  };

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: toast.type === 'error' ? '#ef4444' : C.green,
          color: '#fff', padding: '10px 18px', borderRadius: 10,
          fontSize: 13, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ color: C.text, fontSize: 20, fontWeight: 700, margin: 0 }}>Data Export Requests</h2>
        <p style={{ color: C.textMuted, fontSize: 13, margin: '4px 0 0' }}>
          GDPR Article 15 — Right of Access. Process within 30 days (target: 3–5 business days).
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Pending',  value: requests.filter(r => r.status === 'pending').length,  color: '#f59e0b' },
          { label: 'Approved', value: requests.filter(r => r.status === 'approved').length, color: C.green },
          { label: 'Denied',   value: requests.filter(r => r.status === 'denied').length,   color: '#ef4444' },
        ].map(s => (
          <div key={s.label} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 18px' }}>
            <p style={{ color: s.color, fontSize: 26, fontWeight: 800, margin: 0 }}>{s.value}</p>
            <p style={{ color: C.textMuted, fontSize: 12, margin: '2px 0 0' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: `1px solid ${C.border}` }}>
        {['pending', 'approved', 'denied', 'all'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '8px 16px', fontSize: 13, fontWeight: 600,
            color: filter === f ? C.green : C.textMuted,
            borderBottom: filter === f ? `2px solid ${C.green}` : '2px solid transparent',
            fontFamily: 'inherit', textTransform: 'capitalize', marginBottom: -1,
          }}>
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            {f !== 'all' && (
              <span style={{ marginLeft: 6, background: C.surface2, borderRadius: 99, padding: '1px 6px', fontSize: 11 }}>
                {requests.filter(r => r.status === f).length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 380px' : '1fr', gap: 16 }}>

        {/* List */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.textMuted }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.textMuted }}>
              {filter === 'pending' ? '✅ No pending requests' : `No ${filter} requests`}
            </div>
          ) : filtered.map(req => {
            const sc = statusColor(req.status);
            const isSelected = selected?.id === req.id;
            return (
              <div
                key={req.id}
                onClick={() => setSelected(isSelected ? null : req)}
                style={{
                  padding: '14px 18px',
                  borderBottom: `1px solid ${C.border}`,
                  cursor: 'pointer',
                  background: isSelected ? C.surface2 : 'transparent',
                  display: 'flex', alignItems: 'center', gap: 14,
                  transition: 'background 0.1s',
                }}
              >
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: C.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                  📦
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>{req.displayName}</span>
                    <span style={{ background: sc.bg, color: sc.fg, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>{sc.label}</span>
                  </div>
                  <p style={{ color: C.textMuted, fontSize: 12, margin: '2px 0 0' }}>{req.email}</p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ color: C.textMuted, fontSize: 11, margin: 0 }}>{ago(req.requestedAt)}</p>
                  {req.status === 'pending' && (
                    <p style={{ color: '#f59e0b', fontSize: 11, fontWeight: 600, margin: '2px 0 0' }}>⏳ Action needed</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail panel */}
        {selected && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, alignSelf: 'start' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <h3 style={{ color: C.text, fontSize: 15, fontWeight: 700, margin: 0 }}>Request Details</h3>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 18, padding: 0 }}>×</button>
            </div>

            <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
              {[
                { label: 'User',      value: selected.displayName },
                { label: 'Email',     value: selected.email },
                { label: 'User ID',   value: selected.numericId },
                { label: 'Firebase UID', value: selected.uid },
                { label: 'Requested', value: selected.requestedAt?.toLocaleString?.() ?? '—' },
                { label: 'Status',    value: statusColor(selected.status).label },
                { label: 'Reviewed by', value: selected.reviewedByName ?? '—' },
                { label: 'Reviewed', value: selected.reviewedAt?.toLocaleString?.() ?? '—' },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ color: C.textMuted, fontSize: 12 }}>{r.label}</span>
                  <span style={{ color: C.text, fontSize: 12, fontWeight: 500, textAlign: 'right', wordBreak: 'break-all', maxWidth: 200 }}>{String(r.value)}</span>
                </div>
              ))}
            </div>

            {selected.downloadUrl && (
              <a href={selected.downloadUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block', color: C.green, fontSize: 13, marginBottom: 16, wordBreak: 'break-all' }}>
                📥 Download link
              </a>
            )}

            {selected.status === 'pending' && (
              <div style={{ display: 'grid', gap: 12 }}>
                <hr style={{ border: 'none', borderTop: `1px solid ${C.border}`, margin: 0 }} />

                {/* Approve */}
                <div>
                  <p style={{ color: C.textMuted, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                    APPROVE — provide download link
                  </p>
                  <p style={{ color: C.textDim, fontSize: 11, marginBottom: 8 }}>
                    Generate the user's data export, upload to secure storage, paste the URL below.
                    The link will be sent to the user's notification panel and email.
                  </p>
                  <input
                    value={downloadUrl}
                    onChange={e => setDownloadUrl(e.target.value)}
                    placeholder="https://storage.bewatu.com/exports/..."
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      background: C.surface2, border: `1px solid ${C.border}`,
                      borderRadius: 8, padding: '8px 12px', color: C.text,
                      fontSize: 12, fontFamily: 'inherit', marginBottom: 8,
                    }}
                  />
                  <button
                    onClick={handleApprove}
                    disabled={submitting || !downloadUrl.trim()}
                    style={{
                      width: '100%', background: C.green, color: '#fff',
                      border: 'none', borderRadius: 8, padding: '9px 0',
                      fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      opacity: submitting || !downloadUrl.trim() ? 0.5 : 1,
                      fontFamily: 'inherit',
                    }}>
                    {submitting ? 'Processing…' : '✅ Approve & notify user'}
                  </button>
                </div>

                <hr style={{ border: 'none', borderTop: `1px solid ${C.border}`, margin: 0 }} />

                {/* Deny */}
                <div>
                  <p style={{ color: C.textMuted, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                    DENY — provide reason
                  </p>
                  <textarea
                    value={denyReason}
                    onChange={e => setDenyReason(e.target.value)}
                    placeholder="e.g. Unable to verify identity — please contact privacy@bewatu.com"
                    rows={3}
                    style={{
                      width: '100%', boxSizing: 'border-box', resize: 'vertical',
                      background: C.surface2, border: `1px solid ${C.border}`,
                      borderRadius: 8, padding: '8px 12px', color: C.text,
                      fontSize: 12, fontFamily: 'inherit', marginBottom: 8,
                    }}
                  />
                  <button
                    onClick={handleDeny}
                    disabled={submitting || !denyReason.trim()}
                    style={{
                      width: '100%', background: '#ef4444', color: '#fff',
                      border: 'none', borderRadius: 8, padding: '9px 0',
                      fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      opacity: submitting || !denyReason.trim() ? 0.5 : 1,
                      fontFamily: 'inherit',
                    }}>
                    {submitting ? 'Processing…' : '✕ Deny & notify user'}
                  </button>
                </div>
              </div>
            )}

            {selected.status === 'denied' && selected.denyReason && (
              <div style={{ background: '#fee2e2', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#991b1b' }}>
                <strong>Denial reason:</strong> {selected.denyReason}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


  const renderModule = () => {
    switch (active) {
      case "dashboard":    return <Dashboard tickets={tickets} verificationQueue={verificationQueue} users={users} fraudCases={fraudCases} contentReports={contentReports} onNavigate={setActive} staff={staff} />;
      case "myqueue":      return <SupportTickets staff={staff} filterMineOnly={true} queueConfig={queueConfig} />;
      case "tickets":      return <SupportTickets staff={staff} queueConfig={queueConfig} />;
      case "users":        return <UserManagement staff={staff} />;
      case "fraud":        return <FraudInvestigation staff={staff} />;
      case "moderation":   return <ContentModeration staff={staff} />;
      case "verification": return <VerificationQueue staff={staff} />;
      case "recruiters":   return <RecruiterApplications staff={staff} />;
      case "credentials":   return <CredentialChanges staff={staff} />;
      case "data_requests": return <DataRequestsQueue staff={staff} dataRequests={dataRequests} />;
      case "audit":        return <AuditLog />;
      case "team":         return <TeamManagement staff={staff} />;
      case "finance":      return <FinancePlaceholder />;
      case "queues":       return <QueueManagement staff={staff} tickets={tickets} staffList={staffList||[]} onNavigate={(page) => setActive(page)} />;
      case "watchlists":   return <WatchlistsModule staff={staff} />;
      case "appeals":      return <AppealManagement staff={staff} />;
      case "sla":          return <SLAConfig staff={staff} />;
      case "reports":      return <ScheduledReports staff={staff} />;
      case "kb":           return <KnowledgeBase staff={staff} db={db} />;
      case "policies":     return <PolicyVersionAdmin staff={staff} />;
      case "security":     return <SecurityModule staff={staff} />;
      default:             return null;
    }
  };

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:C.bg, fontFamily:"system-ui,-apple-system,'Segoe UI',sans-serif" }}>
      {showMFAGate && <MFAGate staff={staff} onContinue={() => setShowMFAGate(false)} />}
      {showPolicyGate && <PolicyGate staff={staff} onComplete={() => setShowPolicyGate(false)} />}
      {showShortcuts && <ShortcutHelp onClose={() => setShowShortcuts(false)} />}
      <Sidebar active={active} onNav={setActive} staff={staff} badges={badges} onSignOut={handleSignOut} />
      <div style={{ flex:1, overflowY:"auto", minWidth:0, display:"flex", flexDirection:"column" }}>
        {/* Topbar */}
        <div style={{ background:C.bg, borderBottom:"1px solid #0a1020", padding:"9px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ color:"#1a4a3a", fontSize:12 }}>ops.bewatu.com</span>
            <span style={{ color:C.textDim }}>›</span>
            <span style={{ color:C.textMuted, fontSize:12, textTransform:"capitalize" }}>{active.replace(/_/g," ")}</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <AgentStatusPicker staffUid={staff?.uid} currentStatus={agentStatus} onUpdate={setAgentStatus} />
            <GlobalSearch tickets={tickets} users={users} fraudCases={fraudCases} onNavigate={setActive} />
            <NotificationBell staff={staff} onNavigate={setActive} />
            <div style={{ width:6, height:6, borderRadius:"50%", background:"#1a4a3a" }} />
            <span style={{ color:"#1a4a3a", fontSize:11 }}>Live</span>
          </div>
        </div>
        <div style={{ flex:1 }}>{renderModule()}</div>
      </div>

      <style>{`
        * { box-sizing:border-box; }
        body { margin:0; }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:${C.bg}; }
        ::-webkit-scrollbar-thumb { background:#d6d3d1; border-radius:3px; }
        select option { background:#ffffff; color:#1c1917; }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}

function FinancePlaceholder() {
  return (
    <div style={{ padding:28 }}>
      <h2 style={{ color:C.text, fontSize:20, fontWeight:800, margin:"0 0 8px" }}>Finance & Billing</h2>
      <p style={{ color:C.textMuted, fontSize:13, margin:"0 0 24px" }}>
        Finance ops connects to Stripe. This module will be wired once Stripe webhooks are configured to write payment events to the <code style={{ background:C.surface2, padding:"2px 6px", borderRadius:4 }}>payment_events</code> Firestore collection.
      </p>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
        <div style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:10, padding:24 }}>
          <p style={{ color:"#57534e", fontWeight:700, margin:"0 0 16px", fontSize:14 }}>What's needed to activate</p>
          <ol style={{ color:C.textMuted, fontSize:13, lineHeight:2.2, margin:0, paddingLeft:20 }}>
            <li>Create Stripe webhook → Firebase Cloud Function</li>
            <li>Function writes events to <code style={{ background:C.bg, padding:"1px 5px", borderRadius:3 }}>payment_events/</code></li>
            <li>Create <code style={{ background:C.bg, padding:"1px 5px", borderRadius:3 }}>refund_requests/</code> collection</li>
            <li>Wire this module to those collections</li>
          </ol>
        </div>
        <div style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:10, padding:24 }}>
          <p style={{ color:"#57534e", fontWeight:700, margin:"0 0 16px", fontSize:14 }}>Collections to create</p>
          {[
            ["payment_events/", "Stripe webhook events"],
            ["refund_requests/","Ops-initiated refunds"],
            ["subscription_changes/","Plan upgrades/downgrades"],
            ["billing_disputes/","Chargeback cases"],
          ].map(([col, desc]) => (
            <div key={col} style={{ padding:"8px 0", borderBottom:`1px solid ${C.border2}` }}>
              <code style={{ color:C.green, fontSize:12 }}>{col}</code>
              <span style={{ color:C.textMuted, fontSize:12, marginLeft:12 }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


// ─── SECURITY MODULE ──────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  critical:      { color: "#dc2626", bg: "#fef2f2", label: "Critical"      },
  high:          { color: "#ea580c", bg: "#fff7ed", label: "High"          },
  medium:        { color: "#d97706", bg: "#fffbeb", label: "Medium"        },
  low:           { color: "#65a30d", bg: "#f7fee7", label: "Low"           },
  informational: { color: "#64748b", bg: "#f8fafc", label: "Info"          },
};

const STATUS_CONFIG = {
  open:                { color: "#64748b", label: "Open"               },
  triaged:             { color: "#3b82f6", label: "Triaged"            },
  remediation_pending: { color: "#8b5cf6", label: "Remediation Pending"},
  approval_pending:    { color: "#f59e0b", label: "Awaiting Approval"  },
  executing:           { color: "#06b6d4", label: "Executing"          },
  verified:            { color: "#16a34a", label: "Verified"           },
  false_positive:      { color: "#94a3b8", label: "False Positive"     },
  accepted_risk:       { color: "#94a3b8", label: "Accepted Risk"      },
};

const CATEGORY_ICONS = {
  vulnerability:    "🔓",
  secret_leak:      "🔑",
  misconfiguration: "⚙️",
  dependency_risk:  "📦",
  runtime_anomaly:  "⚡",
  policy_violation: "📋",
};

function SecurityModule({ staff }) {
  const isAdmin     = isTierAdmin(staff.role);
  const isCyber     = staff.role === "cyber_agent" || isAdmin;
  const canApprove  = isAdmin; // only platform_admin can approve remediations

  const [tab,          setTab]          = useState("findings");   // findings | approvals
  const [findings,     setFindings]     = useState([]);
  const [approvals,    setApprovals]    = useState([]);
  const [selected,     setSelected]     = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast,        setToast]        = useState(null);
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterStatus,   setFilterStatus]   = useState("open");
  const [noteInput,    setNoteInput]    = useState("");

  function showToast(msg, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  // Subscribe to security_findings
  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, "security_findings"),
      orderBy("riskScore", "desc"),
      limit(100)
    );
    const unsub = onSnapshot(q, snap => {
      setFindings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, err => {
      if (err?.code === "permission-denied") { setLoading(false); return; }
      console.error("Security findings error:", err);
      setLoading(false);
    });
    return unsub;
  }, []);

  // Subscribe to approval_requests
  useEffect(() => {
    const q = query(
      collection(db, "approval_requests"),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc"),
      limit(50)
    );
    const unsub = onSnapshot(q, snap => {
      setApprovals(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => {
      if (err?.code === "permission-denied") return;
      console.error("Approvals error:", err);
    });
    return unsub;
  }, []);

  // Filter findings
  const filteredFindings = findings.filter(f => {
    if (filterSeverity !== "all" && f.severity !== filterSeverity) return false;
    if (filterStatus   !== "all" && f.status   !== filterStatus)   return false;
    return true;
  });

  async function handleMarkFalsePositive(finding) {
    if (!noteInput.trim()) { showToast("Add a reason before marking false positive.", false); return; }
    setActionLoading(true);
    try {
      await updateDoc(doc(db, "security_findings", finding.id), {
        status:               "false_positive",
        falsePositiveReason:  noteInput.trim(),
        updatedAt:            serverTimestamp(),
      });
      await addDoc(collection(db, "audit_log"), {
        action:    "security_finding_false_positive",
        actorUid:  staff.uid,
        actorEmail: staff.email,
        actorRole: staff.role,
        findingId: finding.id,
        reason:    noteInput.trim(),
        timestamp: serverTimestamp(),
      });
      setNoteInput("");
      setSelected(null);
      showToast("Marked as false positive.");
    } catch (e) {
      showToast("Failed: " + e.message, false);
    }
    setActionLoading(false);
  }

  async function handleApprove(approval, decision) {
    if (!canApprove) return;
    setActionLoading(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const res   = await fetch("https://www.bewatu.com/api/security/approve", {
        method:  "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body:    JSON.stringify({ approvalId: approval.id, decision, note: noteInput || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNoteInput("");
      setSelected(null);
      showToast(`Remediation ${decision}.`);
    } catch (e) {
      showToast("Failed: " + e.message, false);
    }
    setActionLoading(false);
  }

  const pendingApprovalsCount = approvals.length;

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          background: toast.ok ? "#16a34a" : "#dc2626", color: "#fff",
          padding: "10px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
          boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
        }}>{toast.msg}</div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ color: C.text, fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>
          🔐 Security
        </h2>
        <p style={{ color: C.textMuted, fontSize: 13, margin: 0 }}>
          Security findings, vulnerability triage, and remediation approvals.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${C.border}` }}>
        {[
          { id: "findings",  label: "Findings" },
          { id: "approvals", label: `Approvals${pendingApprovalsCount > 0 ? ` (${pendingApprovalsCount})` : ""}` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "8px 18px", border: "none", background: "none", cursor: "pointer",
            fontFamily: "inherit", fontSize: 13, fontWeight: tab === t.id ? 700 : 400,
            color: tab === t.id ? C.text : C.textMuted,
            borderBottom: tab === t.id ? `2px solid #1a4a3a` : "2px solid transparent",
            marginBottom: -1,
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── FINDINGS TAB ── */}
      {tab === "findings" && (
        <div style={{ display: "flex", gap: 16 }}>
          {/* List */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Filters */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}
                style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, background: C.bg, color: C.text, fontFamily: "inherit" }}>
                <option value="all">All Severities</option>
                {Object.entries(SEVERITY_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, background: C.bg, color: C.text, fontFamily: "inherit" }}>
                <option value="all">All Statuses</option>
                <option value="open">Open</option>
                <option value="triaged">Triaged</option>
                <option value="approval_pending">Awaiting Approval</option>
                <option value="verified">Verified</option>
                <option value="false_positive">False Positive</option>
              </select>
              <span style={{ marginLeft: "auto", color: C.textMuted, fontSize: 12, alignSelf: "center" }}>
                {filteredFindings.length} finding{filteredFindings.length !== 1 ? "s" : ""}
              </span>
            </div>

            {loading ? (
              <p style={{ color: C.textMuted, fontSize: 13 }}>Loading findings…</p>
            ) : filteredFindings.length === 0 ? (
              <div style={{ textAlign: "center", padding: 48, color: C.textMuted }}>
                <p style={{ fontSize: 32, margin: "0 0 8px" }}>🛡</p>
                <p style={{ fontSize: 14, margin: 0 }}>No findings match this filter.</p>
              </div>
            ) : filteredFindings.map(f => {
              const sev    = SEVERITY_CONFIG[f.severity] || SEVERITY_CONFIG.informational;
              const status = STATUS_CONFIG[f.status] || { color: "#64748b", label: f.status };
              const isSelected = selected?.id === f.id && selected?._type === "finding";
              return (
                <div key={f.id} onClick={() => setSelected({ ...f, _type: "finding" })}
                  style={{
                    background: isSelected ? C.surface2 : C.bg,
                    border: `1px solid ${isSelected ? "#1a4a3a" : C.border}`,
                    borderRadius: 8, padding: "12px 14px", marginBottom: 8,
                    cursor: "pointer", transition: "border 0.1s",
                  }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>
                      {CATEGORY_ICONS[f.category] || "🔍"}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
                        <span style={{
                          background: sev.bg, color: sev.color,
                          fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                          textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0,
                        }}>{sev.label}</span>
                        <span style={{ color: C.textDim, fontSize: 10, fontWeight: 600 }}>
                          Score: {f.riskScore}/100
                        </span>
                        <span style={{ color: status.color, fontSize: 10, fontWeight: 600, marginLeft: "auto" }}>
                          {status.label}
                        </span>
                      </div>
                      <p style={{ color: C.text, fontSize: 13, fontWeight: 600, margin: "0 0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {f.title}
                      </p>
                      <p style={{ color: C.textMuted, fontSize: 11, margin: 0 }}>
                        {f.findingId} · {f.sensor} · {f.category?.replace(/_/g, " ")}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Detail Panel */}
          {selected && selected._type === "finding" && (
            <div style={{
              width: 380, flexShrink: 0, background: C.surface2,
              border: `1px solid ${C.border}`, borderRadius: 10,
              padding: 20, alignSelf: "flex-start", position: "sticky", top: 20,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                <span style={{ fontSize: 20 }}>{CATEGORY_ICONS[selected.category] || "🔍"}</span>
                <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", color: C.textMuted, fontSize: 18 }}>✕</button>
              </div>

              <p style={{ color: C.text, fontSize: 14, fontWeight: 700, margin: "0 0 6px", lineHeight: 1.4 }}>{selected.title}</p>
              <p style={{ color: C.textMuted, fontSize: 11, margin: "0 0 14px" }}>{selected.findingId}</p>

              {/* Risk score bar */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ color: C.textMuted, fontSize: 11 }}>Risk Score</span>
                  <span style={{ color: C.text, fontSize: 11, fontWeight: 700 }}>{selected.riskScore}/100</span>
                </div>
                <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 3,
                    width: `${selected.riskScore}%`,
                    background: selected.riskScore >= 85 ? "#dc2626" : selected.riskScore >= 65 ? "#ea580c" : selected.riskScore >= 40 ? "#d97706" : "#65a30d",
                  }} />
                </div>
              </div>

              {/* Meta */}
              {[
                ["Severity",  (SEVERITY_CONFIG[selected.severity] || {}).label || selected.severity],
                ["Status",    (STATUS_CONFIG[selected.status] || {}).label || selected.status],
                ["Category",  selected.category?.replace(/_/g, " ")],
                ["Sensor",    selected.sensor],
                ["Repo",      selected.repo],
              ].map(([k, v]) => v && (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border2}` }}>
                  <span style={{ color: C.textMuted, fontSize: 12 }}>{k}</span>
                  <span style={{ color: C.text, fontSize: 12, fontWeight: 600, textTransform: "capitalize" }}>{v}</span>
                </div>
              ))}

              {/* Description */}
              {selected.description && (
                <div style={{ margin: "14px 0 0" }}>
                  <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>Description</p>
                  <p style={{ color: C.text, fontSize: 12, lineHeight: 1.6, margin: 0 }}>{selected.description}</p>
                </div>
              )}

              {/* Evidence */}
              {selected.evidence?.filePath && (
                <div style={{ margin: "14px 0 0" }}>
                  <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>Evidence</p>
                  <code style={{ display: "block", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 10px", fontSize: 11, color: "#1a4a3a", lineHeight: 1.6, wordBreak: "break-all" }}>
                    {selected.evidence.filePath}{selected.evidence.lineNumber ? `:${selected.evidence.lineNumber}` : ""}
                    {selected.evidence.snippet ? `\n${selected.evidence.snippet}` : ""}
                  </code>
                </div>
              )}

              {/* Affected assets */}
              {selected.affectedAssets?.length > 0 && (
                <div style={{ margin: "14px 0 0" }}>
                  <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>Affected Assets</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {selected.affectedAssets.map(a => (
                      <span key={a} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: "2px 8px", fontSize: 11, color: C.text }}>{a}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions — cyber_agent can mark false positive; admin can also approve */}
              {!["verified","false_positive","accepted_risk"].includes(selected.status) && (
                <div style={{ marginTop: 18, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
                  <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 8px" }}>Actions</p>
                  <textarea
                    value={noteInput}
                    onChange={e => setNoteInput(e.target.value)}
                    placeholder="Add a note or reason…"
                    rows={2}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", background: C.bg, color: C.text, resize: "vertical", boxSizing: "border-box", marginBottom: 8 }}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    {isCyber && (
                      <button onClick={() => handleMarkFalsePositive(selected)}
                        disabled={actionLoading}
                        style={{ flex: 1, padding: "8px 0", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                        False Positive
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── APPROVALS TAB ── */}
      {tab === "approvals" && (
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {!canApprove && (
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#92400e" }}>
                ⚠️ Only platform admins can approve or reject remediations.
              </div>
            )}

            {approvals.length === 0 ? (
              <div style={{ textAlign: "center", padding: 48, color: C.textMuted }}>
                <p style={{ fontSize: 32, margin: "0 0 8px" }}>✅</p>
                <p style={{ fontSize: 14, margin: 0 }}>No pending approvals.</p>
              </div>
            ) : approvals.map(a => {
              const sev = SEVERITY_CONFIG[a.severity] || SEVERITY_CONFIG.informational;
              const isSelected = selected?.id === a.id && selected?._type === "approval";
              return (
                <div key={a.id} onClick={() => setSelected({ ...a, _type: "approval" })}
                  style={{
                    background: isSelected ? C.surface2 : C.bg,
                    border: `1px solid ${isSelected ? "#1a4a3a" : C.border}`,
                    borderRadius: 8, padding: "12px 14px", marginBottom: 8, cursor: "pointer",
                  }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ background: sev.bg, color: sev.color, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, textTransform: "uppercase" }}>{sev.label}</span>
                    <span style={{ color: C.textDim, fontSize: 11 }}>Score: {a.riskScore}/100</span>
                    <span style={{ marginLeft: "auto", color: "#f59e0b", fontSize: 11, fontWeight: 600 }}>⏳ Pending</span>
                  </div>
                  <p style={{ color: C.text, fontSize: 13, fontWeight: 600, margin: "0 0 3px" }}>{a.title}</p>
                  <p style={{ color: C.textMuted, fontSize: 11, margin: 0 }}>
                    Effort: {a.estimatedEffort} · Assets: {a.affectedAssets?.slice(0,2).join(", ")}{(a.affectedAssets?.length || 0) > 2 ? ` +${a.affectedAssets.length - 2}` : ""}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Approval Detail Panel */}
          {selected && selected._type === "approval" && (
            <div style={{
              width: 400, flexShrink: 0, background: C.surface2,
              border: `1px solid ${C.border}`, borderRadius: 10,
              padding: 20, alignSelf: "flex-start", position: "sticky", top: 20,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
                <span style={{ color: C.text, fontSize: 14, fontWeight: 700 }}>Approval Request</span>
                <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", color: C.textMuted, fontSize: 18 }}>✕</button>
              </div>

              <p style={{ color: C.text, fontSize: 13, fontWeight: 700, margin: "0 0 10px", lineHeight: 1.4 }}>{selected.title}</p>
              <p style={{ color: C.textMuted, fontSize: 12, margin: "0 0 14px", lineHeight: 1.6 }}>{selected.summary}</p>

              {/* Rollback plan */}
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: "10px 12px", marginBottom: 14 }}>
                <p style={{ color: "#92400e", fontSize: 11, fontWeight: 700, margin: "0 0 4px" }}>ROLLBACK PLAN</p>
                <p style={{ color: "#92400e", fontSize: 12, margin: 0, lineHeight: 1.5 }}>{selected.rollbackPlan}</p>
              </div>

              {/* AI Explanation */}
              {selected.aiExplanation && (
                <div style={{ marginBottom: 14 }}>
                  <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 8px" }}>Plain English Explanation</p>
                  <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px" }}>
                    {selected.aiExplanation.split(/\r?\n/).map((line, i) => {
                      if (line.startsWith('**') && line.endsWith('**')) {
                        return <p key={i} style={{ color: C.text, fontSize: 12, fontWeight: 700, margin: "10px 0 4px" }}>{line.replace(/\*\*/g, '')}</p>;
                      }
                      if (line.trim() === '') return null;
                      return <p key={i} style={{ color: C.text, fontSize: 12, lineHeight: 1.6, margin: "0 0 4px" }}>{line}</p>;
                    })}
                  </div>
                </div>
              )}

              {/* Diff */}
              {selected.diff && (
                <div style={{ marginBottom: 14 }}>
                  <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>Code Change</p>
                  <pre style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 12px", fontSize: 11, color: C.text, overflow: "auto", margin: 0, lineHeight: 1.6, maxHeight: 200 }}>
                    {selected.diff}
                  </pre>
                </div>
              )}

              {/* Affected assets */}
              {selected.affectedAssets?.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>Affected Assets</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {selected.affectedAssets.map(a => (
                      <span key={a} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: "2px 8px", fontSize: 11, color: C.text }}>{a}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Approve/Reject */}
              {canApprove && (
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14, marginTop: 4 }}>
                  <textarea
                    value={noteInput}
                    onChange={e => setNoteInput(e.target.value)}
                    placeholder="Optional note…"
                    rows={2}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", background: C.bg, color: C.text, resize: "vertical", boxSizing: "border-box", marginBottom: 10 }}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => handleApprove(selected, "approved")}
                      disabled={actionLoading}
                      style={{ flex: 1, padding: "10px 0", borderRadius: 6, border: "none", background: "#16a34a", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: actionLoading ? 0.6 : 1 }}>
                      ✓ Approve
                    </button>
                    <button onClick={() => handleApprove(selected, "rejected")}
                      disabled={actionLoading}
                      style={{ flex: 1, padding: "10px 0", borderRadius: 6, border: "none", background: "#dc2626", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: actionLoading ? 0.6 : 1 }}>
                      ✕ Reject
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
