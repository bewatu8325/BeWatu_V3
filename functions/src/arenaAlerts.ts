/**
 * functions/src/arenaAlerts.ts
 * Who is told when an Arena challenge goes live. Pure (no Firebase imports) so it can be tested from the repo root.
 *
 * A member is told when ALL of these are true: they follow the challenge's industry, they turned notifications on
 * (following alone never sends anything), and they are not the person who posted it.
 */

export interface ChallengeLike { verificationStatus?: unknown; arenaIndustry?: unknown; title?: unknown; companyName?: unknown; recruiterId?: unknown }

/** True only on the change TO live: a create that is already live, or an update from some other status. */
export function wentLive(before: ChallengeLike | undefined, after: ChallengeLike | undefined): boolean {
  return after?.verificationStatus === "live" && before?.verificationStatus !== "live";
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v : "").replace(/\s+/g, " ").trim().slice(0, max);

export function alertFor(challengeId: string, c: ChallengeLike): { industry: string; companyName: string; message: string } {
  const industry = clean(c.arenaIndustry, 40);
  const companyName = clean(c.companyName, 80);
  const title = clean(c.title, 120);
  return { industry, companyName, message: (companyName ? companyName + " posted a new challenge: " : "A new challenge is live: ") + title };
}

export function wantsAlert(user: { arenaFollows?: unknown; arenaNotify?: unknown }, industry: string, posterUid: unknown, uid: string): boolean {
  return user.arenaNotify === true
    && Array.isArray(user.arenaFollows) && user.arenaFollows.includes(industry)
    && !!industry && uid !== posterUid;
}
