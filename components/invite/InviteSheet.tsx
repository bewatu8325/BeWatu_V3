/**
 * components/invite/InviteSheet.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * "Bring your people." The one invitation component used everywhere: a bottom sheet on a phone, a dialog on a wide screen.
 * Entry points never build their own: they call requestIntent('invite', { invite: { purpose, targetId, targetName } }) (see
 * InviteButton) and InviteHost opens this with that purpose and destination already chosen.
 *
 * Two ways to invite, both explicit: type email addresses (we email only those), or copy/share a personal link yourself. There is
 * no contact import. The link is made as soon as the sheet knows where it points, so that Share can run straight from the tap
 * (phones only allow the share sheet from a tap, not after a wait); a link nobody shares is not counted as an invitation.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Loader2, Mail, Share2 } from 'lucide-react';
import BottomSheet from '../mobile/BottomSheet';
import { InviteIcon } from '../icons/NavIcons';
import YourInvitations from './YourInvitations';
import {
  PURPOSES, defaultMessage, invite, parseEmails, resultText, type CreateEmailResponse, type InvitationView, type InviteContext, type InvitePurpose, MAX_EMAILS,
} from '../../lib/invitations';
import { loadChallenges } from '../../lib/arenaClient';
import { isOpen, type ChallengeLite } from '../../lib/arenaDiscovery';

const GREEN = 'var(--bw-green)';
const GREEN_LT = 'var(--bw-green-light)';
const RING = { ['--tw-ring-color' as any]: GREEN };

export interface PodOption { id: string; name: string; podType?: string }
interface Props { open: boolean; onClose: () => void; context: InviteContext; myName: string; pods: PodOption[] }

type Tab = 'invite' | 'list';
type Note = { kind: 'ok' | 'error'; text: string };

export const InviteSheet: React.FC<Props> = ({ open, onClose, context, myName, pods }) => {
  const [tab, setTab] = useState<Tab>('invite');
  const [purpose, setPurpose] = useState<InvitePurpose>(context.purpose);
  const [targetId, setTargetId] = useState<string>(context.targetId ?? '');
  const [challenges, setChallenges] = useState<ChallengeLite[] | null>(null);
  const [message, setMessage] = useState('');
  const edited = useRef(false);
  const [emails, setEmails] = useState('');
  const [reminder, setReminder] = useState(false);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<CreateEmailResponse['results']>([]);
  const [emailError, setEmailError] = useState('');
  const [link, setLink] = useState<InvitationView | null>(null);
  const [linkState, setLinkState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [linkError, setLinkError] = useState('');
  const [note, setNote] = useState<Note | null>(null);
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof (navigator as any).share === 'function';

  // Each opening starts from what was asked for.
  useEffect(() => {
    if (!open) return;
    setTab('invite'); setPurpose(context.purpose); setTargetId(context.targetId ?? ''); setEmails(''); setResults([]); setEmailError(''); setNote(null); setCopied(false);
    edited.current = false;
  }, [open, context.purpose, context.targetId]);

  useEffect(() => {
    if (!open || purpose !== 'arena' || challenges) return;
    let live = true;
    loadChallenges().then(c => { if (live) setChallenges(c.filter(x => isOpen(x))); }).catch(() => { if (live) setChallenges([]); });
    return () => { live = false; };
  }, [open, purpose, challenges]);

  const podChoices = useMemo(() => {
    const list = purpose === 'community' ? pods.filter(p => p.podType === 'community') : purpose === 'pod' ? pods.filter(p => p.podType !== 'community') : [];
    // The destination that was asked for stays selectable even if it is not in my list (for example a public Pod I am not in).
    if (targetId && context.targetName && !list.some(p => p.id === targetId) && (purpose === 'community' || purpose === 'pod')) return [{ id: targetId, name: context.targetName }, ...list];
    return list;
  }, [pods, purpose, targetId, context.targetName]);
  const choices: { id: string; name: string }[] = purpose === 'arena' ? (challenges ?? []).map(c => ({ id: c.id, name: c.title })) : podChoices;
  const targetName = choices.find(c => c.id === targetId)?.name ?? (targetId && targetId === context.targetId ? context.targetName ?? null : null);

  // The first draft follows the purpose and destination until the member starts writing their own.
  useEffect(() => {
    if (!open || edited.current) return;
    setMessage(defaultMessage(purpose, { name: myName, targetName }));
  }, [open, purpose, targetName, myName]);

  // The personal link: made as soon as we know where it points; the same link comes back for the same destination.
  const prepare = useCallback(async () => {
    setLinkState('loading'); setLinkError('');
    try {
      const r = await invite<{ invitation: InvitationView }>({ action: 'create', kind: 'link', purpose, targetId: targetId || null });
      setLink(r.invitation); setLinkState('ready');
    } catch (e: any) { setLink(null); setLinkState('error'); setLinkError(e.message); }
  // The note goes with the link when it is shared (see report), so typing never remakes it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purpose, targetId]);
  useEffect(() => { if (open && tab === 'invite') void prepare(); }, [open, tab, prepare]);

  const choosePurpose = (p: InvitePurpose) => { if (p === purpose) return; setPurpose(p); setTargetId(''); setResults([]); setNote(null); };

  const report = (channel: 'copy' | 'native') => { if (link) invite({ action: 'shared', id: link.id, channel, message }).catch(() => {}); };

  const copy = async () => {
    if (!link?.url) return;
    setNote(null);
    try { await navigator.clipboard.writeText(link.url); setCopied(true); setNote({ kind: 'ok', text: 'Link copied. Paste it into a message to your people.' }); report('copy'); setTimeout(() => setCopied(false), 2500); }
    catch {
      // Some browsers refuse the clipboard; the link is shown in full so it can be selected.
      setNote({ kind: 'error', text: 'Your browser would not copy it. Select the link above and copy it.' });
    }
  };
  const share = async () => {
    if (!link?.url) return;
    setNote(null);
    try {
      await (navigator as any).share({ title: 'Join me on BeWatu', text: message.trim() || undefined, url: link.url });
      setNote({ kind: 'ok', text: 'Shared.' }); report('native');
    } catch (e: any) { if (e?.name !== 'AbortError') setNote({ kind: 'error', text: 'Sharing didn\'t work here. Copy the link instead.' }); }
  };

  const parsed = parseEmails(emails);
  const send = async () => {
    setEmailError(''); setResults([]); setNote(null);
    if (parsed.valid.length === 0) { setEmailError(parsed.invalid.length ? `${parsed.invalid[0]} doesn't look like an email address.` : 'Add at least one email address.'); return; }
    if (parsed.tooMany) { setEmailError(`Invite up to ${MAX_EMAILS} people at a time.`); return; }
    setSending(true);
    try {
      const r = await invite<CreateEmailResponse>({ action: 'create', kind: 'email', purpose, targetId: targetId || null, emails: parsed.valid, message, reminder });
      setResults([...r.results, ...parsed.invalid.map(e => ({ email: e, result: 'invalid' as const }))]);
      if (r.results.some(x => x.result === 'sent')) setEmails('');
    } catch (e: any) { setEmailError(e.message); }
    finally { setSending(false); }
  };

  const hint = PURPOSES.find(p => p.id === purpose)!.hint;
  const needsTarget = purpose !== 'connect';

  return (
    <BottomSheet open={open} onClose={onClose} title="Bring your people." allWidths>
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: GREEN_LT, color: GREEN }}><InviteIcon className="h-5 w-5" /></span>
        <p className="text-sm text-stone-700">Good connections make great things possible.</p>
      </div>

      <div role="tablist" aria-label="Invitations" className="mb-4 flex rounded-xl bg-stone-100 p-1">
        {([['invite', 'Invite'], ['list', 'Your invitations']] as [Tab, string][]).map(([id, label]) => (
          <button key={id} type="button" role="tab" id={`inv-tab-${id}`} aria-selected={tab === id} aria-controls={`inv-panel-${id}`} onClick={() => setTab(id)}
            className={`min-h-[40px] flex-1 rounded-lg px-3 text-sm font-semibold focus:outline-none focus-visible:ring-2 ${tab === id ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'}`} style={RING}>{label}</button>
        ))}
      </div>

      {tab === 'list' ? (
        <div role="tabpanel" id="inv-panel-list" aria-labelledby="inv-tab-list"><YourInvitations active={open} /></div>
      ) : (
        <div role="tabpanel" id="inv-panel-invite" aria-labelledby="inv-tab-invite" className="space-y-5">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-stone-900">What are you inviting them to?</legend>
            <div className="grid grid-cols-2 gap-2" role="radiogroup">
              {PURPOSES.map(p => {
                const on = p.id === purpose;
                return (
                  <button key={p.id} type="button" role="radio" aria-checked={on} onClick={() => choosePurpose(p.id)}
                    className="flex min-h-[48px] items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm font-semibold focus:outline-none focus-visible:ring-2"
                    style={{ ...RING, borderColor: on ? GREEN : '#e7e5e4', backgroundColor: on ? GREEN_LT : '#fff', color: on ? GREEN : '#44403c' }}>
                    <span>{p.label}</span>{on && <Check className="h-4 w-4 flex-shrink-0" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-stone-600">{hint}.</p>
          </fieldset>

          {needsTarget && (
            <div>
              <label htmlFor="inv-target" className="mb-1.5 block text-sm font-semibold text-stone-900">
                {purpose === 'arena' ? 'Which challenge?' : purpose === 'community' ? 'Which community?' : 'Which Pod?'} <span className="font-normal text-stone-600">(optional)</span>
              </label>
              <select id="inv-target" value={targetId} onChange={e => setTargetId(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border bg-white px-3 text-sm text-stone-900 focus:outline-none focus-visible:ring-2" style={{ ...RING, borderColor: '#d6d3d1' }}>
                <option value="">{purpose === 'arena' ? 'Arenas in general' : purpose === 'community' ? 'The Community page' : 'Pods in general'}</option>
                {choices.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {purpose === 'arena' && challenges === null && <p className="mt-1 text-xs text-stone-600">Loading challenges...</p>}
              {purpose !== 'arena' && choices.length === 0 && <p className="mt-1 text-xs text-stone-600">You're not in a {purpose === 'community' ? 'community' : 'Pod'} yet, so they'll land on the {purpose === 'community' ? 'Community page' : 'Pods page'}.</p>}
            </div>
          )}

          <div>
            <label htmlFor="inv-message" className="mb-1.5 flex items-baseline justify-between text-sm font-semibold text-stone-900">
              <span>Your message</span><span className="text-xs font-normal text-stone-600">{message.length}/500</span>
            </label>
            <textarea id="inv-message" rows={3} maxLength={500} value={message} onChange={e => { edited.current = true; setMessage(e.target.value); }}
              className="w-full resize-none rounded-xl border bg-white p-3 text-[15px] leading-relaxed text-stone-900 focus:outline-none focus-visible:ring-2" style={{ ...RING, borderColor: '#d6d3d1' }} />
            {edited.current && (
              <button type="button" onClick={() => { edited.current = false; setMessage(defaultMessage(purpose, { name: myName, targetName })); }}
                className="mt-1 min-h-[32px] text-xs font-semibold underline focus:outline-none focus-visible:ring-2" style={{ color: GREEN, ...RING }}>Use the suggested message</button>
            )}
          </div>

          <section aria-labelledby="inv-email-h" className="rounded-2xl border p-3" style={{ borderColor: '#e7e5e4' }}>
            <h3 id="inv-email-h" className="mb-2 flex items-center gap-2 text-sm font-semibold text-stone-900"><Mail className="h-4 w-4" style={{ color: GREEN }} aria-hidden="true" />Invite by email</h3>
            <label htmlFor="inv-emails" className="sr-only">Email addresses</label>
            <input id="inv-emails" type="text" inputMode="email" autoComplete="off" autoCapitalize="none" spellCheck={false} value={emails} onChange={e => setEmails(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void send(); } }}
              placeholder="name@company.com"
              aria-invalid={!!emailError} aria-describedby="inv-email-help"
              className="min-h-[44px] w-full rounded-xl border bg-white px-3 text-[15px] text-stone-900 focus:outline-none focus-visible:ring-2" style={{ ...RING, borderColor: emailError ? '#b91c1c' : '#d6d3d1' }} />
            <p id="inv-email-help" className="mt-1.5 text-xs text-stone-600">Up to {MAX_EMAILS} people. We email only the addresses you type here; we never read your contacts.</p>
            <label className="mt-2 flex min-h-[44px] cursor-pointer items-center gap-3 text-sm text-stone-700">
              <input type="checkbox" checked={reminder} onChange={e => setReminder(e.target.checked)} className="h-5 w-5 rounded accent-[var(--bw-green)]" />
              Send one gentle reminder in a few days if they haven't looked
            </label>
            {emailError && <p role="alert" className="mt-1 text-sm font-medium text-red-700">{emailError}</p>}
            <button type="button" onClick={send} disabled={sending || !emails.trim()}
              className="mt-2 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-white focus:outline-none focus-visible:ring-2 disabled:opacity-50" style={{ backgroundColor: GREEN, ...RING }}>
              {sending ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Sending...</> : 'Send invitation'}
            </button>
            {results.length > 0 && (
              <ul role="status" aria-live="polite" className="mt-3 space-y-1.5">
                {results.map((r, i) => { const t = resultText(r); return (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: t.ok ? '#166534' : '#b91c1c' }}>
                    <span aria-hidden="true" className="mt-0.5">{t.ok ? '✓' : '!'}</span><span>{t.text}</span>
                  </li>
                ); })}
              </ul>
            )}
          </section>

          <section aria-labelledby="inv-link-h" className="rounded-2xl border p-3" style={{ borderColor: '#e7e5e4' }}>
            <h3 id="inv-link-h" className="mb-2 flex items-center gap-2 text-sm font-semibold text-stone-900"><Copy className="h-4 w-4" style={{ color: GREEN }} aria-hidden="true" />Share your personal link</h3>
            <div className="mb-2 min-h-[44px] break-all rounded-xl bg-stone-50 px-3 py-2.5 text-[13px] text-stone-700" aria-live="polite">
              {linkState === 'loading' && <span className="inline-flex items-center gap-2 text-stone-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Making your link...</span>}
              {linkState === 'ready' && link?.url}
              {linkState === 'error' && <span className="text-red-700" role="alert">{linkError} <button type="button" onClick={() => void prepare()} className="font-semibold underline">Try again</button></span>}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={copy} disabled={linkState !== 'ready'}
                className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-bold focus:outline-none focus-visible:ring-2 disabled:opacity-50" style={{ ...RING, borderColor: GREEN, color: GREEN }}>
                {copied ? <><Check className="h-4 w-4" aria-hidden="true" />Copied</> : <><Copy className="h-4 w-4" aria-hidden="true" />Copy link</>}
              </button>
              {canShare && (
                <button type="button" onClick={share} disabled={linkState !== 'ready'}
                  className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-white focus:outline-none focus-visible:ring-2 disabled:opacity-50" style={{ backgroundColor: GREEN, ...RING }}>
                  <Share2 className="h-4 w-4" aria-hidden="true" />Share...
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-stone-600">Anyone with this link can see your invitation. It expires in 30 days, and you can withdraw it under Your invitations.</p>
            {note && <p role={note.kind === 'error' ? 'alert' : 'status'} className="mt-2 text-sm font-medium" style={{ color: note.kind === 'ok' ? '#166534' : '#b91c1c' }}>{note.text}</p>}
          </section>
        </div>
      )}
    </BottomSheet>
  );
};

export default InviteSheet;
