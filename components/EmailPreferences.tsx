/**
 * components/EmailPreferences.tsx
 * The Settings card for email: one switch for product updates (news and new features). Turning it off is the same
 * as using the unsubscribe link in an update email, and turning it back on is resubscribing. Account, security and
 * policy messages are not optional and are said to be always sent.
 */
import React, { useEffect, useState } from 'react';
import { Mail, Loader2 } from 'lucide-react';
import { getProductUpdates, setProductUpdates } from '../lib/emailPreferences';

const GREEN = 'var(--bw-green)';

const EmailPreferences: React.FC = () => {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    let live = true;
    getProductUpdates().then(v => { if (live) setOn(v); }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, []);

  const toggle = async () => {
    if (on === null || busy) return;
    const next = !on;
    setBusy(true); setError(''); setSaved('');
    setOn(next);                                   // show it at once; put it back if it does not save
    try { setOn(await setProductUpdates(next)); setSaved(next ? 'You will get product updates.' : 'You will no longer get product updates.'); }
    catch (e: any) { setOn(!next); setError(e?.message ?? 'Could not save. Try again.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="bg-white rounded-2xl border p-5 sm:p-6 space-y-4" style={{ borderColor: '#e7e5e4' }}>
      <div className="flex items-center gap-2"><Mail size={16} className="text-stone-600" aria-hidden="true" /><h2 className="font-bold text-stone-900">Email</h2></div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p id="email-updates-label" className="text-sm font-semibold text-stone-900">Product updates</p>
          <p id="email-updates-hint" className="text-sm text-stone-600">News and new features from BeWatu, now and then.</p>
        </div>
        <button
          type="button" role="switch" aria-checked={!!on} aria-labelledby="email-updates-label" aria-describedby="email-updates-hint"
          disabled={on === null || busy} onClick={toggle}
          className="relative mt-0.5 inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60"
          style={{ backgroundColor: on ? GREEN : '#d6d3d1', ['--tw-ring-color' as any]: GREEN }}>
          <span className="sr-only">{on ? 'On' : 'Off'}</span>
          <span aria-hidden="true" className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-transform" style={{ transform: `translateX(${on ? 24 : 4}px)` }}>
            {(busy || on === null) && !error && <Loader2 size={12} className="animate-spin text-stone-500" />}
          </span>
        </button>
      </div>
      <p className="text-xs text-stone-600">Messages about your account, security, and our policies always reach you, whatever you choose here.</p>
      <p role="status" aria-live="polite" className="min-h-[1rem] text-xs text-emerald-700">{saved}</p>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </div>
  );
};

export default EmailPreferences;
