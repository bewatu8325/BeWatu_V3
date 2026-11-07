/**
 * components/AnnouncementBanner.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A site-wide notice from BeWatu staff (sent from the ops console's Communications
 * module), shown under the header while it is live. Reads site_announcements,
 * which only the server can write.
 *
 * What shows: active, inside its start/end time, meant for this member (everyone,
 * recruiters, or members), and not already dismissed on this device. The most
 * serious one wins. A critical notice may be made un-dismissable by the sender.
 * Text is rendered as plain text, and the link must be https.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useCallback, useEffect, useState } from 'react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { AlertTriangle, Info, Megaphone, X } from 'lucide-react';
import { db } from '../lib/firebase';
import { useFirebase } from '../contexts/FirebaseContext';
import { pickAnnouncement, type Announcement } from '../lib/announcements';

const KEY = 'bw_dismissed_announcements';
const REFRESH_MS = 5 * 60_000;
const readDismissed = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; } };
const writeDismissed = (ids: string[]) => { try { localStorage.setItem(KEY, JSON.stringify(ids.slice(-50))); } catch { /* storage unavailable */ } };
const ms = (v: any): number => (typeof v?.toMillis === 'function' ? v.toMillis() : typeof v?.seconds === 'number' ? v.seconds * 1000 : NaN);
const safeLink = (raw: unknown): string | null => { try { const u = new URL(String(raw)); return u.protocol === 'https:' && !u.username && !u.password ? u.toString() : null; } catch { return null; } };

export default function AnnouncementBanner() {
  const { currentUser, fbUser } = useFirebase();
  const [items, setItems] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'site_announcements'), where('active', '==', true), limit(10)));
      setItems(snap.docs.map(d => {
        const x = d.data();
        return {
          id: d.id, title: String(x.title ?? '').slice(0, 120), body: String(x.body ?? '').slice(0, 600),
          severity: (['info', 'warning', 'critical'] as const).includes(x.severity) ? x.severity : 'info',
          link: safeLink(x.link), linkLabel: x.linkLabel ? String(x.linkLabel).slice(0, 40) : null,
          audience: (['all', 'recruiters', 'members'] as const).includes(x.audience) ? x.audience : 'all',
          startsAt: ms(x.startsAt), endsAt: ms(x.endsAt), dismissible: x.dismissible !== false,
        } as Announcement;
      }).filter(a => Number.isFinite(a.startsAt) && Number.isFinite(a.endsAt)));
    } catch { setItems([]); }   // no data -> no banner, never a stale or guessed one
  }, []);

  useEffect(() => {
    if (!fbUser) return;
    load();
    const t = setInterval(() => { load(); setNow(Date.now()); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [fbUser, load]);

  const a = pickAnnouncement(items, { isRecruiter: !!(currentUser as any)?.isRecruiter, dismissed, now });
  if (!a) return null;

  const tone = {
    info:     { bg: '#e8f4f0', border: '#b6ddd2', fg: '#14513f', Icon: Megaphone },
    warning:  { bg: '#fef3c7', border: '#fcd34d', fg: '#78350f', Icon: Info },
    critical: { bg: '#fee2e2', border: '#fca5a5', fg: '#7f1d1d', Icon: AlertTriangle },
  }[a.severity];

  return (
    <div role={a.severity === 'critical' ? 'alert' : 'status'} className="border-b px-4 py-2.5" style={{ backgroundColor: tone.bg, borderColor: tone.border, color: tone.fg }}>
      <div className="mx-auto flex max-w-6xl items-start gap-3">
        <tone.Icon size={18} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm leading-snug">
          <strong className="font-semibold">{a.title}</strong>{' '}
          <span>{a.body}</span>
          {a.link && <> <a href={a.link} target="_blank" rel="noopener noreferrer" className="font-semibold underline">{a.linkLabel ?? 'Learn more'}</a></>}
        </p>
        {a.dismissible && (
          <button type="button" aria-label="Dismiss notice" onClick={() => { const next = [...dismissed, a.id]; setDismissed(next); writeDismissed(next); }}
            className="flex-shrink-0 rounded-md p-1 hover:bg-black/5 focus:outline-none focus-visible:ring-2">
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
