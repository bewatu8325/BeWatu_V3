/**
 * components/arenas/BecomeSponsorModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * "Become a sponsor" from the Arena directory or an Arena page. Only a company's
 * administrator can ask, so this finds the companies the signed-in person
 * administers: with one it opens the request form for the chosen Arena, with
 * several it asks which, with none it explains what to do first.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { auth } from '../../lib/firebase';
import { fetchCompaniesIAdminister } from '../../lib/arenaSponsorshipService';
import { useModalA11y } from '../../hooks/useModalA11y';
import SponsorshipManager from './SponsorshipManager';

const GREEN = 'var(--bw-green)';

export default function BecomeSponsorModal({ arenaId, arenaName, onClose }: { arenaId: string; arenaName: string; onClose: () => void }) {
  const [companies, setCompanies] = useState<{ id: string; name: string }[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, onClose);
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) { setCompanies([]); return; }
    fetchCompaniesIAdminister(uid)
      .then(list => { setCompanies(list); if (list.length === 1) setChosen(list[0].id); })
      .catch(() => { setError(true); setCompanies([]); });
  }, [uid]);

  const company = companies?.find(c => c.id === chosen);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`Become a sponsor of the ${arenaName}`} tabIndex={-1}
        className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-stone-900">Become a sponsor of the {arenaName}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-stone-600 hover:bg-stone-100"><X size={18} /></button>
        </div>

        {companies === null && <div className="flex items-center gap-2 p-6 text-sm text-stone-600"><Loader2 size={16} className="animate-spin" /> Checking your companies…</div>}

        {companies !== null && companies.length === 0 && (
          <div className="space-y-3 text-sm text-stone-700">
            <p>{error ? 'We could not check your companies just now. Please try again in a moment.' : 'Only a company’s administrator can sponsor an Arena, and you don’t administer a company on BeWatu yet.'}</p>
            {!error && <p>Create or claim your company profile first, then come back here. Questions? Write to <a className="underline" style={{ color: GREEN }} href="mailto:support@bewatu.com">support@bewatu.com</a>.</p>}
            <button type="button" onClick={onClose} className="rounded-xl border border-stone-300 px-4 py-2 font-semibold hover:bg-stone-50">Close</button>
          </div>
        )}

        {companies && companies.length > 1 && !chosen && (
          <div>
            <p className="mb-3 text-sm text-stone-700">Which company is sponsoring?</p>
            <div className="flex flex-wrap gap-2">
              {companies.map(c => <button key={c.id} type="button" onClick={() => setChosen(c.id)} className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold hover:bg-stone-50">{c.name}</button>)}
            </div>
          </div>
        )}

        {company && uid && <SponsorshipManager companyId={company.id} companyName={company.name} uid={uid} initialArenaId={arenaId} />}
      </div>
    </div>
  );
}
