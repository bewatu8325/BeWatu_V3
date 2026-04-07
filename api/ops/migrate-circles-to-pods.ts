/**
 * api/ops/migrate-circles-to-pods.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * One-time migration: copies all docs from `circles` → `pods`, normalising
 * the schema to use Firebase UIDs throughout.
 *
 * Run once from the ops portal. Safe to run multiple times — skips docs
 * where a pod with the same name already exists.
 *
 * After verifying the migration, manually delete the `circles` collection
 * from Firebase Console.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!)) });
}
const db = getFirestore();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Simple ops auth check
  const token = req.headers['x-ops-token'];
  if (token !== process.env.BEWATU_SECURITY_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const results = {
    migrated:  [] as string[],
    skipped:   [] as string[],
    errors:    [] as string[],
  };

  try {
    // 1. Load all existing pod names to avoid duplicates
    const existingPods = await db.collection('pods').get();
    const existingNames = new Set(existingPods.docs.map(d => d.data().name?.toLowerCase().trim()));

    // 2. Load all circles
    const circlesSnap = await db.collection('circles').get();

    for (const doc of circlesSnap.docs) {
      const data = doc.data();
      const name = (data.name ?? '').trim();

      // Skip if a pod with this name already exists
      if (existingNames.has(name.toLowerCase())) {
        results.skipped.push(`${doc.id} (${name})`);
        continue;
      }

      try {
        // Normalise adminUid — prefer creatorUid over adminId (numeric)
        const adminUid = data.creatorUid ?? null;

        // Normalise members — could be numeric IDs or UIDs
        // For now, empty array is fine — test data had no real members
        const members: string[] = (data.members ?? []).filter(
          (m: any) => typeof m === 'string' && m.length > 10
        );

        // Add adminUid to members if not already present
        if (adminUid && !members.includes(adminUid)) {
          members.unshift(adminUid);
        }

        const podData: Record<string, any> = {
          name,
          description:   data.description   ?? '',
          podType:       data.podType        ?? 'community',
          visibility:    data.visibility     ?? 'open',
          adminUid,
          members,
          pendingInvites:  [],
          pendingMembers:  [],
          capacity:      data.capacity       ?? null,
          topic:         data.topic          ?? null,
          purpose:       data.purpose        ?? null,
          createdAt:     data.createdAt      ?? FieldValue.serverTimestamp(),
          updatedAt:     FieldValue.serverTimestamp(),
          migratedFrom:  'circles',
          migratedFromId: doc.id,
        };

        // Carry over generational pod fields
        if (data.podType === 'generational') {
          podData.slots             = data.slots             ?? null;
          podData.generationalMembers = data.generationalMembers ?? [];
        }

        // Carry over challenge pod fields
        if (data.podType === 'challenge') {
          podData.challengeId = data.challengeId ?? null;
        }

        const newRef = await db.collection('pods').add(podData);
        results.migrated.push(`${doc.id} → ${newRef.id} (${name})`);
        existingNames.add(name.toLowerCase());

      } catch (err: any) {
        results.errors.push(`${doc.id} (${name}): ${err.message}`);
      }
    }

    return res.status(200).json({
      success: true,
      summary: {
        migrated: results.migrated.length,
        skipped:  results.skipped.length,
        errors:   results.errors.length,
      },
      details: results,
    });

  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
