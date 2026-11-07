/**
 * lib/announcements.ts
 * Which site-wide notice (if any) a member should see right now. Pure, so it is tested
 * without a browser; components/AnnouncementBanner.tsx renders what this returns.
 */
export interface Announcement {
  id: string; title: string; body: string; severity: 'info' | 'warning' | 'critical';
  link: string | null; linkLabel: string | null; audience: 'all' | 'recruiters' | 'members';
  startsAt: number; endsAt: number; dismissible: boolean;
}

const RANK = { critical: 3, warning: 2, info: 1 } as const;

/** Live, meant for this member, not dismissed (unless it cannot be dismissed); the most serious first. */
export function pickAnnouncement(all: Announcement[], opts: { isRecruiter: boolean; dismissed: string[]; now: number }): Announcement | null {
  const live = all.filter(a =>
    a.startsAt <= opts.now && opts.now < a.endsAt &&
    (a.audience === 'all' || (a.audience === 'recruiters' ? opts.isRecruiter : !opts.isRecruiter)) &&
    !(a.dismissible && opts.dismissed.includes(a.id)));
  live.sort((x, y) => RANK[y.severity] - RANK[x.severity] || y.startsAt - x.startsAt);
  return live[0] ?? null;
}
