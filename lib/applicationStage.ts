/**
 * lib/applicationStage.ts
 *
 * Schema decision 2, part 2 (launch-readiness review): the `applications`
 * collection used to carry two independent vocabularies -- TalentPipeline's
 * `stage` (New Applicants/Sourced/Screening/Interview/Offer/Hired) and
 * ApplicantInbox's own `status` (new/reviewing/shortlisted/rejected/hired)
 * -- with no shared type or mapping anywhere, plus a `status: 'applied'`
 * value neither vocabulary actually recognized. That caused a live crash
 * (see ApplicantInbox's history) and silently-wrong recruiter analytics.
 *
 * `stage` is now the single canonical field. This file has zero Firestore
 * dependency so it can be imported from both client code (lib/, components/)
 * and Admin-SDK server code (api/*.ts) without pulling in either SDK.
 */

export type ApplicationStage =
  | 'New Applicants'
  | 'Sourced'
  | 'Screening'
  | 'Interview'
  | 'Offer'
  | 'Hired'
  | 'Rejected';

export const PIPELINE_STAGES: ApplicationStage[] = [
  'New Applicants', 'Sourced', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected',
];

const CANONICAL_STAGES = new Set<string>(PIPELINE_STAGES);

export function isApplicationStage(value: unknown): value is ApplicationStage {
  return typeof value === 'string' && CANONICAL_STAGES.has(value);
}

/**
 * Derives the canonical stage for an application document that may still
 * carry the pre-unification vocabulary. Used by the one-time migration
 * script (scripts/migrate-application-stage.mjs) to backfill `stage` for
 * real, and defensively at read time so nothing breaks for a document the
 * migration hasn't reached yet.
 */
export function deriveApplicationStage(data: {
  stage?: string | null;
  status?: string | null;
}): ApplicationStage {
  if (isApplicationStage(data.stage)) return data.stage;
  if (data.status === 'rejected') return 'Rejected';
  if (data.status === 'hired') return 'Hired';
  if (data.status === 'shortlisted') return 'Sourced';
  return 'New Applicants';
}
