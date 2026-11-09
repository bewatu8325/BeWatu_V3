/**
 * lib/investorMembershipService.ts
 * The browser's way to talk to api/investor-membership.ts. The rules (statuses, entitlement, wording) are in
 * lib/investorMembership.ts; every check that matters is on the server. This file only moves data.
 */
import { auth } from './firebase';
import type { AppStatus, ApplicationForm, Approval, Entitlement, Membership } from './investorMembership';

export async function investorApi<T = any>(body: Record<string, unknown>): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in again.');
  let res: Response;
  try {
    res = await fetch('/api/investor-membership', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` }, body: JSON.stringify(body) });
  } catch { throw new Error('Could not reach BeWatu. Check your connection and try again.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e: any = new Error(data?.error ?? 'Something went wrong. Please try again.'); e.status = res.status; throw e; }
  return data;
}

export interface InvestorState {
  application: { id: string; status: AppStatus; form: ApplicationForm; applicantMessage: string | null; submittedAt: number | null; updatedAt: number | null; history: { atMs: number; action: string }[]; additionalInfo: { atMs: number; message: string }[] } | null;
  draft: { form: Partial<ApplicationForm>; updatedAt: number | null } | null;
  approval: Approval;
  membership: Membership & { hasCustomer: boolean; trialUsed: boolean };
  entitlement: Entitlement;
  cooldownUntil: number | null;
  price: { monthly: number; trialDays: number };
  graceDays: number;
  emailVerified: boolean;
}
export const fetchInvestorState = () => investorApi<InvestorState>({ action: 'state' });
