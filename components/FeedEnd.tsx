/**
 * components/FeedEnd.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * What the feed shows when there is nothing more to load: a short, friendly "you're caught up" message and, from
 * real data only, a few things worth doing next: pods you could join, people you are not yet connected to, and
 * organizations from the directory. Each list appears only if there is something real to put in it, and a member
 * with very little in their feed gets a gentler headline.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useEffect, useState } from 'react';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import { Circle, User, View } from '../types';
import { queryCompanies, type CompanyItem } from '../lib/companiesService';
import { CompanyLogo } from './companies/CompanyCard';
import { suggestPeople, suggestPods } from '../lib/feedSuggestions';

const GREEN = 'var(--bw-green)';

interface Props {
  postCount: number;
  circles: Circle[];
  users: User[];
  currentUser: User;
  /** Ids (numeric) of people this member is already connected to or has a request open with. */
  connectedIds: Set<number>;
  onSelectCircle: (circleId: number) => void;
  onViewProfile: (userId: number) => void;
  onViewCompany?: (companyId: number | string) => void;
  onNavigate: (view: View) => void;
}

const Section: React.FC<{ title: string; actionLabel: string; onAction: () => void; children: React.ReactNode }> = ({ title, actionLabel, onAction, children }) => (
  <section aria-label={title} className="border-t border-stone-100 pt-3 first:border-t-0 first:pt-0">
    <div className="mb-1 flex items-center justify-between">
      <h3 className="text-sm font-bold text-stone-900">{title}</h3>
      <button type="button" onClick={onAction} className="min-h-[44px] px-1 text-xs font-semibold hover:underline" style={{ color: GREEN }}>{actionLabel}</button>
    </div>
    <ul className="-mx-1">{children}</ul>
  </section>
);

const Item: React.FC<{ lead: React.ReactNode; title: string; sub?: string; onClick: () => void }> = ({ lead, title, sub, onClick }) => (
  <li>
    <button type="button" onClick={onClick} className="flex min-h-[52px] w-full items-center gap-3 rounded-xl px-1 py-1.5 text-left hover:bg-stone-50 active:bg-stone-100 focus:outline-none focus-visible:ring-2" style={{ ['--tw-ring-color' as any]: GREEN }}>
      {lead}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-stone-900">{title}</span>
        {sub && <span className="block truncate text-xs text-stone-600">{sub}</span>}
      </span>
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-stone-400" aria-hidden="true" />
    </button>
  </li>
);

const Avatar: React.FC<{ name: string; src?: string }> = ({ name, src }) => src
  ? <img src={src} alt="" loading="lazy" className="h-10 w-10 flex-shrink-0 rounded-full object-cover" />
  : <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: GREEN }}>{name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</span>;

const FeedEnd: React.FC<Props> = ({ postCount, circles, users, currentUser, connectedIds, onSelectCircle, onViewProfile, onViewCompany, onNavigate }) => {
  const [orgs, setOrgs] = useState<CompanyItem[]>([]);
  useEffect(() => {
    let live = true;
    // The directory's own "For You" list: real organizations, chosen from this member's profile when it can.
    queryCompanies({ view: 'for_you', q: '', industry: '', category: '', organizationType: '', country: '', filters: {}, sort: 'relevance' })
      .then(r => { if (live) setOrgs(r.items.slice(0, 3)); })
      .catch(() => { /* suggestions are optional */ });
    return () => { live = false; };
  }, []);

  const pods = suggestPods(circles, currentUser);
  const people = suggestPeople(users, currentUser, connectedIds);
  const sparse = postCount < 5;
  const hasSuggestions = pods.length + people.length + orgs.length > 0;

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5" style={{ borderColor: '#e7e5e4' }} aria-label="End of feed">
      <div className="mb-3 flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0" style={{ color: GREEN }} aria-hidden="true" />
        <div>
          <p className="text-sm font-bold text-stone-900">{sparse ? 'Your feed is just getting started' : "You're all caught up"}</p>
          <p className="text-xs text-stone-600">
            {sparse
              ? (hasSuggestions ? 'Follow and join a few of these to see more here.' : 'Connect with people or share something to get it going.')
              : (hasSuggestions ? 'Here are a few places to find more.' : 'Check back soon for new posts.')}
          </p>
        </div>
      </div>
      {hasSuggestions && (
        <div className="space-y-3">
          {people.length > 0 && (
            <Section title="People to know" actionLabel="See all" onAction={() => onNavigate(View.People)}>
              {people.map(u => <Item key={u.id} lead={<Avatar name={u.name} src={u.avatarUrl} />} title={u.name} sub={u.headline || u.industry} onClick={() => onViewProfile(u.id)} />)}
            </Section>
          )}
          {pods.length > 0 && (
            <Section title="Pods you could join" actionLabel="See all" onAction={() => onNavigate(View.Circles)}>
              {pods.map(c => <Item key={c.id} lead={<span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-stone-100 text-xs font-bold text-stone-600">{c.name.slice(0, 2).toUpperCase()}</span>}
                title={c.name} sub={`${c.members.length} member${c.members.length === 1 ? '' : 's'}`} onClick={() => onSelectCircle(c.id)} />)}
            </Section>
          )}
          {orgs.length > 0 && (
            <Section title="Organizations to follow" actionLabel="See all" onAction={() => onNavigate(View.Companies)}>
              {orgs.map(o => <Item key={o.id} lead={<CompanyLogo name={o.name} logoUrl={o.logoUrl} size={40} />} title={o.name} sub={o.industry || undefined} onClick={() => onViewCompany?.(o.id)} />)}
            </Section>
          )}
        </div>
      )}
    </div>
  );
};

export default FeedEnd;
