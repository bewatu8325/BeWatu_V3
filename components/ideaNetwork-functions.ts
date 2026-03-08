/**
 * functions/src/ideaNetwork.ts
 *
 * Sprint 2 — Idea Network Cloud Functions
 *
 * 1. onIdeaArenaReady   — fires when an idea reaches arena_ready stage,
 *                         creates a notification for the author and pod members
 * 2. onIdeaStageChanged — fires on any stage change, writes to idea_activity log
 *
 * Add to functions/src/index.ts:
 *   export { onIdeaArenaReady, onIdeaStageChanged } from "./ideaNetwork";
 */

import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";

const db = admin.firestore();

// ─── Trigger 1: idea reached arena_ready ─────────────────────────────────────

export const onIdeaArenaReady = functions.firestore.onDocumentUpdated(
  "ideas/{ideaId}",
  async (event) => {
    const before = event.data?.before.data();
    const after  = event.data?.after.data();
    if (!before || !after) return;

    // Only fire when stage transitions TO arena_ready
    if (before.stage === "arena_ready") return;
    if (after.stage  !== "arena_ready") return;

    const ideaId    = event.params.ideaId;
    const authorUid = after.authorUid;

    // Notify the author
    await db.collection("notifications").doc(authorUid).collection("items").add({
      type:      "idea_arena_ready",
      entityId:  ideaId,
      message:   `Your idea "${after.title}" has reached Arena Ready — it's ready to become a Live Arena!`,
      ideaTitle: after.title,
      read:      false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // If the idea belongs to a pod, notify pod members
    if (after.podId) {
      const circleSnap = await db.doc(`circles/${after.podId}`).get();
      if (circleSnap.exists) {
        const members: string[] = (circleSnap.data()?.members ?? []).map(String);
        const otherMembers = members.filter(uid => uid !== String(authorUid));

        await Promise.all(otherMembers.map(uid =>
          db.collection("notifications").doc(uid).collection("items").add({
            type:      "pod_idea_arena_ready",
            entityId:  ideaId,
            message:   `An idea in your pod is Arena Ready: "${after.title}"`,
            ideaTitle: after.title,
            read:      false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          })
        ));
      }
    }

    console.log(`Idea ${ideaId} reached arena_ready — notifications sent`);
  }
);

// ─── Trigger 2: idea stage changed — write to activity log ───────────────────

export const onIdeaStageChanged = functions.firestore.onDocumentUpdated(
  "ideas/{ideaId}",
  async (event) => {
    const before = event.data?.before.data();
    const after  = event.data?.after.data();
    if (!before || !after) return;
    if (before.stage === after.stage) return;

    await db.collection("idea_activity").add({
      ideaId:    event.params.ideaId,
      ideaTitle: after.title,
      authorUid: after.authorUid,
      fromStage: before.stage,
      toStage:   after.stage,
      sparkCount: after.sparkCount,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
);


// =============================================================================
// INTEGRATION GUIDE — Sprint 2
// =============================================================================
//
// FILES TO CREATE (new):
//   components/IdeaNetwork.tsx         ← the main UI component
//   functions/src/ideaNetwork.ts       ← Cloud Functions
//
// FILES TO MODIFY (append/edit):
//   types.ts                           ← append types-additions.ts
//   lib/firestoreService.ts            ← append firestoreService-additions.ts
//   functions/src/index.ts             ← add two export lines
//   components/CircleDetail.tsx        ← add Ideas tab
//   App.tsx (or wherever View.Ideas    ← add global Ideas view
//            routes)
//
// ─── 1. functions/src/index.ts ───────────────────────────────────────────────
//
//   export { onIdeaArenaReady, onIdeaStageChanged } from "./ideaNetwork";
//
// ─── 2. CircleDetail.tsx — add Ideas tab ────────────────────────────────────
//
//   a) Import at top:
//      import IdeaNetwork from './IdeaNetwork';
//
//   b) Add tab to the activeTab state type:
//      useState<'discussion' | 'learn' | 'articles' | 'ideas'>('discussion')
//
//   c) Add tab button in the nav (after Learn):
//      <button
//        onClick={() => setActiveTab('ideas')}
//        className={`flex items-center gap-1.5 px-3 py-2 font-semibold text-sm transition-colors
//          ${activeTab === 'ideas' ? 'border-b-2' : 'text-stone-400 hover:text-stone-700'}`}
//        style={activeTab === 'ideas' ? { color:'#1a4a3a', borderColor:'#1a4a3a' } : {}}
//      >
//        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
//          strokeWidth={2} strokeLinecap="round">
//          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
//        </svg>
//        Ideas
//      </button>
//
//   d) Add tab content (after the learn tab block):
//      {activeTab === 'ideas' && (
//        <IdeaNetwork
//          currentUser={currentUser}
//          podId={circle.id}
//          onArenaLaunch={(idea) => console.log('Arena launch:', idea)} // wire to Sprint 3
//        />
//      )}
//
// ─── 3. Global Ideas view (optional but recommended) ─────────────────────────
//
//   a) Add to View enum in types.ts:
//      Ideas = 'IDEAS'
//
//   b) In App.tsx, add lazy import:
//      const IdeaNetwork = lazy(() => import('./components/IdeaNetwork'));
//
//   c) Add nav item in Header.tsx NAV_ITEMS:
//      { view: View.Ideas, label: 'Ideas', icon: Zap }
//
//   d) Add render case in App.tsx (in the view switch/conditional):
//      {currentView === View.Ideas && currentUser && (
//        <IdeaNetwork
//          currentUser={currentUser}
//          onArenaLaunch={(idea) => console.log('Arena launch:', idea)}
//        />
//      )}
//
// ─── 4. Firestore security rules — add these collections ─────────────────────
//
//   match /ideas/{ideaId} {
//     allow read: if request.auth != null;
//     allow create: if request.auth != null
//       && request.resource.data.authorUid == request.auth.uid;
//     allow update: if request.auth != null && (
//       // Only the author can change title/body/domain
//       request.resource.data.authorUid == request.auth.uid
//       // Anyone authenticated can spark (update sparkCount/sparkedByUids/stage)
//       || (request.resource.data.diff(resource.data).affectedKeys()
//            .hasOnly(['sparkCount','sparkedByUids','stage','updatedAt']))
//       // Anyone can increment commentCount
//       || (request.resource.data.diff(resource.data).affectedKeys()
//            .hasOnly(['commentCount','updatedAt']))
//       // Anyone can increment forkCount
//       || (request.resource.data.diff(resource.data).affectedKeys()
//            .hasOnly(['forkCount','updatedAt']))
//     );
//   }
//
//   match /ideas/{ideaId}/comments/{commentId} {
//     allow read: if request.auth != null;
//     allow create: if request.auth != null
//       && request.resource.data.authorUid == request.auth.uid;
//   }
//
//   match /idea_activity/{activityId} {
//     allow read: if request.auth != null;
//     allow write: if false; // Cloud Functions only
//   }
//
// ─── 5. Deploy ───────────────────────────────────────────────────────────────
//
//   firebase deploy --only functions
//
// =============================================================================
// WHAT HAPPENS AFTER DEPLOY
// =============================================================================
//
// - Ideas can be posted inside any Pod via the new Ideas tab in CircleDetail
// - Ideas can also be posted in the global Ideas feed (View.Ideas)
// - Sparking auto-advances stage: 5 sparks → Developing, 15 → Arena Ready
// - When an idea hits Arena Ready:
//     • Author gets a notification
//     • Pod members get a notification
//     • A green "Launch Arena →" banner appears on the idea card
//     • onArenaLaunch callback fires (wired to Sprint 3 Arena creation in next sprint)
// - Forking creates a linked child idea with parentIdeaId set
// - Comments are inline, real-time via Firestore
//
// =============================================================================
// SPRINT 3 PREVIEW — Collaboration Engine (Arenas)
// =============================================================================
//
// The onArenaLaunch callback in IdeaNetwork is the entry point for Sprint 3.
// When a user clicks "Launch Arena" on an arena_ready idea, it will:
//   1. Open an Arena creation flow pre-filled from the Idea
//   2. Create an arenas/{arenaId} document with the Idea as its brief
//   3. Call linkIdeaToArena(ideaId, arenaId) to update the idea's stage
//   4. The Arena runs as a phased, real-time collaborative event
//   5. On verdict, trust edges are written (Sprint 1 infrastructure)
